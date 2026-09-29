import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { userRoutes } from '../modules/users/user.routes.js';
import { partnerRoutes } from '../modules/partners/partner.routes.js';
import { uploadRoutes } from '../modules/upload/upload.routes.js';
import {
  listingRoutes,
  partnerListingRoutes,
  adminListingRoutes
} from '../modules/listings/listing.routes.js';
import {
  orderRoutes,
  partnerOrderRoutes
} from '../modules/orders/order.routes.js';

const router = Router();

// Mount domain routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/partners', partnerRoutes);
router.use('/admin/partners', partnerRoutes);
router.use('/upload', uploadRoutes);

// Listing routes (Public, Partner, Admin)
router.use('/listings', listingRoutes);
router.use('/partner/listings', partnerListingRoutes);
router.use('/admin/listings', adminListingRoutes);

// Order routes (Customer & Partner)
router.use('/orders', orderRoutes);
router.use('/partner/orders', partnerOrderRoutes);

export const appRouter = router;
