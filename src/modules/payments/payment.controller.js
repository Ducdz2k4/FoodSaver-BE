import { PaymentService } from './payment.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const paymentController = {
  webhook: asyncHandler(async (req, res) => {
    const result = await PaymentService.processOnlineWebhook(req.body);
    return ApiResponse.success(res, {
      message: 'Xử lý webhook thanh toán thành công',
      data: result
    });
  })
};
