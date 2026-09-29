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
  applyCouponSchema
} from './order.validation.js';

const customerOrderRouter = Router();
const partnerOrderRouter = Router();

// ==========================================
// 1. CUSTOMER ORDER ROUTES
// ==========================================
customerOrderRouter.use(authenticate);

// Ước tính phí ship
customerOrderRouter.post('/estimate-shipping', validate(estimateShippingSchema), OrderController.estimateShipping);

// Xác thực mã giảm giá
customerOrderRouter.post('/verify-coupon', validate(applyCouponSchema), OrderController.verifyCoupon);

// Tạo đơn
customerOrderRouter.post('/', validate(createOrderSchema), OrderController.create);

// Khách chém giá phí ship
customerOrderRouter.post('/:id/bargain', validate(bargainShippingSchema), OrderController.bargainShippingFee);

// Khóa đơn sau 5s
customerOrderRouter.patch('/:id/lock', validate(lockOrderSchema), OrderController.lockOrder);

// Tra cứu & Hủy
customerOrderRouter.get('/', OrderController.getMyOrders);
customerOrderRouter.get('/:id', OrderController.getOrderById);
customerOrderRouter.patch('/:id/cancel', validate(cancelOrderSchema), OrderController.cancelOrder);

// ==========================================
// 2. PARTNER ORDER ROUTES
// ==========================================
partnerOrderRouter.use(authenticate, requireVerifiedPartner);

// Quán phản hồi chém giá
partnerOrderRouter.post('/:id/bargain-respond', validate(respondBargainSchema), OrderController.respondBargain);

// Danh sách & Đổi trạng thái
partnerOrderRouter.get('/', OrderController.getPartnerOrders);
partnerOrderRouter.patch('/:id/status', validate(updateOrderStatusSchema), OrderController.updatePartnerOrderStatus);

export { customerOrderRouter as orderRoutes, partnerOrderRouter as partnerOrderRoutes };
