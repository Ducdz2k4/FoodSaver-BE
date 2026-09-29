import { z } from 'zod';

const OrderStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED'
]);

const FulfillmentTypeEnum = z.enum(['PICKUP', 'DELIVERY']).default('PICKUP');
const PaymentMethodEnum = z.enum(['COD', 'SYSTEM_QR']).default('COD');

export const createOrderSchema = {
  body: z.object({
    listingId: z.string().uuid('ID món ăn không hợp lệ'),
    quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu là 1 phần'),
    fulfillmentType: FulfillmentTypeEnum,
    paymentMethod: PaymentMethodEnum,
    deliveryAddress: z.string().trim().max(255).optional(),
    deliveryDistance: z.coerce.number().min(0).max(20, 'Khoảng cách giao hàng tối đa là 20km').optional(),
    shippingFee: z.coerce.number().min(0).max(60000, 'Phí giao hàng tối đa là 60.000đ').default(0),
    negotiatedShippingFee: z.coerce.number().min(0).max(60000, 'Phí giao hàng thương lượng tối đa là 60.000đ').optional(),
    discountCode: z.string().trim().max(50).optional(),
    pickupTimeWindow: z.string().trim().min(1, 'Khung giờ hẹn lấy là bắt buộc'),
    customerNotes: z.string().trim().max(255).optional(),
    customerPhone: z.string().trim().optional()
  })
};

export const estimateShippingSchema = {
  body: z.object({
    distanceKm: z.coerce.number().min(0.1).max(20, 'Khoảng cách tối đa là 20km')
  })
};

export const bargainShippingSchema = {
  params: z.object({
    id: z.string().uuid('ID đơn hàng không hợp lệ')
  }),
  body: z.object({
    proposedFee: z.coerce.number().min(0).max(60000, 'Giá chém tối đa là 60.000đ')
  })
};

export const respondBargainSchema = {
  params: z.object({
    id: z.string().uuid('ID đơn hàng không hợp lệ')
  }),
  body: z.object({
    accepted: z.boolean(),
    finalFee: z.coerce.number().min(0).max(60000).optional(),
    message: z.string().trim().max(255).optional()
  })
};

export const lockOrderSchema = {
  params: z.object({
    id: z.string().uuid('ID đơn hàng không hợp lệ')
  })
};

export const cancelOrderSchema = {
  params: z.object({
    id: z.string().uuid('ID đơn hàng không hợp lệ')
  }),
  body: z.object({
    reason: z.string().trim().max(255).optional()
  })
};

export const updateOrderStatusSchema = {
  params: z.object({
    id: z.string().uuid('ID đơn hàng không hợp lệ')
  }),
  body: z.object({
    status: z.enum(['ACCEPTED', 'REJECTED', 'COMPLETED'])
  })
};

export const applyCouponSchema = {
  body: z.object({
    code: z.string().trim().min(2, 'Mã giảm giá tối thiểu 2 ký tự').max(50),
    orderTotal: z.coerce.number().min(0)
  })
};
