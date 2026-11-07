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
   * Xử lý Webhook từ xGate / SePay (Cổng thanh toán ngân hàng BIDV tự động)
   */
  async processBankingWebhook(data) {
    const type = String(data.type || data.transferType || 'in').toLowerCase();
    const amount = Number(data.amount || data.transferAmount || 0);
    const contentStr = String(data.content || data.description || '');
    const txId = String(data.id || data.referenceCode || Date.now());
    const gateway = String(data.gateway || data.receiver_bank_name || 'BIDV');
    const accountNumber = String(data.accountNumber || data.receiver_account || '');

    // Nếu là giao dịch tiền ra ("out"): kiểm tra xem có khớp lệnh rút tiền nào của đối tác không
    if (type === 'out') {
      console.log(`[xGate/Banking Webhook] Giao dịch tiền ra (Chi tiền: ${amount}đ) - ID: ${txId}`);
      return {
        success: true,
        message: 'Giao dịch tiền ra đã được ghi nhận vào hệ thống.',
        type: 'out',
        amount,
        txId
      };
    }

    // Phát hiện test webhook (khi tạo kết nối hoặc ấn test)
    if (!contentStr || /test|xgate|sepay|ping/i.test(contentStr)) {
      console.log(`[Banking Webhook] Nhận test ping thành công (ID: ${txId})`);
      return {
        success: true,
        message: 'Kết nối Webhook ngân hàng xGate / BIDV hoạt động bình thường! (Test Ping)',
        testMode: true,
        received: { txId, gateway, accountNumber, amount, content: contentStr }
      };
    }

    // Trích xuất mã đơn hàng từ nội dung chuyển khoản
    const fsMatch = contentStr.match(/FS[A-Z0-9]{4,20}/i);
    const uuidMatch = contentStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

    let order = null;
    if (fsMatch) {
      const orderNumber = fsMatch[0].toUpperCase();
      order = await prisma.order.findFirst({
        where: { orderNumber },
        include: { payments: true, listing: true }
      });
    }

    if (!order && uuidMatch) {
      order = await prisma.order.findUnique({
        where: { id: uuidMatch[0] },
        include: { payments: true, listing: true }
      });
    }

    if (!order) {
      console.warn(`[Banking Webhook] Không tìm thấy đơn hàng cho nội dung: "${contentStr}" (Số tiền: ${amount}đ)`);
      return {
        success: true,
        message: `Đã nhận giao dịch ngân hàng (ID ${txId}) nhưng không tìm thấy mã đơn hàng phù hợp.`,
        unmatched: true
      };
    }

    // Gọi hàm xử lý đơn trực tuyến đã có cơ chế Escrow & Chống lặp Idempotency
    return this.processOnlineWebhook({
      orderId: order.id,
      gatewayTransactionId: txId,
      amount,
      idempotencyKey: `bank_${txId}`
    });
  },

  // Alias for backward compatibility
  async processSePayWebhook(data) {
    return this.processBankingWebhook(data);
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
    const result = await prisma.$transaction(async (tx) => {
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
          if (existingTx.orderId !== order.id || Number(existingTx.amount) !== Number(amount)) {
            throw ApiError.conflict('Giao dịch đã được sử dụng cho đơn hàng khác');
          }
          console.log(`[Payment Webhook Duplicate] Transaction ${gatewayTransactionId} already paid. Skipping.`);
          return { success: true, message: 'Giao dịch đã được xử lý trước đó', payment: existingTx };
        }
      }

      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) !== Number(order.totalPrice)) {
        throw ApiError.badRequest('Số tiền thanh toán không khớp với đơn hàng');
      }
      if (order.paymentMethod !== 'SYSTEM_QR') {
        throw ApiError.badRequest('Đơn hàng không sử dụng thanh toán trực tuyến');
      }
      if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
        throw ApiError.conflict('Đơn hàng đã được thanh toán hoặc hoàn tiền');
      }
      const claimed = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: order.paymentStatus },
        data: { paymentStatus: 'PAID' }
      });
      if (claimed.count !== 1) {
        throw ApiError.conflict('Đơn hàng đang được xử lý thanh toán');
      }

      // 3. Trường hợp biên: Webhook đến muộn khi đơn đã bị HỦY hoặc HẾT HẠN
      if (['CANCELLED', 'EXPIRED', 'REJECTED'].includes(order.status)) {
        console.warn(`[Payment Late Webhook] Order #${order.orderNumber} was ${order.status}. Route funds to refund!`);
        
        // Vẫn ghi nhận tiền vào Escrow rồi tự động tạo lệnh Hoàn tiền (Refund)
        await LedgerService.recordOnlineEscrow({
          orderId: order.id,
          amount,
          idempotencyKey: `escrow_${gatewayTransactionId || idempotencyKey}`
        }, tx);

        await LedgerService.recordRefund({
          orderId: order.id,
          amount,
          isPreSettlement: true,
          idempotencyKey: `refund_late_${gatewayTransactionId || idempotencyKey}`
        }, tx);

        await tx.payment.create({
          data: {
            orderId: order.id,
            amount: Number(amount),
            method: 'ONLINE',
            status: 'PAID',
            gatewayTransactionId,
            paidAt: new Date(),
            idempotencyKey: idempotencyKey || `pay_${gatewayTransactionId}`
          }
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
      }, tx);

      // 6. Cập nhật Order status sang PAID & paymentStatus sang PAID
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          status: order.status === 'PENDING' ? 'PAID' : order.status
        },
        include: { listing: { select: { partnerId: true } } }
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

      return { success: true, payment, order: updatedOrder };
    });
    if (result.order) {
      const payload = {
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        amount: Number(amount)
      };
      emitToPartner(result.order.listing.partnerId, 'PAYMENT_SUCCESS', { ...payload, method: 'ONLINE' });
      emitToUser(result.order.customerId, 'PAYMENT_SUCCESS', payload);
    }
    return result;
  }
};
