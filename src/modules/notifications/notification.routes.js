import { Router } from 'express';
import { NotificationController } from './notification.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', NotificationController.getNotifications);
router.patch('/read-all', NotificationController.markAllAsRead);
router.patch('/:id/read', NotificationController.markAsRead);

export const notificationRoutes = router;
