import { Router } from 'express';
import { ledgerController } from './ledger.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/summary', ledgerController.getFinancialSummary);
router.post('/payout', ledgerController.requestPayout);

export const ledgerRoutes = router;
