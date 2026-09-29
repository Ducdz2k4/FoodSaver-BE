import { prisma } from '../config/database.js';
import { broadcastEvent } from '../config/socket.js';

let intervalId = null;

export const runExpirySweep = async () => {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  try {
    // 1. Quét các món đã quá hạn sử dụng -> chuyển sang EXPIRED
    const expiredResult = await prisma.listing.updateMany({
      where: {
        status: { in: ['AVAILABLE', 'EXPIRING_SOON'] },
        expiryAt: { lte: now }
      },
      data: {
        status: 'EXPIRED'
      }
    });

    // 2. Quét các món còn dưới 2 giờ -> chuyển sang EXPIRING_SOON
    const expiringSoonResult = await prisma.listing.updateMany({
      where: {
        status: 'AVAILABLE',
        expiryAt: {
          gt: now,
          lte: twoHoursLater
        }
      },
      data: {
        status: 'EXPIRING_SOON'
      }
    });

    if (expiredResult.count > 0 || expiringSoonResult.count > 0) {
      console.log(
        `[Expiry Sweep] 🔄 Swept: ${expiredResult.count} món đã hết hạn (EXPIRED), ${expiringSoonResult.count} món chuyển sang cấp bách (EXPIRING_SOON)`
      );
      // Phát Socket.IO để các client realtime cập nhật ngay mà không cần reload
      broadcastEvent('LISTING_UPDATED', {
        action: 'EXPIRY_SWEEP',
        expiredCount: expiredResult.count,
        expiringSoonCount: expiringSoonResult.count
      });
    }
  } catch (error) {
    console.error('[Expiry Sweep Error]:', error.message);
  }
};

/**
 * Khởi động tiến trình quét tự động định kỳ
 * @param {number} intervalMs - Chu kỳ quét (Mặc định: 60.000ms = 1 phút)
 */
export const startExpirySweepWorker = (intervalMs = 60000) => {
  if (intervalId) return;

  console.log(`⏱️  Auto Expiry Sweep Worker started (Interval: ${intervalMs / 1000}s)`);

  // Chạy ngay lần đầu khi server khởi động
  runExpirySweep();

  intervalId = setInterval(runExpirySweep, intervalMs);
};

export const stopExpirySweepWorker = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Expiry Sweep Worker stopped]');
  }
};
