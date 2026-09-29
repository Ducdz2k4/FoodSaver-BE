import { Router } from 'express';
import { OrderController } from './order.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import { requireVerifiedPartner } from '../../shared/middlewares/partnerGuard.js';
import {
  createOrderSchema,
  cancelOrderSchema,
  updateOrderStatusSchema
} from './order.validation.js';

const customerOrderRouter = Router();
const partnerOrderRouter = Router();

// ==========================================
// 1. CUSTOMER ORDER ROUTES
// ==========================================
customerOrderRouter.use(authenticate);

customerOrderRouter.post('/', validate(createOrderSchema), OrderController.create);
customerOrderRouter.get('/', OrderController.getMyOrders);
customerOrderRouter.get('/:id', OrderController.getOrderById);
customerOrderRouter.patch('/:id/cancel', validate(cancelOrderSchema), OrderController.cancelOrder);

// ==========================================
// 2. PARTNER ORDER ROUTES
// ==========================================
partnerOrderRouter.use(authenticate, requireVerifiedPartner);

partnerOrderRouter.get('/', OrderController.getPartnerOrders);
partnerOrderRouter.patch('/:id/status', validate(updateOrderStatusSchema), OrderController.updatePartnerOrderStatus);

export { customerOrderRouter as orderRoutes, partnerOrderRouter as partnerOrderRoutes };
