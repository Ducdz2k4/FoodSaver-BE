import { Router } from 'express';
import { paymentController } from './payment.controller.js';

const router = Router();

// Webhook endpoint (được gọi từ cổng thanh toán hoặc simulator)
router.post('/webhook', paymentController.webhook);

export const paymentRoutes = router;
