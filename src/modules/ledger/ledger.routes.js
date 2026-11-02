import { Router } from 'express';
import { ledgerController } from './ledger.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import { requireVerifiedPartner } from '../../shared/middlewares/partnerGuard.js';

const router = Router();

// Yêu cầu đăng nhập và chỉ cho phép đối tác F&B đã được phê duyệt (VERIFIED)
router.use(authenticate, requireVerifiedPartner);

router.get('/summary', ledgerController.getFinancialSummary);
router.post('/payout', ledgerController.requestPayout);

export const ledgerRoutes = router;
