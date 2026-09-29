import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';

/**
 * Tính toán phí giao hàng ước tính dựa trên khoảng cách và khung giờ cao điểm
 * - Tối đa phí ship: 60.000đ
 * - Tối đa khoảng cách: 20km
 */
export function calculateEstimatedShippingFee(distanceKm, date = new Date()) {
  const distance = Math.min(20, Math.max(0.5, Number(distanceKm) || 1));
  let fee = 15000; // 2km đầu tiên

  if (distance > 2) {
    fee += Math.ceil(distance - 2) * 5000; // Mỗi km tiếp theo +5.000đ
  }

  // Khung giờ cao điểm (11h-13h hoặc 17h-19h): phụ phí +5.000đ
  const hour = date.getHours();
  if ((hour >= 11 && hour <= 13) || (hour >= 17 && hour <= 19)) {
    fee += 5000;
  }

  return Math.min(60000, fee);
}

export const OrderService = {
  /**
   * Ước tính phí giao hàng
   */
  estimateShipping(distanceKm) {
    const defaultFee = calculateEstimatedShippingFee(distanceKm);
    return {
      distanceKm: Number(distanceKm),
      defaultFee,
      maxFee: 60000,
      isPeakHour: (() => {
        const h = new Date().getHours();
        return (h >= 11 && h <= 13) || (h >= 17 && h <= 19);
      })()
    };
  },

  /**
   * Khách hàng: Tạo đơn đặt giữ món ăn (ACID Transaction trừ tồn kho an toàn)
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
      pickupTimeWindow,
      customerNotes,
      customerPhone
    } = data;

    // Chạy ACID Transaction
    const newOrder = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra listing
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        include: { partner: true }
      });

      if (!listing) {
        throw ApiError.notFound('Không tìm thấy thông tin món ăn');
      }

      if (listing.status !== 'AVAILABLE' && listing.status !== 'EXPIRING_SOON') {
        throw ApiError.badRequest('Món ăn hiện không còn khả dụng để đặt');
      }

      if (new Date(listing.expiryAt) <= new Date()) {
        throw ApiError.badRequest('Món ăn đã hết hạn giải cứu');
      }

      if (listing.quantity < quantity) {
        throw ApiError.badRequest(
          `Số lượng còn lại không đủ (Quán chỉ còn ${listing.quantity} ${listing.unit})`
        );
      }

      // 2. Trừ tồn kho & đổi status sang SOLD_OUT nếu hết
      const remainingQty = listing.quantity - quantity;
      await tx.listing.update({
        where: { id: listingId },
        data: {
          quantity: remainingQty,
          status: remainingQty === 0 ? 'SOLD_OUT' : listing.status
        }
      });

      // 3. Tính toán phí ship và tổng tiền
      let finalShippingFee = 0;
      if (fulfillmentType === 'DELIVERY') {
        finalShippingFee = Math.min(60000, Math.max(0, Number(shippingFee)));
      }
      const itemSubtotal = Number(listing.discountPrice) * quantity;
      const totalPrice = itemSubtotal + finalShippingFee;

      // 4. Tạo mã đơn hàng duy nhất #FS...
      const orderNumber = `FS${Date.now().toString().slice(-8)}`;

      // 5. Tạo bản ghi đơn hàng
      const order = await tx.order.create({
        data: {
          orderNumber,
          listingId,
          customerId: userId,
          quantity,
          unitPrice: listing.discountPrice,
          totalPrice,
          status: 'PENDING',
          fulfillmentType,
          paymentMethod,
          deliveryAddress: deliveryAddress || null,
          deliveryDistance: deliveryDistance !== undefined ? Number(deliveryDistance) : null,
          shippingFee: finalShippingFee,
          negotiatedShippingFee: negotiatedShippingFee !== undefined ? Number(negotiatedShippingFee) : null,
          pickupTimeWindow,
          customerNotes: customerNotes || null,
          customerPhone: customerPhone || null
        },
        include: {
          listing: {
            include: { partner: true }
          },
          customer: {
            select: { id: true, fullName: true, phone: true }
          }
        }
      });

      // 6. Lưu lịch sử trạng thái
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          newStatus: 'PENDING',
          changedBy: userId,
          note: `Khách tạo đơn (${fulfillmentType === 'DELIVERY' ? 'Giao hàng' : 'Tự lấy'} - ${paymentMethod})`
        }
      });

      // 7. Tạo thông báo cho đối tác
      await tx.notification.create({
        data: {
          userId: listing.partner.userId,
          type: 'ORDER_STATUS_UPDATED',
          title: `Đơn hàng mới #${orderNumber}!`,
          message: `Khách hàng vừa đặt ${quantity} phần "${listing.title}". Hình thức: ${
            fulfillmentType === 'DELIVERY' ? 'Giao hàng tận nơi' : 'Tự đến lấy'
          }.`
        }
      });

      return order;
    });

    // Phát sự kiện realtime qua Socket.IO tới đối tác
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
      pickupTimeWindow: newOrder.pickupTimeWindow
    });

    emitToUser(newOrder.listing.partner.userId, 'NEW_ORDER', {
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      quantity: newOrder.quantity,
      listingTitle: newOrder.listing.title,
      customerName: newOrder.customer?.fullName || 'Khách hàng',
      fulfillmentType: newOrder.fulfillmentType,
      paymentMethod: newOrder.paymentMethod,
      shippingFee: Number(newOrder.shippingFee),
      totalPrice: Number(newOrder.totalPrice),
      pickupTimeWindow: newOrder.pickupTimeWindow
    });

    return formatOrderResponse(newOrder);
  },

  /**
   * Khách hàng: Chém giá phí ship (Bargain Shipping Fee)
   */
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
      data: {
        negotiatedShippingFee: cappedFee
      },
      include: {
        listing: { include: { partner: true } },
        customer: true
      }
    });

    // Phát socket sang quán
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

  /**
   * Đối tác: Phản hồi thương lượng phí ship (Chấp nhận / Đưa giá khác / Từ chối)
   */
  async respondBargain(userId, orderId, { accepted, finalFee, message }) {
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

    if (order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền quản lý đơn hàng này');
    }

    let updatedShippingFee = Number(order.shippingFee);

    if (accepted) {
      updatedShippingFee = Math.min(
        60000,
        Math.max(0, Number(order.negotiatedShippingFee || order.shippingFee))
      );
    } else if (finalFee !== undefined) {
      updatedShippingFee = Math.min(60000, Math.max(0, Number(finalFee)));
    }

    const itemSubtotal = Number(order.unitPrice) * order.quantity;
    const newTotalPrice = itemSubtotal + updatedShippingFee;

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

    // Bắn socket phản hồi tới khách
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

  /**
   * Khóa đơn hàng sau 5 giây (Tự động cập nhật - Không được hủy ở bước này nữa)
   */
  async lockOrder(userId, orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } }
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.customerId !== userId && order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền thao tác trên đơn hàng này');
    }

    if (order.isLocked) {
      return formatOrderResponse(order);
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        isLocked: true,
        lockedAt: new Date()
      },
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
        note: 'Đơn hàng đã khóa sau 5s chốt giá (Không được hủy đơn nữa)'
      }
    });

    // Bắn realtime event
    emitToPartner(order.listing.partnerId, 'ORDER_LOCKED', {
      orderId: order.id,
      orderNumber: order.orderNumber
    });
    emitToUser(order.customerId, 'ORDER_LOCKED', {
      orderId: order.id,
      orderNumber: order.orderNumber
    });

    return formatOrderResponse(updated);
  },

  /**
   * Khách hàng: Lấy danh sách đơn của mình
   */
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

  /**
   * Xem chi tiết 1 đơn hàng (Khách hàng hoặc Đối tác)
   */
  async getOrderById(userId, orderId) {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } },
        customer: { select: { fullName: true, phone: true } }
      }
    });

    if (!o) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (o.customerId !== userId && o.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền truy cập đơn hàng này');
    }

    return formatOrderResponse(o);
  },

  /**
   * Khách hàng: Hủy đơn hàng (Chỉ cho phép khi chưa khóa isLocked)
   */
  async cancelOrder(userId, orderId, reason) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { partner: true } } }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.customerId !== userId) {
      throw ApiError.forbidden('Bạn không phải chủ đơn hàng này');
    }

    if (order.isLocked) {
      throw ApiError.badRequest(
        'Đơn hàng đã được chốt và khóa sau 5s xác nhận, bạn không được hủy đơn ở bước này nữa'
      );
    }

    if (order.status !== 'PENDING') {
      throw ApiError.badRequest('Chỉ có thể hủy đơn hàng khi quán chưa xác nhận chuẩn bị (PENDING)');
    }

    // Transaction hoàn lại tồn kho
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Hoàn lại số lượng cho listing
      await tx.listing.update({
        where: { id: order.listingId },
        data: {
          quantity: { increment: order.quantity },
          status: 'AVAILABLE'
        }
      });

      // 2. Cập nhật đơn hàng
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason || 'Khách hàng hủy đơn'
        },
        include: {
          listing: { include: { partner: true } },
          customer: true
        }
      });

      // 3. Lịch sử
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: 'PENDING',
          newStatus: 'CANCELLED',
          changedBy: userId,
          note: reason || 'Khách hàng hủy đơn'
        }
      });

      return updatedOrder;
    });

    // Bắn realtime event tới quán
    emitToPartner(order.listing.partnerId, 'ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'CANCELLED'
    });

    return formatOrderResponse(updated);
  },

  /**
   * Đối tác: Lấy danh sách đơn của quán mình
   */
  async getPartnerOrders(userId, { status, page = 1, limit = 20 } = {}) {
    const partnerProfile = await prisma.partnerProfile.findUnique({
      where: { userId }
    });

    if (!partnerProfile) {
      throw ApiError.forbidden('Chưa tìm thấy hồ sơ đối tác');
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      listing: { partnerId: partnerProfile.id }
    };

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

  /**
   * Đối tác: Cập nhật trạng thái đơn (ACCEPTED, REJECTED, COMPLETED)
   */
  async updatePartnerOrderStatus(userId, orderId, status) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: { include: { partner: true } }
      }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    if (order.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền quản lý đơn hàng này');
    }

    // Transaction
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
        data: { status },
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
    shippingFee: Number(o.shippingFee || 0),
    negotiatedShippingFee: o.negotiatedShippingFee ? Number(o.negotiatedShippingFee) : null,
    totalPrice: Number(o.totalPrice),
    status: o.status,
    fulfillmentType: o.fulfillmentType || 'PICKUP',
    paymentMethod: o.paymentMethod || 'COD',
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
