import { z } from 'zod';

export const foodCategories = ['bakery', 'cooked_meal', 'groceries', 'fruits', 'drinks', 'other'];
export const foodStatuses = ['available', 'reserved', 'sold_out', 'expired'];

export const createFoodSchema = {
  body: z.object({
    title: z.string().min(2, 'Tên món ăn ít nhất 2 ký tự').max(150),
    description: z.string().optional(),
    category: z.enum(foodCategories).default('other'),
    originalPrice: z.number().nonnegative('Giá gốc không được âm'),
    discountedPrice: z.number().nonnegative('Giá sau giảm không được âm'),
    quantity: z.number().int().positive('Số lượng phải lớn hơn 0'),
    unit: z.string().default('phần'),
    expiryTime: z.string().datetime({ message: 'Thời gian hết hạn phải là ISO 8601' }),
    pickupAddress: z.string().min(5, 'Địa chỉ nhận món ăn ít nhất 5 ký tự'),
    donorId: z.string().optional()
  })
};

export const updateFoodSchema = {
  params: z.object({
    id: z.string().min(1, 'ID món ăn là bắt buộc')
  }),
  body: z.object({
    title: z.string().min(2).max(150).optional(),
    description: z.string().optional(),
    category: z.enum(foodCategories).optional(),
    originalPrice: z.number().nonnegative().optional(),
    discountedPrice: z.number().nonnegative().optional(),
    quantity: z.number().int().nonnegative().optional(),
    unit: z.string().optional(),
    expiryTime: z.string().datetime().optional(),
    pickupAddress: z.string().optional(),
    status: z.enum(foodStatuses).optional()
  })
};

export const queryFoodSchema = {
  query: z.object({
    search: z.string().optional(),
    category: z.enum(foodCategories).optional(),
    status: z.enum(foodStatuses).optional(),
    maxPrice: z.coerce.number().optional()
  })
};

export const foodIdParamSchema = {
  params: z.object({
    id: z.string().min(1, 'ID món ăn là bắt buộc')
  })
};
