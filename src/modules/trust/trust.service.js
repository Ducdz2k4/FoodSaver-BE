import { prisma } from '../../config/database.js';

export const TrustService = {
  /**
   * Lấy hoặc khởi tạo điểm tín nhiệm của người dùng
   */
  async getOrCreateUserTrust(userId) {
    let trust = await prisma.userTrust.findUnique({
      where: { userId }
    });

    if (!trust) {
      trust = await prisma.userTrust.create({
        data: {
          userId,
          trustScore: 100.0,
          trustLevel: 'HIGH',
          noShowCount: 0,
          completedOrders: 0,
          cancelCount: 0
        }
      });
    }

    return trust;
  },

  /**
   * Tính toán Trust Level dựa trên điểm số
   */
  calculateTrustLevel(score) {
    if (score >= 80) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    if (score >= 30) return 'LOW';
    return 'RESTRICTED';
  },

  /**
   * Ghi nhận sự kiện tín nhiệm (Trust Event)
   */
  async recordEvent(userId, eventType, { orderId = null, note = '' } = {}) {
    let scoreDelta = 0;

    switch (eventType) {
      case 'ORDER_COMPLETED':
      case 'SUCCESSFUL_PICKUP':
        scoreDelta = 2.0; // Tăng uy tín khi nhận hàng nghiêm túc
        break;
      case 'CUSTOMER_NO_SHOW':
        scoreDelta = -15.0; // Phạt nặng nếu giữ món cận date mà không đến lấy
        break;
      case 'CANCELLED':
        scoreDelta = -3.0; // Hủy đơn
        break;
      case 'DISPUTED':
        scoreDelta = -10.0;
        break;
      default:
        scoreDelta = 0;
    }

    // 1. Tạo bản ghi audit trust event
    await prisma.trustEvent.create({
      data: {
        userId,
        orderId,
        eventType,
        scoreDelta,
        note
      }
    });

    // 2. Cập nhật UserTrust
    const current = await this.getOrCreateUserTrust(userId);
    const newScore = Math.max(0, Math.min(100, current.trustScore + scoreDelta));
    const newLevel = this.calculateTrustLevel(newScore);

    const updateData = {
      trustScore: newScore,
      trustLevel: newLevel
    };

    if (eventType === 'CUSTOMER_NO_SHOW') {
      updateData.noShowCount = { increment: 1 };
      updateData.lastNoShowAt = new Date();
    } else if (eventType === 'ORDER_COMPLETED' || eventType === 'SUCCESSFUL_PICKUP') {
      updateData.completedOrders = { increment: 1 };
    } else if (eventType === 'CANCELLED') {
      updateData.cancelCount = { increment: 1 };
    }

    return prisma.userTrust.update({
      where: { userId },
      data: updateData
    });
  },

  /**
   * Kiểm tra quyền đặt giữ hàng (Reservation Limits) dựa trên Trust Level
   */
  async checkReservationEligibility(userId) {
    const trust = await this.getOrCreateUserTrust(userId);
    
    // Config hạn mức giữ món theo uy tín
    const limits = {
      HIGH: { maxActiveReservations: 5, reservationMinutes: 45, allowCashOnPickup: true },
      MEDIUM: { maxActiveReservations: 3, reservationMinutes: 30, allowCashOnPickup: true },
      LOW: { maxActiveReservations: 1, reservationMinutes: 20, allowCashOnPickup: true },
      RESTRICTED: { maxActiveReservations: 0, reservationMinutes: 15, allowCashOnPickup: false }
    };

    const currentLimit = limits[trust.trustLevel] || limits.MEDIUM;

    return {
      trustScore: trust.trustScore,
      trustLevel: trust.trustLevel,
      noShowCount: trust.noShowCount,
      completedOrders: trust.completedOrders,
      ...currentLimit
    };
  }
};
