import { prisma } from '../config/database.js';
import { emitToUser } from '../config/socket.js';

let reminderIntervalId = null;

export const runPickupReminderSweep = async () => {
  const now = new Date();
  const activeStatuses = [
    'PENDING',
    'AWAITING_PAYMENT',
    'PAID',
    'ACCEPTED',
    'PREPARING',
    'READY',
  ];

  try {
    const orders = await prisma.order.findMany({
      where: {
        fulfillmentType: { in: ['PICKUP', 'STORE_PICKUP'] },
        status: { in: activeStatuses },
        pickupStartAt: { not: null },
        pickupEndAt: { not: null },
      },
      include: {
        listing: { include: { partner: true } },
        reminders: true,
      },
    });

    let sentCount = 0;

    for (const order of orders) {
      const startAt = new Date(order.pickupStartAt).getTime();
      const endAt = new Date(order.pickupEndAt).getTime();
      const nowTime = now.getTime();

      // Only remind if current time is within or before end time
      if (nowTime >= endAt) continue;

      const thirtyMinBeforeStart = startAt - 30 * 60 * 1000;
      const fifteenMinBeforeEnd = endAt - 15 * 60 * 1000;

      const partnerName = order.listing?.partner?.businessName || 'Cửa hàng';
      const address = order.listing?.pickupAddress || order.listing?.partner?.address || 'Tại quán';

      // 1. Nhắc trước giờ lấy 30 phút (hoặc khi đã đến giờ lấy nhưng chưa lấy)
      const hasUpcomingReminder = order.reminders.some((r) => r.reminderType === 'UPCOMING_30M');
      if (!hasUpcomingReminder && nowTime >= thirtyMinBeforeStart && nowTime < endAt) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.orderPickupReminder.create({
              data: {
                orderId: order.id,
                reminderType: 'UPCOMING_30M',
                scheduledFor: now,
                status: 'SENT',
              },
            });

            const notification = await tx.notification.create({
              data: {
                userId: order.customerId,
                type: 'PICKUP_REMINDER',
                title: '⏰ Sắp đến giờ nhận món ăn!',
                message: `Đơn hàng #${order.orderNumber} tại ${partnerName} sẽ sẵn sàng trong khung giờ hẹn (${order.pickupTimeWindow}). Địa chỉ lấy món: ${address}.`,
                payload: {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  pickupTimeWindow: order.pickupTimeWindow,
                  reminderType: 'UPCOMING_30M',
                  actionUrl: `/orders/${order.id}`,
                },
              },
            });

            emitToUser(order.customerId, 'NEW_NOTIFICATION', notification);
          });
          sentCount++;
        } catch (e) {
          // Idempotency collision guard (another process sent it)
          if (!e.message?.includes('Unique constraint')) {
            console.error('[Pickup Reminder Error]:', e.message);
          }
        }
      }

      // 2. Nhắc gần hết hạn lấy món (trước 15 phút kết thúc)
      const hasExpiringReminder = order.reminders.some((r) => r.reminderType === 'EXPIRING_SOON');
      if (!hasExpiringReminder && nowTime >= fifteenMinBeforeEnd && nowTime < endAt) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.orderPickupReminder.create({
              data: {
                orderId: order.id,
                reminderType: 'EXPIRING_SOON',
                scheduledFor: now,
                status: 'SENT',
              },
            });

            const notification = await tx.notification.create({
              data: {
                userId: order.customerId,
                type: 'PICKUP_REMINDER',
                title: '⚠️ Khung giờ nhận món sắp kết thúc!',
                message: `Chỉ còn 15 phút trước khi hết hạn nhận đơn #${order.orderNumber} tại ${partnerName}. Vui lòng ghé nhận ngay để tránh đơn bị quá hạn.`,
                payload: {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  pickupTimeWindow: order.pickupTimeWindow,
                  reminderType: 'EXPIRING_SOON',
                  actionUrl: `/orders/${order.id}`,
                },
              },
            });

            emitToUser(order.customerId, 'NEW_NOTIFICATION', notification);
          });
          sentCount++;
        } catch (e) {
          if (!e.message?.includes('Unique constraint')) {
            console.error('[Pickup Reminder Error]:', e.message);
          }
        }
      }
    }

    if (sentCount > 0) {
      console.log(`[Pickup Reminder] 🔔 Đã gửi ${sentCount} thông báo nhắc giờ lấy hàng.`);
    }
  } catch (error) {
    console.error('[Pickup Reminder Sweep Error]:', error.message);
  }
};

export const startPickupReminderWorker = (intervalMs = 60000) => {
  if (reminderIntervalId) return;

  console.log(`⏱️  Auto Pickup Reminder Worker started (Interval: ${intervalMs / 1000}s)`);
  runPickupReminderSweep();
  reminderIntervalId = setInterval(runPickupReminderSweep, intervalMs);
};

export const stopPickupReminderWorker = () => {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    console.log('⏹️  Auto Pickup Reminder Worker stopped');
  }
};
