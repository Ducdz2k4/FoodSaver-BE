import { Router } from 'express';
import { paymentController } from './payment.controller.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';

const router = Router();

// 1. Webhook endpoint nhận thông báo biến động số dư từ xGate / SePay / VietQR - Public
router.post('/webhook', paymentController.webhook);

// 2. Lấy cấu hình tài khoản ngân hàng & QR Code thanh toán - Public
router.get('/bank-config', paymentController.getBankConfig);
router.get('/vietqr/:orderId', paymentController.getVietQr);

// 3. Khách hàng bấm xác thực thanh toán tức thì qua xGate API
router.post('/verify-order/:orderId', authenticate, paymentController.verifyOrder);

// 4. Admin xem thống kê giao dịch xGate & kích hoạt đối soát tự động
router.get('/xgate/transactions', authenticate, authorize('ADMIN', 'SYS_ADMIN'), paymentController.getXGateTransactions);
router.post('/xgate/sync', authenticate, authorize('ADMIN', 'SYS_ADMIN'), paymentController.syncXGate);

export const paymentRoutes = router;
