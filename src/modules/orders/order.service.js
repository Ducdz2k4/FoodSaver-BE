import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';

export const OrderService = {
  /**
   * Khách hàng: Tạo đơn đặt giữ món ăn (ACID Transaction trừ tồn kho an toàn)
   */
  async createOrder(userId, data) {
    const { listingId, quantity, pickupTimeWindow, customerNotes } = data;

    // Chạy ACID Transaction
    const newOrder = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra listing
      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        include: {
          partner: true
        }
      });

      if (!listing) {
        throw ApiError.notFound('Không tìm thấy thông tin món ăn');
      }

      if (listing.status !== 'AVAILABLE' && listing.status !== 'EXPIRING_SOON') {
        throw ApiError.badRequest('Món ăn hiện không còn khả dụng để đặt giữ');
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

      // 3. Tạo mã đơn hàng duy nhất #FS...
      const orderNumber = `FS${Date.now().toString().slice(-8)}`;

      // 4. Tạo bản ghi đơn hàng
      const order = await tx.order.create({
        data: {
          orderNumber,
          listingId,
          customerId: userId,
          quantity,
          unitPrice: listing.discountPrice,
          totalPrice: Number(listing.discountPrice) * quantity,
          status: 'PENDING',
          pickupTimeWindow,
          customerNotes: customerNotes || null
        },
        include: {
          listing: {
            include: {
              partner: true
            }
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true
            }
          }
        }
      });

      // 5. Lưu lịch sử trạng thái
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          newStatus: 'PENDING',
          changedBy: userId,
          note: 'Khách hàng khởi tạo đơn đặt giữ'
        }
      });

      // 6. Tạo thông báo cho đối tác
      await tx.notification.create({
        data: {
          userId: listing.partner.userId,
          type: 'ORDER_STATUS_UPDATED',
          title: `Đơn hàng mới #${orderNumber}!`,
          message: `Khách hàng vừa đặt ${quantity} phần "${listing.title}". Khung giờ hẹn: ${pickupTimeWindow}.`
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
      pickupTimeWindow: newOrder.pickupTimeWindow
    });

    emitToUser(newOrder.listing.partner.userId, 'NEW_ORDER', {
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      quantity: newOrder.quantity,
      listingTitle: newOrder.listing.title,
      customerName: newOrder.customer?.fullName || 'Khách hàng',
      pickupTimeWindow: newOrder.pickupTimeWindow
    });

    return {
      id: newOrder.id,
      orderNumber: newOrder.orderNumber,
      listingId: newOrder.listingId,
      listingTitle: newOrder.listing.title,
      listingImage: newOrder.listing.imageUrls[0],
      partnerName: newOrder.listing.partner.businessName,
      partnerAddress: newOrder.listing.pickupAddress,
      customerId: newOrder.customerId,
      customerName: newOrder.customer?.fullName || '',
      customerPhone: newOrder.customer?.phone || '',
      quantity: newOrder.quantity,
      unitPrice: Number(newOrder.unitPrice),
      totalPrice: Number(newOrder.totalPrice),
      status: newOrder.status,
      pickupTimeWindow: newOrder.pickupTimeWindow,
      customerNotes: newOrder.customerNotes,
      createdAt: newOrder.createdAt.toISOString()
    };
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
          listing: {
            include: { partner: true }
          },
          customer: {
            select: { fullName: true, phone: true }
          }
        }
      }),
      prisma.order.count({ where })
    ]);

    const formatted = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      listingId: o.listingId,
      listingTitle: o.listing.title,
      listingImage: o.listing.imageUrls[0],
      partnerName: o.listing.partner.businessName,
      partnerAddress: o.listing.pickupAddress,
      customerId: o.customerId,
      customerName: o.customer?.fullName || '',
      customerPhone: o.customer?.phone || '',
      quantity: o.quantity,
      unitPrice: Number(o.unitPrice),
      totalPrice: Number(o.totalPrice),
      status: o.status,
      pickupTimeWindow: o.pickupTimeWindow,
      customerNotes: o.customerNotes,
      createdAt: o.createdAt.toISOString()
    }));

    return {
      orders: formatted,
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
        listing: {
          include: { partner: true }
        },
        customer: {
          select: { fullName: true, phone: true }
        }
      }
    });

    if (!o) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    // Quyền truy cập: Chủ đơn hàng hoặc Chủ quán của món ăn
    if (o.customerId !== userId && o.listing.partner.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền truy cập đơn hàng này');
    }

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      listingId: o.listingId,
      listingTitle: o.listing.title,
      listingImage: o.listing.imageUrls[0],
      partnerName: o.listing.partner.businessName,
      partnerAddress: o.listing.pickupAddress,
      customerId: o.customerId,
      customerName: o.customer?.fullName || '',
      customerPhone: o.customer?.phone || '',
      quantity: o.quantity,
      unitPrice: Number(o.unitPrice),
      totalPrice: Number(o.totalPrice),
      status: o.status,
      pickupTimeWindow: o.pickupTimeWindow,
      customerNotes: o.customerNotes,
      cancellationReason: o.cancellationReason,
      createdAt: o.createdAt.toISOString()
    };
  },

  /**
   * Khách hàng: Hủy đơn hàng khi còn PENDING
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

    if (order.status !== 'PENDING') {
      throw ApiError.badRequest('Chỉ có thể hủy đơn hàng khi quán chưa xác nhận chuẩn bị (PENDING)');
    }

    // Transaction hoàn lại tồn kho
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Hoàn lại số lượng cho listing
      const updatedListing = await tx.listing.update({
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

    return updated;
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
          customer: {
            select: { fullName: true, phone: true }
          }
        }
      }),
      prisma.order.count({ where })
    ]);

    const formatted = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      listingId: o.listingId,
      listingTitle: o.listing.title,
      listingImage: o.listing.imageUrls[0],
      partnerName: partnerProfile.businessName,
      partnerAddress: o.listing.pickupAddress,
      customerId: o.customerId,
      customerName: o.customer?.fullName || '',
      customerPhone: o.customer?.phone || '',
      quantity: o.quantity,
      unitPrice: Number(o.unitPrice),
      totalPrice: Number(o.totalPrice),
      status: o.status,
      pickupTimeWindow: o.pickupTimeWindow,
      customerNotes: o.customerNotes,
      createdAt: o.createdAt.toISOString()
    }));

    return {
      orders: formatted,
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
      // Nếu REJECTED -> hoàn lại số lượng tồn cho listing
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
        data: { status }
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

      // Tạo thông báo in-app cho khách
      const titleMap = {
        ACCEPTED: 'Quán đã nhận chuẩn bị đơn!',
        COMPLETED: 'Đơn hàng đã hoàn tất thành công!',
        REJECTED: 'Đơn hàng bị từ chối do hết món'
      };
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: 'ORDER_STATUS_UPDATED',
          title: titleMap[status] || 'Cập nhật đơn hàng',
          message: `Đơn hàng #${order.orderNumber} cho món "${order.listing.title}" đã được cập nhật sang: ${status}`
        }
      });

      return updatedOrder;
    });

    // Bắn realtime Socket.IO tới khách hàng
    emitToUser(order.customerId, 'ORDER_STATUS_CHANGED', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status
    });

    return updated;
  }
};
