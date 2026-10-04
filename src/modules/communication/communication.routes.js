import { Router } from 'express';
import { communicationController } from './communication.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/orders/:orderId/chat', communicationController.getThread);
router.post('/orders/:orderId/chat', communicationController.sendMessage);
router.post('/orders/:orderId/call', communicationController.recordCall);

export const communicationRoutes = router;
