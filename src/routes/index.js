import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { userRoutes } from '../modules/users/user.routes.js';
import { partnerRoutes } from '../modules/partners/partner.routes.js';
import { foodRoutes } from '../modules/foods/food.routes.js';
import { uploadRoutes } from '../modules/upload/upload.routes.js';

const router = Router();

// Mount domain routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/partners', partnerRoutes);
router.use('/admin/partners', partnerRoutes);
router.use('/foods', foodRoutes);
router.use('/upload', uploadRoutes);

export const appRouter = router;
