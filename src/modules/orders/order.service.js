import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';
import { OrderStateMachine } from './orderStateMachine.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { TrustService } from '../trust/trust.service.js';

export function calculateEstimatedShippingFee(distanceKm, date = new Date()) {
  const distance = Math.min(20, Math.max(0.5, Number(distanceKm) || 1));
  let fee = 15000;
  if (distance > 2) {
    fee += Math.ceil(distance - 2) * 5000;
  }
  const hour = date.getHours();
  if ((hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 19)) {
    fee += 5000;
  }
  return Math.min(60000, fee);
}

const ACTIVE_COUPONS = {
  FOODSAVER10: { type: 'PERCENT', value: 10, maxDiscount: 20000, description: 'Giảm 10% tối đa 20.000đ cho đơn hàng' },
  FREESHIP: { type: 'SHIPPING', value: 15000, maxDiscount: 15000, description: 'Giảm 15.000đ phí giao hàng' },
  SAVEGREEN: { type: 'FIXED', value: 10000, maxDiscount: 10000, description: 'Giảm ngay 10.000đ chung tay bảo vệ môi trường' },
  WELCOME: { type: 'PERCENT', value: 20, maxDiscount: 30000, description: 'Giảm 20% tối đa 30.000đ cho thành viên mới' }
};

export function verifyCoupon(code, subtotal) {
  const upperCode = (code || '').trim().toUpperCase();
  const coupon = ACTIVE_COUPONS[upperCode];
  if (!coupon) {
    throw ApiError.badRequest(`Mã giảm giá "${code}" không tồn tại hoặc đã hết hạn.`);
  }

  let discountAmount = 0;
  if (coupon.type === 'PERCENT') {
    discountAmount = Math.min(coupon.maxDiscount, Math.round((Number(subtotal) * coupon.value) / 100));
  } else if (coupon.type === 'FIXED' || coupon.type === 'SHIPPING') {
    discountAmount = Math.min(Number(subtotal), coupon.value);
  }

  return {
    code: upperCode,
    discountAmount,
    description: coupon.description
  };
}

