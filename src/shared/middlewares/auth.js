import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/apiError.js';
import { UserModel } from '../../modules/users/user.model.js';

/**
 * Middleware to verify JWT and authenticate the request
 */
export const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Vui lòng cung cấp token xác thực hợp lệ dạng Bearer <token>');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('Mã token không được để trống');
    }

    const decoded = verifyAccessToken(token);

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      throw ApiError.unauthorized('Tài khoản thuộc token này không tồn tại trong hệ thống');
    }

    if (user.status === 'BANNED') {
      throw ApiError.forbidden('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên');
    }

    const authPath = req.originalUrl.split('?')[0];
    const isOtpRoute = authPath.endsWith('/auth/verify-otp') || authPath.endsWith('/auth/resend-otp');
    const isPasswordSetupRoute = authPath.endsWith('/auth/set-password') || authPath.endsWith('/auth/logout');
    if (user.status === 'INACTIVE' && !isOtpRoute) {
      throw ApiError.forbidden('Tài khoản của bạn chưa được kích hoạt');
    }

    if (user.passwordSetupRequired && !isPasswordSetupRoute) {
      throw ApiError.forbidden('Vui lòng thiết lập mật khẩu trước khi tiếp tục sử dụng tài khoản');
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
/**
 * Middleware for Role-Based Access Control (RBAC)
 * @param  {...string} allowedRoles - List of allowed roles (e.g. 'ADMIN', 'PARTNER')
 */
export const authorize = (...allowedRoles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Yêu cầu xác thực tài khoản trước khi phân quyền'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Bạn không có quyền thực hiện hành động này. Yêu cầu quyền: [${allowedRoles.join(', ')}]`
        )
      );
    }

    next();
  };
};
