import { Router } from 'express';
import { OrderController } from './order.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import { requireVerifiedPartner } from '../../shared/middlewares/partnerGuard.js';
import {
  createOrderSchema,
  estimateShippingSchema,
  bargainShippingSchema,
  respondBargainSchema,
  lockOrderSchema,
  cancelOrderSchema,
  updateOrderStatusSchema,
  confirmHandoverSchema,
  confirmReceiptSchema,
  applyCouponSchema
} from './order.validation.js';

const customerOrderRouter = Router();
const partnerOrderRouter = Router();

// ==========================================
// 1. CUSTOMER ORDER ROUTES
// ==========================================
customerOrderRouter.use(authenticate);

customerOrderRouter.post('/estimate-shipping', validate(estimateShippingSchema), OrderController.estimateShipping);
customerOrderRouter.post('/verify-coupon', validate(applyCouponSchema), OrderController.verifyCoupon);
customerOrderRouter.post('/', validate(createOrderSchema), OrderController.create);
customerOrderRouter.post('/:id/bargain', validate(bargainShippingSchema), OrderController.bargainShippingFee);
customerOrderRouter.patch('/:id/lock', validate(lockOrderSchema), OrderController.lockOrder);
customerOrderRouter.get('/', OrderController.getMyOrders);
customerOrderRouter.get('/:id', OrderController.getOrderById);
customerOrderRouter.patch('/:id/cancel', validate(cancelOrderSchema), OrderController.cancelOrder);
customerOrderRouter.patch('/:id/confirm-receipt', validate(confirmReceiptSchema), OrderController.customerConfirmReceipt);
customerOrderRouter.post('/:id/adjustment-respond', validate(respondAdjustmentSchema), OrderController.respondAdjustment);

// ==========================================
// 2. PARTNER ORDER ROUTES
// ==========================================
partnerOrderRouter.use(authenticate, requireVerifiedPartner);

partnerOrderRouter.post('/:id/bargain-respond', validate(respondBargainSchema), OrderController.respondBargain);
partnerOrderRouter.get('/', OrderController.getPartnerOrders);
partnerOrderRouter.patch('/:id/status', validate(updateOrderStatusSchema), OrderController.updatePartnerOrderStatus);
partnerOrderRouter.patch('/:id/handover', validate(confirmHandoverSchema), OrderController.confirmHandover);
partnerOrderRouter.post('/:id/adjustment-propose', validate(proposeAdjustmentSchema), OrderController.proposeAdjustment);
partnerOrderRouter.patch('/:id/adjust', validate(proposeAdjustmentSchema), OrderController.adjustOrderQuantity);

export { customerOrderRouter as orderRoutes, partnerOrderRouter as partnerOrderRoutes };
