import { prisma } from '../config/database.js';
import { broadcastEvent } from '../config/socket.js';
import { InventoryService } from '../modules/inventory/inventory.service.js';

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

    // 3. Quét các đơn đặt giữ món quá hạn (No-Show Sweeper)
    const reservationSweep = await InventoryService.sweepExpiredReservations();

    if (expiredResult.count > 0 || expiringSoonResult.count > 0 || reservationSweep.sweptCount > 0) {
      console.log(
        `[Expiry Sweep] 🔄 Swept: ${expiredResult.count} món EXPIRED, ${expiringSoonResult.count} món EXPIRING_SOON, ${reservationSweep.sweptCount} đơn giữ món quá hạn (No-Show) đã giải phóng kho.`
      );
      broadcastEvent('LISTING_UPDATED', {
        action: 'EXPIRY_SWEEP',
        expiredCount: expiredResult.count,
        expiringSoonCount: expiringSoonResult.count,
        sweptReservations: reservationSweep.sweptCount
      });
    }
  } catch (error) {
    console.error('[Expiry Sweep Error]:', error.message);
  }
};

export const startExpirySweepWorker = (intervalMs = 60000) => {
  if (intervalId) return;

  console.log(`⏱️  Auto Expiry Sweep Worker started (Interval: ${intervalMs / 1000}s)`);
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
