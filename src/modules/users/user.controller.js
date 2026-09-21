import { UserService } from './user.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const UserController = {
  getAllUsers: asyncHandler(async (req, res) => {
    const users = await UserService.getAllUsers(req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách người dùng thành công',
      data: users,
      meta: { total: users.length }
    });
  }),

  getUserById: asyncHandler(async (req, res) => {
    const user = await UserService.getUserById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Lấy chi tiết người dùng thành công',
      data: user
    });
  }),

  updateUser: asyncHandler(async (req, res) => {
    const updatedUser = await UserService.updateUser(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật thông tin người dùng thành công',
      data: updatedUser
    });
  }),

  deleteUser: asyncHandler(async (req, res) => {
    const result = await UserService.deleteUser(req.params.id);
    return ApiResponse.success(res, {
      message: 'Xóa người dùng thành công',
      data: result
    });
  })
};
