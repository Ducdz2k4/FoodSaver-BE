import { PaymentService } from './payment.service.js';
import { XGateService } from './xgate.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { prisma } from '../../config/database.js';

const standardWebhookSchema = z.object({
  orderId: z.string().uuid(),
  gatewayTransactionId: z.string().trim().min(1).max(80),
  amount: z.coerce.number().positive().finite(),
  signature: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(80).optional()
});

export const paymentController = {
  /**
   * Webhook nhận thông báo biến động số dư từ xGate / SePay / VietQR
   */
  webhook: asyncHandler(async (req, res) => {
    // 1. Xác thực bảo mật nếu hệ thống đã cấu hình PAYMENT_WEBHOOK_SECRET
    if (env.paymentWebhookSecret) {
      const secret = Buffer.from(env.paymentWebhookSecret);
      const xSecret = req.get('X-Webhook-Secret') || req.get('x-api-key') || '';
      const authHeader = req.get('Authorization') || '';
      const sepaySig = req.get('x-sepay-signature') || '';

      let isAuthorized = false;

      // Hỗ trợ header X-Webhook-Secret hoặc X-API-Key
      if (xSecret) {
        const supplied = Buffer.from(xSecret);
        if (supplied.length === secret.length && timingSafeEqual(supplied, secret)) {
          isAuthorized = true;
        }
      }

      // Hỗ trợ header Authorization: Apikey <secret>
      if (!isAuthorized && authHeader.startsWith('Apikey ')) {
        const keyPart = authHeader.replace('Apikey ', '').trim();
        const supplied = Buffer.from(keyPart);
        if (supplied.length === secret.length && timingSafeEqual(supplied, secret)) {
          isAuthorized = true;
        }
      }

      // Hỗ trợ HMAC-SHA256 signature
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

    // 2. Nhận diện Webhook từ xGate / SePay (có các trường type/transferType, gateway, amount/transferAmount, content...)
    const isBankingWebhook = req.body && (
      req.body.gateway !== undefined ||
      req.body.receiver_bank_name !== undefined ||
      req.body.accountNumber !== undefined ||
      req.body.receiver_account !== undefined ||
      req.body.transferAmount !== undefined ||
      req.body.transferType !== undefined ||
      (req.body.type !== undefined && req.body.amount !== undefined)
    );

    if (isBankingWebhook) {
      const result = await PaymentService.processBankingWebhook(req.body);
      return ApiResponse.success(res, {
        message: 'Xử lý webhook ngân hàng thành công',
        data: result
      });
    }

    // 3. Fallback xử lý webhook chuẩn nội bộ / payment simulator
    const payload = standardWebhookSchema.safeParse(req.body);
    if (!payload.success) {
      throw ApiError.badRequest('Dữ liệu webhook không hợp lệ', payload.error.issues);
    }
    const result = await PaymentService.processOnlineWebhook(payload.data);
    return ApiResponse.success(res, {
      message: 'Xử lý webhook thanh toán thành công',
      data: result
    });
  }),

  /**
   * Lấy thông tin tài khoản ngân hàng nhận tiền của hệ thống
   */
  getBankConfig: asyncHandler(async (_req, res) => {
    const config = XGateService.getBankConfig();
    return ApiResponse.success(res, {
      message: 'Lấy thông tin tài khoản thanh toán thành công',
      data: config
    });
  }),

  /**
   * Lấy mã VietQR động theo đơn hàng
   */
  getVietQr: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw ApiError.notFound('Không tìm thấy thông tin đơn hàng');
    }

    const qrUrl = XGateService.generateVietQrUrl({
      amount: Number(order.totalPrice),
      orderNumber: order.orderNumber
    });

    const bankConfig = XGateService.getBankConfig();

    return ApiResponse.success(res, {
      message: 'Tạo mã VietQR thanh toán thành công',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: Number(order.totalPrice),
        paymentStatus: order.paymentStatus,
        bank: bankConfig,
        qrUrl,
        transferMemo: order.orderNumber
      }
    });
  }),

  /**
   * Khách hàng bấm nút xác thực thanh toán tức thì qua xGate API
   */
  verifyOrder: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const result = await XGateService.verifyOrderPayment(orderId);
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  }),

  /**
   * Admin tra cứu lịch sử giao dịch trực tiếp từ xGate REST API
   */
  getXGateTransactions: asyncHandler(async (req, res) => {
    const query = req.query;
    const result = await XGateService.fetchTransactions(query);
    return ApiResponse.success(res, {
      message: 'Tải danh sách giao dịch xGate thành công',
      data: result?.data || result
    });
  }),

  /**
   * Admin bấm nút quét đối soát tất cả đơn hàng đang chờ
   */
  syncXGate: asyncHandler(async (_req, res) => {
    const result = await XGateService.reconcileIncomingTransactions();
    return ApiResponse.success(res, {
      message: result.message,
      data: result
    });
  })
};
