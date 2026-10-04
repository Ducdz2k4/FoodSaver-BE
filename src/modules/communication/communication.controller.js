import { CommunicationService } from './communication.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const communicationController = {
  getThread: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const data = await CommunicationService.getOrCreateOrderThread(orderId, req.user.id);
    return ApiResponse.success(res, {
      message: 'Cuộc trò chuyện đơn hàng',
      data
    });
  }),

  sendMessage: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { message } = req.body;
    const data = await CommunicationService.sendMessage(req.user.id, orderId, message);
    return ApiResponse.success(res, {
      message: 'Đã gửi tin nhắn',
      data
    });
  }),

  recordCall: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const data = await CommunicationService.recordCallEvent(req.user.id, orderId, req.body);
    return ApiResponse.success(res, {
      message: 'Đã ghi nhận sự kiện cuộc gọi',
      data
    });
  })
};
