import { z } from 'zod';

const OrderStatusEnum = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED'
]);

export const createOrderSchema = {
  body: z.object({
    listingId: z.string().uuid('ID món ăn không hợp lệ'),
    quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu là 1 phần'),
    pickupTimeWindow: z.string().trim().min(1, 'Khung giờ hẹn lấy là bắt buộc'),
    customerNotes: z.string().trim().max(255).optional(),
    customerPhone: z.string().trim().optional()
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
