import { Router } from 'express';
import { ledgerController } from './ledger.controller.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';

const router = Router();

// Yêu cầu quyền quản trị ADMIN hoặc SYS_ADMIN
router.use(authenticate, authorize('ADMIN', 'SYS_ADMIN'));

router.get('/', ledgerController.getAdminPayouts);
router.post('/:id/process', ledgerController.processPayout);
router.post('/:id/complete', ledgerController.completePayout);
router.post('/:id/reject', ledgerController.rejectPayout);

export const adminPayoutRoutes = router;
