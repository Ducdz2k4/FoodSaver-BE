import { z } from 'zod';

const FoodCategoryEnum = z.enum([
  'BAKERY',
  'COOKED_MEAL',
  'GROCERIES',
  'FRUITS',
  'DRINKS',
  'OTHER'
]);

const ListingStatusEnum = z.enum([
  'AVAILABLE',
  'EXPIRING_SOON',
  'SOLD_OUT',
  'EXPIRED',
  'UNAVAILABLE'
]);

export const createListingSchema = {
  body: z.object({
    title: z.string().trim().min(2, 'Tên món ăn tối thiểu 2 ký tự').max(150),
    description: z.string().trim().max(1000).optional(),
    category: FoodCategoryEnum.default('OTHER'),
    originalPrice: z.coerce.number().min(0, 'Giá gốc không được âm'),
    discountPrice: z.coerce.number().min(0, 'Giá giải cứu không được âm'),
    quantity: z.coerce.number().int().min(1, 'Số lượng tối thiểu là 1'),
    unit: z.string().trim().min(1).default('phần'),
    expiryAt: z.string().datetime({ message: 'Thời hạn hết hạn phải là ISO Datetime hợp lệ' }),
    pickupStartTime: z.string().trim().min(1, 'Giờ bắt đầu nhận hàng là bắt buộc'),
    pickupEndTime: z.string().trim().min(1, 'Giờ kết thúc nhận hàng là bắt buộc'),
    pickupAddress: z.string().trim().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    imageUrls: z.array(z.string().url('Link ảnh không hợp lệ')).min(1, 'Cần ít nhất 1 ảnh món ăn'),
    safetyNotes: z.string().trim().max(500).optional()
  })
};

export const updateListingSchema = {
  params: z.object({
    id: z.string().uuid('ID món ăn không hợp lệ')
  }),
  body: z.object({
    title: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(1000).optional(),
    category: FoodCategoryEnum.optional(),
    originalPrice: z.coerce.number().min(0).optional(),
    discountPrice: z.coerce.number().min(0).optional(),
    quantity: z.coerce.number().int().min(0).optional(),
    unit: z.string().trim().optional(),
    expiryAt: z.string().datetime().optional(),
    pickupStartTime: z.string().trim().optional(),
    pickupEndTime: z.string().trim().optional(),
    pickupAddress: z.string().trim().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    imageUrls: z.array(z.string().url()).min(1).optional(),
    safetyNotes: z.string().trim().max(500).optional(),
    status: ListingStatusEnum.optional()
  })
};

export const updateListingStatusSchema = {
  params: z.object({
    id: z.string().uuid('ID món ăn không hợp lệ')
  }),
  body: z.object({
    status: ListingStatusEnum
  })
};

export const queryListingsSchema = {
  query: z.object({
    search: z.string().trim().optional(),
    category: FoodCategoryEnum.optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.5).max(50).default(5).optional(),
    urgentOnly: z.coerce.boolean().optional(),
    sortBy: z.enum(['EXPIRY', 'PRICE_ASC', 'PRICE_DESC', 'URGENCY', 'NEWEST']).default('EXPIRY').optional(),
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(12).optional()
  })
};
