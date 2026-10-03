import { Router } from 'express';
import { FavoriteController } from './favorite.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', FavoriteController.getMyFavorites);
router.post('/', FavoriteController.addFavorite);
router.delete('/:listingId', FavoriteController.removeFavorite);

export { router as favoriteRoutes };
