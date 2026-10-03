import { z } from 'zod';

export const applyPartnerSchema = {
  body: z.object({
    businessName: z.string().trim().min(2, 'Tên doanh nghiệp/quán ăn phải từ 2 ký tự').max(150),
    businessLicenseNo: z.string().trim().min(3, 'Mã số ĐKKD/MST phải từ 3 ký tự').max(100),
    businessLicenseUrl: z.string().trim().min(1, 'Link ảnh GPKD không được để trống').max(500),
    foodSafetyCertUrl: z.string().trim().min(1, 'Link ảnh Chứng nhận ATTP không được để trống').max(500),
    businessType: z
      .enum(['CONVENIENCE_STORE', 'BAKERY', 'RESTAURANT', 'SUPERMARKET', 'OTHER'])
      .default('OTHER'),
    address: z.string().trim().min(5, 'Địa chỉ chi tiết phải từ 5 ký tự').max(255),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    phone: z.string().trim().min(8, 'Số điện thoại tối thiểu 8 chữ số').max(20)
  })
};

export const verifyPartnerSchema = {
  params: z.object({
    id: z.string().trim().min(1, 'ID đối tác không được để trống')
  }),
  body: z.object({
    status: z.enum(['VERIFIED', 'REJECTED'], {
      required_error: 'Trạng thái thẩm định (status) bắt buộc là VERIFIED hoặc REJECTED'
    }),
    rejectionReason: z.string().trim().optional()
  })
};
