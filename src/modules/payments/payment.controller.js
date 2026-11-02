import { PaymentService } from './payment.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/utils/apiError.js';

const webhookSchema = z.object({
  orderId: z.string().uuid(),
  gatewayTransactionId: z.string().trim().min(1).max(80),
  amount: z.coerce.number().positive().finite(),
  signature: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(80).optional()
});

export const paymentController = {
  webhook: asyncHandler(async (req, res) => {
    if (!env.paymentWebhookSecret) {
      throw ApiError.serviceUnavailable('Payment webhook chưa được cấu hình');
    }
    const secret = Buffer.from(env.paymentWebhookSecret);
    const supplied = Buffer.from(req.get('X-Webhook-Secret') || '');
    if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
      throw ApiError.unauthorized('Webhook không hợp lệ');
    }
    const payload = webhookSchema.safeParse(req.body);
    if (!payload.success) {
      throw ApiError.badRequest('Dữ liệu webhook không hợp lệ', payload.error.issues);
    }
    const result = await PaymentService.processOnlineWebhook(payload.data);
    return ApiResponse.success(res, {
      message: 'Xử lý webhook thanh toán thành công',
      data: result
    });
  })
};
