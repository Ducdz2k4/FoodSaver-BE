import { PaymentService } from './payment.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/utils/apiError.js';

const standardWebhookSchema = z.object({
  orderId: z.string().uuid(),
  gatewayTransactionId: z.string().trim().min(1).max(80),
  amount: z.coerce.number().positive().finite(),
  signature: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(80).optional()
});

export const paymentController = {
  webhook: asyncHandler(async (req, res) => {
    // 1. Xác thực bảo mật nếu hệ thống đã cấu hình PAYMENT_WEBHOOK_SECRET
    if (env.paymentWebhookSecret) {
      const secret = Buffer.from(env.paymentWebhookSecret);
      const xSecret = req.get('X-Webhook-Secret') || '';
      const authHeader = req.get('Authorization') || '';
      const sepaySig = req.get('x-sepay-signature') || '';

      let isAuthorized = false;

      // Hỗ trợ header X-Webhook-Secret chuẩn
      if (xSecret) {
        const supplied = Buffer.from(xSecret);
        if (supplied.length === secret.length && timingSafeEqual(supplied, secret)) {
          isAuthorized = true;
        }
      }

      // Hỗ trợ header Authorization: Apikey <secret> (Chuẩn SePay)
      if (!isAuthorized && authHeader.startsWith('Apikey ')) {
        const keyPart = authHeader.replace('Apikey ', '').trim();
        const supplied = Buffer.from(keyPart);
        if (supplied.length === secret.length && timingSafeEqual(supplied, secret)) {
          isAuthorized = true;
        }
      }

      // Hỗ trợ HMAC-SHA256 signature (x-sepay-signature)
      if (!isAuthorized && sepaySig) {
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const expectedSig = createHmac('sha256', env.paymentWebhookSecret).update(rawBody).digest('hex');
        if (sepaySig.toLowerCase() === expectedSig.toLowerCase()) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        throw ApiError.unauthorized('Webhook signature hoặc secret key không hợp lệ');
      }
    }

    // 2. Nhận diện Webhook từ SePay / Ngân hàng (chứa gateway, accountNumber, transferAmount, transferType...)
    const isSePayFormat = req.body && (
      req.body.gateway !== undefined ||
      req.body.accountNumber !== undefined ||
      req.body.transferAmount !== undefined ||
      req.body.transferType !== undefined
    );

    if (isSePayFormat) {
      const result = await PaymentService.processSePayWebhook(req.body);
      return ApiResponse.success(res, {
        message: 'Xử lý SePay webhook thành công',
        data: result
      });
    }

    // 3. Xử lý webhook chuẩn nội bộ / payment simulator
    const payload = standardWebhookSchema.safeParse(req.body);
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
