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

  getMe: asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'] || 'usr_1';
    const user = await AuthService.getMe(userId);
    return ApiResponse.success(res, {
      message: 'Lấy thông tin người dùng hiện tại thành công',
      data: user
    });
  })
};
