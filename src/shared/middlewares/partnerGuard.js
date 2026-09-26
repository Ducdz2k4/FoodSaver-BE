import { ApiError } from '../utils/apiError.js';

/**
 * Middleware bảo vệ các tài nguyên chỉ dành cho đối tác F&B đã được Admin phê duyệt (B2C thuần túy)
 */
export const requireVerifiedPartner = (req, _res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Vui lòng đăng nhập trước khi thực hiện'));
  }

  const partnerStatus = req.user.partnerCapability || req.user.partnerProfile?.verificationStatus;

  if (partnerStatus !== 'VERIFIED') {
    return next(
      ApiError.forbidden(
        'Chỉ đối tác kinh doanh đã được Ban Quản Trị xác thực (VERIFIED) mới có quyền thực hiện hành động này'
      )
    );
  }

  next();
};
