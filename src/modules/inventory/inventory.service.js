import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { TrustService } from '../trust/trust.service.js';
import { emitToUser, emitToPartner } from '../../config/socket.js';

export const InventoryService = {
  /**
   * Giữ hàng nguyên tử (Atomic Inventory Reservation)
   * Ngăn chặn race condition khi nhiều người cùng giữ món cuối
   */
  async reserveStock(tx, { listingId, quantity, orderId, reservationMinutes = 30 }) {
    const qty = Number(quantity);
    if (qty <= 0) {
      throw ApiError.badRequest('Số lượng đặt giữ phải lớn hơn 0');
    }

    // 1. Kiểm tra tồn kho listing
    const listing = await tx.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      throw ApiError.notFound('Không tìm thấy sản phẩm');
    }

    if (listing.status !== 'AVAILABLE' && listing.status !== 'EXPIRING_SOON') {
      throw ApiError.badRequest('Sản phẩm hiện không khả dụng để giữ');
    }

    if (new Date(listing.expiryAt) <= new Date()) {
      throw ApiError.badRequest('Sản phẩm đã hết hạn sử dụng / hết giờ giải cứu');
    }

    if (listing.quantity < qty) {
      throw ApiError.badRequest(
        `Số lượng còn lại không đủ! Quán chỉ còn ${listing.quantity} ${listing.unit}.`
      );
    }

    // 2. Trừ tồn kho listing nguyên tử
    const remainingQty = listing.quantity - qty;
    await tx.listing.update({
      where: { id: listingId },
      data: {
        quantity: remainingQty,
        status: remainingQty === 0 ? 'SOLD_OUT' : listing.status
      }
    });

    // 3. Tạo bản ghi InventoryReservation với thời gian hết hạn
    const expiresAt = new Date(Date.now() + reservationMinutes * 60 * 1000);

    const reservation = await tx.inventoryReservation.create({
      data: {
        orderId,
        listingId,
        quantity: qty,
        expiresAt,
        status: 'RESERVED',
        note: `Giữ hàng trong ${reservationMinutes} phút`
      }
    });

    return reservation;
  },

  /**
   * Trả lại tồn kho (Release Reservation)
   * Nếu sản phẩm đã hết date trong lúc giữ, KHÔNG đưa về AVAILABLE mà mark EXPIRED!
   */
  async releaseReservation(tx, reservationId, note = 'Giải phóng giữ món') {
    const res = await tx.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { listing: true }
    });

    if (!res || res.status !== 'RESERVED') {
      return null;
    }

    // Cập nhật reservation status sang RELEASED
    await tx.inventoryReservation.update({
      where: { id: reservationId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        note
      }
    });

    // Kiểm tra date của sản phẩm
    const now = new Date();
    const isListingExpired = new Date(res.listing.expiryAt) <= now;

    if (isListingExpired) {
      // Hàng đã hết date trong lúc giữ -> không bán nữa, đánh dấu EXPIRED
      await tx.listing.update({
        where: { id: res.listingId },
        data: {
          status: 'EXPIRED'
        }
      });
    } else {
      // Hàng còn date -> hoàn lại số lượng khả dụng
      await tx.listing.update({
        where: { id: res.listingId },
        data: {
          quantity: { increment: res.quantity },
          status: 'AVAILABLE'
        }
      });
    }

    return res;
  },

  /**
   * Background Worker Job: Quét các đơn đặt giữ món đã quá hạn (Sweep Expired Reservations)
   * Tự động giải phóng tồn kho + Ghi nhận Customer No-Show
   */
  async sweepExpiredReservations() {
    const now = new Date();
    const expiredReservations = await prisma.inventoryReservation.findMany({
      where: {
        status: 'RESERVED',
        expiresAt: { lte: now }
      },
      include: {
        listing: { include: { partner: true } },
        order: { include: { customer: true } }
      }
    });

    if (expiredReservations.length === 0) return { sweptCount: 0 };

    let sweptCount = 0;

    for (const res of expiredReservations) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Đổi trạng thái reservation sang EXPIRED
          await tx.inventoryReservation.update({
            where: { id: res.id },
            data: {
              status: 'EXPIRED',
              releasedAt: now,
              note: 'Hết hạn giữ món (Customer No-Show)'
            }
          });

          // 2. Hoàn lại tồn kho nếu listing chưa hết date
          const isListingExpired = new Date(res.listing.expiryAt) <= now;
          if (!isListingExpired) {
            await tx.listing.update({
              where: { id: res.listingId },
              data: {
                quantity: { increment: res.quantity },
                status: 'AVAILABLE'
              }
            });
          } else {
            await tx.listing.update({
              where: { id: res.listingId },
              data: { status: 'EXPIRED' }
            });
          }

          // 3. Nếu có order liên kết và đang ở trạng thái PENDING / AWAITING_PAYMENT
          if (res.order && (res.order.status === 'PENDING' || res.order.status === 'AWAITING_PAYMENT')) {
            await tx.order.update({
              where: { id: res.order.id },
              data: {
                status: 'EXPIRED',
                reservationStatus: 'EXPIRED',
                cancellationReason: 'Khách hàng không tới nhận món đúng thời hạn hẹn (No-Show)'
              }
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: res.order.id,
                oldStatus: res.order.status,
                newStatus: 'EXPIRED',
                changedBy: 'SYSTEM_SWEEPER',
                note: 'Tự động hủy đơn do quá hạn giữ món (No-Show)'
              }
            });

            // 4. Phạt điểm tín nhiệm khách hàng (Trust Penalty)
            await TrustService.recordEvent(res.order.customerId, 'CUSTOMER_NO_SHOW', {
              orderId: res.order.id,
              note: `Không đến lấy món #${res.order.orderNumber} trước ${res.expiresAt.toLocaleTimeString('vi-VN')}`
            });

            // Gửi thông báo cho đối tác
            await tx.notification.create({
              data: {
                userId: res.listing.partner.userId,
                type: 'ORDER_STATUS_UPDATED',
                title: `Quá hạn giữ món #${res.order.orderNumber}`,
                message: `Khách hàng không đến nhận phần ăn "${res.listing.title}". Hệ thống đã tự động trả lại ${res.quantity} phần vào kho để bạn tiếp tục bán.`
              }
            });

            // Thông báo cho khách hàng
            await tx.notification.create({
              data: {
                userId: res.order.customerId,
                type: 'ORDER_STATUS_UPDATED',
                title: `Đơn giữ món #${res.order.orderNumber} đã hết hạn`,
                message: `Bạn đã không đến lấy phần ăn trong thời gian giữ món cam kết. Điểm uy tín của bạn bị trừ 15 điểm.`
              }
            });
          }
        });

        sweptCount++;
      } catch (err) {
        console.error(`[Inventory Sweeper Error for Res ${res.id}]:`, err.message);
      }
    }

    return { sweptCount };
  }
};
