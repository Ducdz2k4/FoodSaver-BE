import { Router } from 'express';
import { PartnerController } from './partner.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import { applyPartnerSchema, verifyPartnerSchema } from './partner.validation.js';

const router = Router();

// Yêu cầu xác thực JWT cho tất cả các route của đối tác
router.use(authenticate);

// User: Nộp hồ sơ & xem hồ sơ của chính mình
router.post('/apply', validate(applyPartnerSchema), PartnerController.apply);
router.get('/me', PartnerController.getMyProfile);

// Admin: Thẩm định hồ sơ đối tác
router.get('/', authorize('ADMIN', 'SYS_ADMIN'), PartnerController.getAllPartners);
router.get('/pending', authorize('ADMIN', 'SYS_ADMIN'), PartnerController.getPendingPartners);
router.patch('/:id/verify', authorize('ADMIN', 'SYS_ADMIN'), validate(verifyPartnerSchema), PartnerController.verifyPartner);

export const partnerRoutes = router;
