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
import { notificationRoutes } from '../modules/notifications/notification.routes.js';
import { favoriteRoutes } from '../modules/favorites/favorite.routes.js';
import { adminStatsRoutes } from '../modules/admin/admin.routes.js';
import { recipeRoutes } from '../modules/recipes/recipe.routes.js';
import { mealPlanRoutes } from '../modules/meal-plans/mealPlan.routes.js';
import { communityRoutes } from '../modules/community/community.routes.js';
import { chatRoutes } from '../modules/chat/chat.routes.js';
import { paymentRoutes } from '../modules/payments/payment.routes.js';
import { ledgerRoutes } from '../modules/ledger/ledger.routes.js';
import { communicationRoutes } from '../modules/communication/communication.routes.js';

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

// Payment & Ledger routes
router.use('/payments', paymentRoutes);
router.use('/partner/finance', ledgerRoutes);

// Order Communication (Chat & Call)
router.use('/communication', communicationRoutes);

// Notification routes
router.use('/notifications', notificationRoutes);
router.use('/favorites', favoriteRoutes);

// Meal Planner domain routes
router.use('/recipes', recipeRoutes);
router.use('/meal-plans', mealPlanRoutes);
router.use('/community', communityRoutes);

// AI Chatbot Agent + JEV
router.use('/chat', chatRoutes);

// Admin Analytics & ESG Reports
router.use('/admin', adminStatsRoutes);

export const appRouter = router;