export const OrderService = {
  estimateShipping(distanceKm) {
    const defaultFee = calculateEstimatedShippingFee(distanceKm);
    return {
      distanceKm: Number(distanceKm),
      defaultFee,
      maxFee: 60000,
      isPeakHour: (() => {
        const h = new Date().getHours();
        return (h >= 11 && h <= 13) || (h >= 17 && hour <= 19);
      })()
    };
  },

  /**
   * Tạo đơn hàng với Reserve Inventory nguyên tử, tính Service Fee từ FeeRule, tạo mã OTP lấy hàng
   */
  async createOrder(userId, data) {
    const {
      listingId,
      quantity,
      fulfillmentType = 'PICKUP',
      paymentMethod = 'COD',
      deliveryAddress,
      deliveryDistance,
      shippingFee = 0,
      negotiatedShippingFee,
      discountCode,
      pickupTimeWindow,
      customerNotes,
      customerPhone
    } = data;

    // 1. Kiểm tra Trust Level của khách
    const eligibility = await TrustService.checkReservationEligibility(userId);
    const normalizedPayment = paymentMethod.toUpperCase();
    const isCashPayment = normalizedPayment === 'COD' || normalizedPayment === 'CASH';

    if (isCashPayment && !eligibility.allowCashOnPickup) {
      throw ApiError.badRequest(
        'Tài khoản của bạn có điểm uy tín thấp do từng quá hạn giữ món (No-Show). Vui lòng chọn thanh toán trực tuyến (ONLINE)!'
      );
    }

    const orderNumber = `FS${Date.now().toString().slice(-8)}`;
    const pickupOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const pickupQrCode = `FS_HANDOVER_${orderNumber}_${pickupOtp}`;

    // 2. ACID Transaction
    const newOrder = await prisma.$transaction(async (tx) => {
      // a. Lấy fee rule hiện hành
      const feeRule = await tx.feeRule.findFirst({
        where: { isActive: true }
      });
      const feePercent = feeRule ? Number(feeRule.percentage) : 10;

      // b. Reserve hàng nguyên tử (chống race condition)
      const reservation = await InventoryService.reserveStock(tx, {
        listingId,
        quantity,
        orderId: null,
        reservationMinutes: eligibility.reservationMinutes || 30
      });

      // c. Lấy thông tin listing
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        include: { partner: true }
      });

      // d. Tính toán tài chính
      const merchandiseTotal = Number(listing.discountPrice) * Number(quantity);
      const serviceFee = Math.round((merchandiseTotal * feePercent) / 100);

      let finalShippingFee = 0;
      const isDelivery = fulfillmentType === 'DELIVERY' || fulfillmentType === 'PARTNER_DELIVERY';
      if (isDelivery) {
        finalShippingFee = Math.min(60000, Math.max(0, Number(shippingFee)));
      }

      let discountAmount = 0;
      if (discountCode) {
        try {
          const verified = verifyCoupon(discountCode, merchandiseTotal);
          discountAmount = verified.discountAmount;
        } catch {
          // ignore
        }
      }

      const totalPrice = Math.max(0, merchandiseTotal + finalShippingFee - discountAmount);

      // e. Tạo Order
      const order = await tx.order.create({
        data: {
          orderNumber,
          listingId,
          customerId: userId,
          quantity: Number(quantity),
          unitPrice: listing.discountPrice,
          merchandiseTotal,
          serviceFee,
          serviceFeePercentage: feePercent,
          totalPrice,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          reservationStatus: 'RESERVED',
          fulfillmentType: isDelivery ? 'DELIVERY' : 'PICKUP',
          paymentMethod: isCashPayment ? 'COD' : 'SYSTEM_QR',
          deliveryAddress: deliveryAddress || null,
          deliveryDistance: deliveryDistance !== undefined ? Number(deliveryDistance) : null,
          shippingFee: finalShippingFee,
          negotiatedShippingFee: negotiatedShippingFee !== undefined ? Number(negotiatedShippingFee) : null,
          discountCode: discountCode ? discountCode.trim().toUpperCase() : null,
          discountAmount,
          pickupTimeWindow,
          pickupOtp,
          pickupQrCode,
          customerNotes: customerNotes || null,
          customerPhone: customerPhone || null
        },
        include: {
          listing: { include: { partner: true } },
          customer: { select: { id: true, fullName: true, phone: true } }
        }
      });

      // f. Gán orderId vào reservation
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { orderId: order.id }
      });

      // g. Tạo bản ghi Payment
      await tx.payment.create({
        data: {
          orderId: order.id,
          amount: totalPrice,
          method: isCashPayment ? 'CASH' : 'ONLINE',
          status: 'PENDING',
          idempotencyKey: `pay_${order.id}_${Date.now()}`
        }
      });

      // h. Lưu lịch sử trạng thái
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          newStatus: 'PENDING',
          changedBy: userId,
          note: `Khách tạo đơn (${isDelivery ? 'Quán tự giao' : 'Tới quán lấy'} - ${isCashPayment ? 'Tiền mặt' : 'Online'}). Mã OTP lấy hàng: ${pickupOtp}`
        }
      });

      // i. Tạo thông báo cho đối tác
      await tx.notification.create({
        data: {
          userId: listing.partner.userId,
          type: 'ORDER_STATUS_UPDATED',
          title: `Đơn giữ món mới #${orderNumber}!`,
          message: `Khách hàng vừa đặt ${quantity} phần "${listing.title}". Hình thức: ${
            isDelivery ? 'Quán tự giao hàng' : 'Khách tới quán lấy'
          }. Đã giữ hàng trong ${eligibility.reservationMinutes || 30} phút.`
        }
      });

      return order;
    });

    // Realtime Socket
    emitToPartner(newOrder.listing.partnerId, 'NEW_ORDER', {
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      quantity: newOrder.quantity,
      listingTitle: newOrder.listing.title,
      customerName: newOrder.customer?.fullName || 'Khách hàng',
      fulfillmentType: newOrder.fulfillmentType,
      paymentMethod: newOrder.paymentMethod,
      shippingFee: Number(newOrder.shippingFee),
      totalPrice: Number(newOrder.totalPrice),
      pickupTimeWindow: newOrder.pickupTimeWindow,
      pickupOtp: newOrder.pickupOtp
    });

    return formatOrderResponse(newOrder);
  },

  /**
   * Đối tác: Xác nhận bàn giao món ăn (Handover Confirmation)
   * Với STORE_PICKUP: Bắt buộc đối tác nhập đúng mã 6 số OTP của khách (hoặc scan QR)
   * Với CASH: Ghi nhận nợ phí dịch vụ vào Ledger (partner_receivable)
   */
  async confirmHandover(userId, orderId, { otp, note } = {}) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: true,
        payments: true
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền quản lý đơn hàng này');
    }

    // 1. Kiểm tra hình thức và mã OTP
    const isPickup = order.fulfillmentType === 'PICKUP' || order.fulfillmentType === 'STORE_PICKUP';
    if (isPickup) {
      if (!otp || String(otp).trim() !== String(order.pickupOtp)) {
        throw ApiError.badRequest(
          'Mã xác nhận lấy hàng (OTP) không chính xác! Vui lòng nhờ khách đọc đúng 6 số trên màn hình đơn hàng.'
        );
      }
    }

    // 2. Validate state machine
    OrderStateMachine.validateTransition(order.status, 'HANDED_OVER');

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const isCash = order.paymentMethod === 'COD' || order.paymentMethod === 'CASH';

      // a. Cập nhật Order
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'HANDED_OVER',
          handedOverAt: now,
          partnerConfirmedAt: now,
          paymentStatus: isCash ? 'PAID' : order.paymentStatus
        },
        include: {
          listing: { include: { partner: true } },
          customer: true
        }
      });

      // b. Nếu là Tiền mặt (CASH), cập nhật Payment sang PAID & ghi sổ nợ phí dịch vụ
      if (isCash) {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: { status: 'PAID', paidAt: now }
        });

        // Ghi sổ kế toán kép: Dr partner_receivable / Cr platform_revenue
        await LedgerService.recordCashReceivableBooking({
          orderId: order.id,
          partnerId: order.listing.partnerId,
          merchandiseTotal: order.merchandiseTotal,
          serviceFee: order.serviceFee,
          idempotencyKey: `cash_rec_${order.id}`
        });
      }

      // c. Cập nhật reservation status sang CONFIRMED
      await tx.inventoryReservation.updateMany({
        where: { orderId: order.id },
        data: { status: 'CONFIRMED' }
      });

      // d. Lưu lịch sử
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: 'HANDED_OVER',
          changedBy: userId,
          note: note || (isPickup ? 'Quán xác thực OTP và bàn giao món thành công' : 'Quán bắt đầu giao hàng tới khách')
        }
      });

      // e. Thông báo cho khách hàng
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: 'ORDER_STATUS_UPDATED',
          title: `Đơn hàng #${order.orderNumber} đã được bàn giao!`,
          message: `Quán đã xác nhận bàn giao món cho bạn. Vui lòng kiểm tra và bấm "Đã nhận đủ món" để hoàn tất đơn nhé.`
        }
      });

      return updatedOrder;
    });

    emitToUser(order.customerId, 'ORDER_HANDED_OVER', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'HANDED_OVER'
    });

    return formatOrderResponse(updated);
  },

  /**
   * Khách hàng: Xác nhận đã nhận đủ hàng (Two-Party Confirmation)
   * Hoàn tất đơn hàng và kích hoạt đối soát doanh thu (Settlement)
   */
  async customerConfirmReceipt(userId, orderId, { note } = {}) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: true,
        payments: true
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.customerId !== userId) {
      throw ApiError.forbidden('Bạn không phải chủ đơn hàng này');
    }

    if (order.status === 'COMPLETED') {
      return formatOrderResponse(order);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          customerConfirmedAt: now,
          completedAt: now
        },
        include: {
          listing: { include: { partner: true } },
          customer: true
        }
      });

      // Nếu là ONLINE, kích hoạt Settlement từ Escrow sang Partner Pending & Platform Revenue
      const isOnline = order.paymentMethod === 'SYSTEM_QR' || order.paymentMethod === 'ONLINE';
      if (isOnline) {
        await LedgerService.recordOrderSettlement({
          orderId: order.id,
          partnerId: order.listing.partnerId,
          merchandiseTotal: order.merchandiseTotal,
          serviceFee: order.serviceFee,
          shippingFee: order.shippingFee,
          idempotencyKey: `settle_complete_${order.id}`
        });
      }

      // Thưởng điểm tín nhiệm cho khách
      await TrustService.recordEvent(userId, 'ORDER_COMPLETED', {
        orderId: order.id,
        note: `Hoàn tất đơn hàng #${order.orderNumber}`
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: 'COMPLETED',
          changedBy: userId,
          note: note || 'Khách hàng xác nhận đã nhận đủ món ăn hài lòng'
        }
      });

      // Thông báo cho Quán
      await tx.notification.create({
        data: {
          userId: order.listing.partner.userId,
          type: 'ORDER_STATUS_UPDATED',
          title: `Đơn hàng #${order.orderNumber} hoàn tất thành công!`,
          message: `Khách hàng đã xác nhận nhận món. Tiền đã được ghi nhận vào doanh thu của quán.`
        }
      });

      return updatedOrder;
    });

    emitToPartner(order.listing.partnerId, 'ORDER_COMPLETED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'COMPLETED'
    });

    return formatOrderResponse(updated);
  },

  /**
   * Hủy đơn hàng (Cancel Order)
   * Tự động giải phóng Reservation và hoàn tiền Escrow nếu đã thanh toán Online
   */
  async cancelOrder(userId, orderId, reason) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        reservations: true
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.customerId !== userId && order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền thao tác trên đơn hàng này');
    }

    if (order.status === 'COMPLETED' || order.status === 'HANDED_OVER') {
      throw ApiError.badRequest('Đơn hàng đã bàn giao hoặc hoàn tất, không thể tự ý hủy.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Giải phóng tồn kho reservation
      for (const res of order.reservations) {
        if (res.status === 'RESERVED') {
          await InventoryService.releaseReservation(tx, res.id, reason || 'Khách hàng/Quán hủy đơn');
        }
      }

      // 2. Nếu đã thanh toán Online -> Hoàn tiền từ Escrow
      if (order.paymentStatus === 'PAID' && (order.paymentMethod === 'SYSTEM_QR' || order.paymentMethod === 'ONLINE')) {
        await LedgerService.recordRefund({
          orderId: order.id,
          amount: order.totalPrice,
          isPreSettlement: true,
          idempotencyKey: `refund_cancel_${order.id}`
        });

        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PAID' },
          data: { status: 'REFUNDED', refundedAt: new Date() }
        });
      }

      // 3. Cập nhật Order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : order.paymentStatus,
          reservationStatus: 'RELEASED',
          cancellationReason: reason || 'Hủy đơn hàng'
        },
        include: {
          listing: { include: { partner: true } },
          customer: true
        }
      });

      // 4. Ghi nhận trust event nếu khách chủ động hủy sau khi đã khóa
      if (userId === order.customerId && order.isLocked) {
        await TrustService.recordEvent(userId, 'CANCELLED', {
          orderId: order.id,
          note: 'Hủy đơn hàng sau khi đã xác nhận'
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedBy: userId,
          note: reason || 'Hủy đơn hàng'
        }
      });

      return updatedOrder;
    });

    emitToPartner(order.listing.partnerId, 'ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'CANCELLED'
    });

    emitToUser(order.customerId, 'ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'CANCELLED'
    });

    return formatOrderResponse(updated);
  },

  async bargainShippingFee(userId, orderId, proposedFee) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }
    if (order.customerId !== userId) {
      throw ApiError.forbidden('Bạn không phải chủ đơn hàng');
    }
    if (order.isLocked) {
      throw ApiError.badRequest('Đơn hàng đã chốt sau 5s, không thể thương lượng phí ship nữa');
    }

    const cappedFee = Math.min(60000, Math.max(0, Number(proposedFee)));

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { negotiatedShippingFee: cappedFee },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    emitToPartner(order.listing.partnerId, 'RECEIVE_BARGAIN_REQUEST', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customer?.fullName || 'Khách hàng',
      defaultFee: Number(order.shippingFee),
      proposedFee: cappedFee,
      distanceKm: Number(order.deliveryDistance || 2)
    });

    return formatOrderResponse(updated);
  },

  async respondBargain(userId, orderId, { accepted, finalFee, message }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    if (!order) throw ApiError.notFound('Không tìm thấy đơn hàng');
    if (order.listing.partner.userId !== userId) throw ApiError.forbidden('Bạn không có quyền quản lý đơn hàng này');

    let updatedShippingFee = Number(order.shippingFee);
    if (accepted) {
      updatedShippingFee = Math.min(60000, Math.max(0, Number(order.negotiatedShippingFee || order.shippingFee)));
    } else if (finalFee !== undefined) {
      updatedShippingFee = Math.min(60000, Math.max(0, Number(finalFee)));
    }

    const itemSubtotal = Number(order.unitPrice) * order.quantity;
    const newTotalPrice = itemSubtotal + updatedShippingFee - Number(order.discountAmount || 0);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingFee: updatedShippingFee,
        totalPrice: newTotalPrice
      },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    emitToUser(order.customerId, 'RECEIVE_BARGAIN_RESPONSE', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      accepted,
      finalFee: updatedShippingFee,
      newTotalPrice,
      message: message || (accepted ? 'Quán đã đồng ý giá chém của bạn!' : 'Quán đưa ra giá chốt khác')
    });

    return formatOrderResponse(updated);
  },

  async lockOrder(userId, orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { partner: true } } }
    });

    if (!order) throw ApiError.notFound('Không tìm thấy đơn hàng');
    if (order.customerId !== userId && order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền thao tác trên đơn hàng này');
    }
    if (order.isLocked) return formatOrderResponse(order);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { isLocked: true, lockedAt: new Date() },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        oldStatus: order.status,
        newStatus: order.status,
        changedBy: userId,
        note: 'Đơn hàng đã khóa sau 5s chốt giá'
      }
    });

    emitToPartner(order.listing.partnerId, 'ORDER_LOCKED', { orderId: order.id, orderNumber: order.orderNumber });
    emitToUser(order.customerId, 'ORDER_LOCKED', { orderId: order.id, orderNumber: order.orderNumber });

    return formatOrderResponse(updated);
  },

  async getMyOrders(userId, { page = 1, limit = 20 } = {}) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;
    const where = { customerId: userId };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: { include: { partner: true } },
          customer: { select: { fullName: true, phone: true } }
        }
      }),
      prisma.order.count({ where })
    ]);

    return {
      orders: orders.map(formatOrderResponse),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

  async getOrderById(userId, orderId) {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: { select: { fullName: true, phone: true } },
        payments: true,
        reservations: true
      }
    });

    if (!o) throw ApiError.notFound('Không tìm thấy đơn hàng');
    if (o.customerId !== userId && o.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền truy cập đơn hàng này');
    }

    return formatOrderResponse(o);
  },

  async getPartnerOrders(userId, { status, page = 1, limit = 20 } = {}) {
    const partnerProfile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });
    if (!partnerProfile) throw ApiError.forbidden('Chưa tìm thấy hồ sơ đối tác');

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;
    const where = { listing: { partnerId: partnerProfile.id } };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: true,
          customer: { select: { fullName: true, phone: true } }
        }
      }),
      prisma.order.count({ where })
    ]);

    return {
      orders: orders.map((o) => ({
        ...formatOrderResponse(o),
        partnerName: partnerProfile.businessName
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    };
  },

  async updatePartnerOrderStatus(userId, orderId, status) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { partner: true } } }
    });

    if (!order) throw ApiError.notFound('Không tìm thấy đơn hàng');
    if (order.listing.partner.userId !== userId) throw ApiError.forbidden('Bạn không có quyền quản lý đơn hàng này');

    OrderStateMachine.validateTransition(order.status, status);

    const updated = await prisma.$transaction(async (tx) => {
      if (status === 'REJECTED') {
        await tx.listing.update({
          where: { id: order.listingId },
          data: {
            quantity: { increment: order.quantity },
            status: 'AVAILABLE'
          }
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          partnerConfirmedAt: status === 'ACCEPTED' ? new Date() : order.partnerConfirmedAt
        },
        include: {
          listing: { include: { partner: true } },
          customer: true
        }
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: status,
          changedBy: userId,
          note: `Đối tác cập nhật sang ${status}`
        }
      });

      return updatedOrder;
    });

    emitToUser(order.customerId, 'ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status
    });

    return formatOrderResponse(updated);
  }
};

