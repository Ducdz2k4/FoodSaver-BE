import { UserService } from './user.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const UserController = {
  getAllUsers: asyncHandler(async (req, res) => {
    const result = await UserService.getAllUsers(req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách người dùng thành công',
      data: result.users,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  }),

  getUserById: asyncHandler(async (req, res) => {
    const user = await UserService.getUserById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Lấy thông tin người dùng thành công',
      data: user
    });
  }),

  createUser: asyncHandler(async (req, res) => {
    const newUser = await UserService.createUser(req.body);
    return ApiResponse.created(res, {
      message: 'Tạo tài khoản người dùng thành công',
      data: newUser
    });
  }),

  updateUser: asyncHandler(async (req, res) => {
    const updatedUser = await UserService.updateUser(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật thông tin người dùng thành công',
      data: updatedUser
    });
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const updated = await UserService.updateStatus(req.params.id, req.body.status, req.user.id);
    return ApiResponse.success(res, {
      message: 'Cập nhật trạng thái tài khoản thành công',
      data: updated
    });
  }),

  updateRole: asyncHandler(async (req, res) => {
    const updated = await UserService.updateRole(req.params.id, req.body.role, req.user.id);
    return ApiResponse.success(res, {
      message: 'Cập nhật vai trò tài khoản thành công',
      data: updated
    });
  }),

  deleteUser: asyncHandler(async (req, res) => {
    const result = await UserService.deleteUser(req.params.id, req.user.id);
    return ApiResponse.success(res, {
      message: result.message,
      data: { id: result.id }
    });
  })
};
