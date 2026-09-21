import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const AuthController = {
  register: asyncHandler(async (req, res) => {
    const result = await AuthService.register(req.body);
    return ApiResponse.created(res, {
      message: 'Đăng ký tài khoản thành công',
      data: result
    });
  }),

  login: asyncHandler(async (req, res) => {
    const result = await AuthService.login(req.body);
    return ApiResponse.success(res, {
      message: 'Đăng nhập thành công',
      data: result
    });
  }),

  refreshToken: asyncHandler(async (req, res) => {
    const result = await AuthService.refreshToken(req.body.refreshToken);
    return ApiResponse.success(res, {
      message: 'Làm mới token thành công',
      data: result
    });
  }),

  getMe: asyncHandler(async (req, res) => {
    const user = await AuthService.getMe(req.user.id);
    return ApiResponse.success(res, {
      message: 'Lấy thông tin tài khoản hiện tại thành công',
      data: user
    });
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const updated = await AuthService.updateProfile(req.user.id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật thông tin tài khoản thành công',
      data: updated
    });
  }),

  changePassword: asyncHandler(async (req, res) => {
    const result = await AuthService.changePassword(req.user.id, req.body);
    return ApiResponse.success(res, {
      message: result.message
    });
  }),

  logout: asyncHandler(async (req, res) => {
    const result = await AuthService.logout(req.user.id);
    return ApiResponse.success(res, {
      message: result.message
    });
  })
};
