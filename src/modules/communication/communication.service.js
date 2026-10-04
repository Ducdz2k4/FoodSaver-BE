import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';

export const CommunicationService = {
  /**
   * Lấy hoặc tạo phòng chat riêng theo Đơn hàng
   */
  async getOrCreateOrderThread(orderId, userId) {
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

    const partnerUserId = order.listing.partner.userId;
    const customerUserId = order.customerId;

    if (userId !== customerUserId && userId !== partnerUserId) {
      throw ApiError.forbidden('Bạn không có quyền tham gia cuộc trò chuyện của đơn hàng này');
    }

    let thread = await prisma.orderChatThread.findUnique({
      where: { orderId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 }
      }
    });

    if (!thread) {
      thread = await prisma.orderChatThread.create({
        data: {
          orderId,
          partnerId: order.listing.partnerId,
          customerId: order.customerId
        },
        include: { messages: true }
      });
    }

    return {
      thread,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        listingTitle: order.listing.title,
        partnerName: order.listing.partner.businessName,
        customerName: order.customer.fullName,
        customerPhone: order.customerPhone || order.customer.phone,
        partnerPhone: order.listing.partner.phone
      }
    };
  },

  /**
   * Gửi tin nhắn trao đổi trong đơn hàng
   */
  async sendMessage(userId, orderId, text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw ApiError.badRequest('Tin nhắn không được để trống');
    }

    const { thread, order } = await this.getOrCreateOrderThread(orderId, userId);
    const orderObj = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { partner: true } } }
    });

    const isCustomer = userId === orderObj.customerId;
    const senderRole = isCustomer ? 'CUSTOMER' : 'PARTNER';
    const targetUserId = isCustomer ? orderObj.listing.partner.userId : orderObj.customerId;

    const message = await prisma.orderChatMessage.create({
      data: {
        threadId: thread.id,
        senderId: userId,
        senderRole,
        message: trimmed
      }
    });

    // Bắn realtime socket tới đối phương
    emitToUser(targetUserId, 'RECEIVE_ORDER_CHAT_MESSAGE', {
      orderId,
      threadId: thread.id,
      message: {
        id: message.id,
        senderId: message.senderId,
        senderRole: message.senderRole,
        message: message.message,
        createdAt: message.createdAt.toISOString()
      }
    });

    return message;
  },

  /**
   * Ghi nhận sự kiện cuộc gọi thoại (WebRTC / Voice Call Event)
   */
  async recordCallEvent(userId, orderId, { eventType, durationSec = 0 }) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: { include: { partner: true } } }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy đơn hàng');
    }

    const isCustomer = userId === order.customerId;
    const receiverId = isCustomer ? order.listing.partner.userId : order.customerId;

    const callEvent = await prisma.orderCallEvent.create({
      data: {
        orderId,
        callerId: userId,
        receiverId,
        eventType,
        durationSec: Number(durationSec) || 0
      }
    });

    // Bắn realtime socket thông báo cuộc gọi
    emitToUser(receiverId, 'ORDER_CALL_EVENT', {
      orderId,
      callerId: userId,
      eventType,
      durationSec,
      createdAt: callEvent.createdAt.toISOString()
    });

    return callEvent;
  }
};
