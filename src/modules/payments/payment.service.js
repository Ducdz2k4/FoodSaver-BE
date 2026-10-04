import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';

export const PaymentService = {
  /**
   * Tạo bản ghi Payment
   */
  async createPayment({ orderId, amount, method, idempotencyKey }) {
    return prisma.$transaction(async (tx) => {
      // Kiểm tra xem đã có payment cho order chưa
      if (idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: { idempotencyKey }
        });
        if (existing) return existing;
      }

      const payment = await tx.payment.create({
        data: {
          orderId,
          amount: Number(amount),
          method: method.toUpperCase(), // ONLINE or CASH
          status: 'PENDING',
          idempotencyKey: idempotencyKey || `pay_${orderId}_${Date.now()}`
        }
      });

      return payment;
    });
  },

  /**
   * Xử lý Webhook thanh toán Online từ Cổng thanh toán (VietQR / VNPay / MoMo)
   * Chống trùng lặp (Idempotent) & Giữ tiền vào Escrow
   */
  async processOnlineWebhook({
    orderId,
    gatewayTransactionId,
    amount,
    signature,
    idempotencyKey
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Kiểm tra đơn hàng
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          listing: { include: { partner: true } },
          payments: true
        }
      });

      if (!order) {
        throw ApiError.notFound('Không tìm thấy đơn hàng cho webhook');
      }

      // 2. Chống lặp giao dịch (Idempotency Check)
      if (gatewayTransactionId) {
        const existingTx = await tx.payment.findUnique({
          where: { gatewayTransactionId }
        });
        if (existingTx && existingTx.status === 'PAID') {
          console.log(`[Payment Webhook Duplicate] Transaction ${gatewayTransactionId} already paid. Skipping.`);
          return { success: true, message: 'Giao dịch đã được xử lý trước đó', payment: existingTx };
        }
      }

      // 3. Trường hợp biên: Webhook đến muộn khi đơn đã bị HỦY hoặc HẾT HẠN
      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        console.warn(`[Payment Late Webhook] Order #${order.orderNumber} was ${order.status}. Route funds to refund!`);
        
        // Vẫn ghi nhận tiền vào Escrow rồi tự động tạo lệnh Hoàn tiền (Refund)
        await LedgerService.recordOnlineEscrow({
          orderId: order.id,
          amount,
          idempotencyKey: `escrow_${gatewayTransactionId || idempotencyKey}`
        });

        await LedgerService.recordRefund({
          orderId: order.id,
          amount,
          isPreSettlement: true,
          idempotencyKey: `refund_late_${gatewayTransactionId || idempotencyKey}`
        });

        return {
          success: true,
          message: 'Đơn hàng đã hết hạn trước khi thanh toán, hệ thống đã tự động chuyển tiền vào hàng đợi hoàn tiền',
          refunded: true
        };
      }

      // 4. Cập nhật trạng thái Payment sang PAID
      let payment = order.payments.find(p => p.status === 'PENDING') || order.payments[0];

      if (payment) {
        payment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            gatewayTransactionId,
            paidAt: new Date(),
            gatewayResponse: { gatewayTransactionId, amount, signature }
          }
        });
      } else {
        payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: Number(amount),
            method: 'ONLINE',
            status: 'PAID',
            gatewayTransactionId,
            paidAt: new Date(),
            gatewayResponse: { gatewayTransactionId, amount, signature },
            idempotencyKey: idempotencyKey || `pay_${gatewayTransactionId}`
          }
        });
      }

      // 5. Ghi sổ kép: Chuyển tiền từ Gateway vào ESCROW
      await LedgerService.recordOnlineEscrow({
        orderId: order.id,
        amount,
        idempotencyKey: `escrow_${gatewayTransactionId || idempotencyKey}`
      });

      // 6. Cập nhật Order status sang PAID & paymentStatus sang PAID
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: order.status === 'PENDING' ? 'PAID' : order.status
        }
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus: updatedOrder.status,
          changedBy: 'PAYMENT_WEBHOOK',
          note: `Khách đã thanh toán trực tuyến thành công (${Number(amount).toLocaleString('vi-VN')}đ) - Tiền đã vào Escrow an toàn`
        }
      });

      // 7. Bắn realtime event tới Quán và Khách
      emitToPartner(order.listing.partnerId, 'PAYMENT_SUCCESS', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: Number(amount),
        method: 'ONLINE'
      });

      emitToUser(order.customerId, 'PAYMENT_SUCCESS', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: Number(amount)
      });

      return { success: true, payment, order: updatedOrder };
    });
  }
};