function formatOrderResponse(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    listingId: o.listingId,
    listingTitle: o.listing?.title || '',
    listingImage: o.listing?.imageUrls?.[0] || '',
    partnerId: o.listing?.partnerId || '',
    partnerName: o.listing?.partner?.businessName || '',
    partnerAddress: o.listing?.pickupAddress || o.listing?.partner?.address || '',
    customerId: o.customerId,
    customerName: o.customer?.fullName || '',
    customerPhone: o.customerPhone || o.customer?.phone || '',
    quantity: o.quantity,
    unitPrice: Number(o.unitPrice),
    merchandiseTotal: Number(o.merchandiseTotal || (Number(o.unitPrice) * o.quantity)),
    serviceFee: Number(o.serviceFee || 0),
    serviceFeePercentage: Number(o.serviceFeePercentage || 10),
    shippingFee: Number(o.shippingFee || 0),
    negotiatedShippingFee: o.negotiatedShippingFee ? Number(o.negotiatedShippingFee) : null,
    discountCode: o.discountCode || null,
    discountAmount: Number(o.discountAmount || 0),
    totalPrice: Number(o.totalPrice),
    status: o.status,
    paymentStatus: o.paymentStatus || 'PENDING',
    reservationStatus: o.reservationStatus || 'RESERVED',
    fulfillmentType: o.fulfillmentType || 'PICKUP',
    paymentMethod: o.paymentMethod || 'COD',
    pickupOtp: o.pickupOtp || null,
    pickupQrCode: o.pickupQrCode || null,
    partnerConfirmedAt: o.partnerConfirmedAt ? o.partnerConfirmedAt.toISOString() : null,
    customerConfirmedAt: o.customerConfirmedAt ? o.customerConfirmedAt.toISOString() : null,
    handedOverAt: o.handedOverAt ? o.handedOverAt.toISOString() : null,
    completedAt: o.completedAt ? o.completedAt.toISOString() : null,
    deliveryAddress: o.deliveryAddress || null,
    deliveryDistance: o.deliveryDistance ? Number(o.deliveryDistance) : null,
    isLocked: !!o.isLocked,
    lockedAt: o.lockedAt ? o.lockedAt.toISOString() : null,
    pickupTimeWindow: o.pickupTimeWindow,
    customerNotes: o.customerNotes,
    cancellationReason: o.cancellationReason,
    createdAt: o.createdAt.toISOString()
  };
}
