import { NotificationService } from './notification.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const NotificationController = {
  getNotifications: asyncHandler(async (req, res) => {
    const data = await NotificationService.getNotifications(req.user.id);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách thông báo thành công',
      data
    });
  }),

  markAsRead: asyncHandler(async (req, res) => {
    await NotificationService.markAsRead(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Đánh dấu thông báo đã đọc thành công'
    });
  }),

  markAllAsRead: asyncHandler(async (req, res) => {
    await NotificationService.markAllAsRead(req.user.id);
    return ApiResponse.success(res, {
      message: 'Đánh dấu tất cả thông báo đã đọc thành công'
    });
  })
};
