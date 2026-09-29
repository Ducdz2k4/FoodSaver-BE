import { Router } from 'express';
import { ListingController } from './listing.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import { requireVerifiedPartner } from '../../shared/middlewares/partnerGuard.js';
import {
  createListingSchema,
  updateListingSchema,
  updateListingStatusSchema,
  queryListingsSchema
} from './listing.validation.js';

const publicRouter = Router();
const partnerRouter = Router();
const adminRouter = Router();

// ==========================================
// 1. PUBLIC ROUTES (Customer Discovery)
// ==========================================
publicRouter.get('/', validate(queryListingsSchema), ListingController.getPublicListings);
publicRouter.get('/:id', ListingController.getListingById);

// ==========================================
// 2. PARTNER ROUTES (Merchant Center)
// ==========================================
partnerRouter.use(authenticate, requireVerifiedPartner);

partnerRouter.post('/', validate(createListingSchema), ListingController.create);
partnerRouter.get('/', ListingController.getPartnerListings);
partnerRouter.put('/:id', validate(updateListingSchema), ListingController.update);
partnerRouter.patch('/:id/status', validate(updateListingStatusSchema), ListingController.toggleStatus);
partnerRouter.delete('/:id', ListingController.delete);

// ==========================================
// 3. ADMIN ROUTES (Platform Moderation)
// ==========================================
adminRouter.use(authenticate, authorize('ADMIN', 'SYS_ADMIN'));

adminRouter.get('/', ListingController.getAdminListings);
adminRouter.patch('/:id/status', validate(updateListingStatusSchema), ListingController.toggleStatus);

export { publicRouter as listingRoutes, partnerRouter as partnerListingRoutes, adminRouter as adminListingRoutes };
