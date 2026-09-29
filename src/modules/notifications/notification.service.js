import { prisma } from '../../config/database.js';

export const NotificationService = {
  async getNotifications(userId) {
    const list = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return list.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString()
    }));
  },

  async markAsRead(userId, id) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() }
    });
  },

  async markAllAsRead(userId) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    });
  }
};
