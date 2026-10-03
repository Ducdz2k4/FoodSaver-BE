import { FavoriteService } from './favorite.service.js';

export const FavoriteController = {
  async getMyFavorites(req, res, next) {
    try {
      const listingIds = await FavoriteService.getMyFavorites(req.user.id);
      res.json({ success: true, data: listingIds });
    } catch (error) {
      next(error);
    }
  },

  async addFavorite(req, res, next) {
    try {
      const { listingId } = req.body;
      await FavoriteService.addFavorite(req.user.id, listingId);
      res.status(201).json({ success: true, message: 'Added to favorites' });
    } catch (error) {
      next(error);
    }
  },

  async removeFavorite(req, res, next) {
    try {
      const { listingId } = req.params;
      await FavoriteService.removeFavorite(req.user.id, listingId);
      res.json({ success: true, message: 'Removed from favorites' });
    } catch (error) {
      next(error);
    }
  },
};
