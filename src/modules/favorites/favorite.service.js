import { prisma } from '../../config/database.js';

export const FavoriteService = {
  async getMyFavorites(userId) {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      select: { listingId: true },
      orderBy: { createdAt: 'desc' },
    });
    return favorites.map((f) => f.listingId);
  },

  async addFavorite(userId, listingId) {
    const existing = await prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (existing) return existing;
    return prisma.favorite.create({ data: { userId, listingId } });
  },

  async removeFavorite(userId, listingId) {
    const existing = await prisma.favorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    if (!existing) return null;
    return prisma.favorite.delete({
      where: { userId_listingId: { userId, listingId } },
    });
  },
};
