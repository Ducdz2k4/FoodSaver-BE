import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { PaymentService } from './payment.service.js';

export const XGateService = {
  /**
   * Lấy cấu hình thông tin ngân hàng FoodSaver
   */
  getBankConfig() {
    return {
      bankName: env.xgate.bankName,
      bankCode: env.xgate.bankCode,
      accountNumber: env.xgate.bankAccount,
      accountName: env.xgate.accountName,
      qrTemplate: 'compact2'
    };
  },

  /**
   * Sinh link ảnh mã VietQR thanh toán tự động cho đơn hàng
   * @param {Object} param0
   * @param {number} param0.amount - Số tiền đơn hàng
   * @param {string} param0.orderNumber - Mã đơn hàng (VD: FS280984)
   * @param {string} [param0.accountName] - Tên chủ tài khoản
   */
  generateVietQrUrl({ amount, orderNumber, accountName }) {
    const bank = env.xgate.bankCode || 'bidv';
    const account = env.xgate.bankAccount || '6240247363';
    const name = encodeURIComponent(accountName || env.xgate.accountName || 'FOODSAVER');
    const memo = encodeURIComponent(orderNumber);
    return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${Math.round(amount)}&addInfo=${memo}&accountName=${name}`;
  },

  /**
   * Sinh link ảnh mã VietQR để Admin quét chuyển tiền cho Đối tác khi rút tiền
   */
  generatePayoutQrUrl({ partnerBank, partnerAccount, amount, payoutId, partnerName }) {
    const bank = (partnerBank || 'bidv').toLowerCase().trim();
    const account = (partnerAccount || '').trim();
    const name = encodeURIComponent(partnerName || 'DOI TAC FOODSAVER');
    const memo = encodeURIComponent(`RUT TIEN FS ${payoutId ? payoutId.slice(0, 8).toUpperCase() : ''}`);
    return `https://img.vietqr.io/image/${bank}-${account}-compact2.png?amount=${Math.round(amount)}&addInfo=${memo}&accountName=${name}`;
  },

  /**
   * Gọi REST API xGate lấy danh sách lịch sử giao dịch ngân hàng
   */
  async fetchTransactions(queryParams = {}) {
    const {
      limit = 50,
      page = 1,
      type, // 'in' or 'out'
      bank,
      account,
      name,
      content,
      amount_min,
      amount_max,
      date_from,
      date_to,
      sort = 'date_desc'
    } = queryParams;

    const url = new URL(`${env.xgate.apiUrl}/transactions`);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', sort);

    if (type) url.searchParams.set('type', type);
    if (bank) url.searchParams.set('bank', bank);
    if (account) url.searchParams.set('account', account);
    if (name) url.searchParams.set('name', name);
    if (content) url.searchParams.set('content', content);
    if (amount_min) url.searchParams.set('amount_min', String(amount_min));
    if (amount_max) url.searchParams.set('amount_max', String(amount_max));
    if (date_from) url.searchParams.set('date_from', date_from);
    if (date_to) url.searchParams.set('date_to', date_to);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': env.xgate.apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`xGate API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data;
  },

  /**
   * Đối soát tự động tất cả đơn hàng đang chờ thanh toán với các giao dịch 'in' gần nhất
   */
  async reconcileIncomingTransactions() {
    try {
      const pendingOrders = await prisma.order.findMany({
        where: {
          paymentMethod: 'SYSTEM_QR',
          paymentStatus: 'PENDING',
          status: { in: ['PENDING', 'ACCEPTED', 'PREPARING'] }
        },
        include: { listing: true, payments: true }
      });

      if (pendingOrders.length === 0) {
        return { matched: 0, checked: 0, message: 'Không có đơn hàng nào đang chờ thanh toán trực tuyến.' };
      }

      // Lấy 50 giao dịch tiền vào gần nhất từ xGate
      const xgateRes = await this.fetchTransactions({ limit: 50, type: 'in', sort: 'date_desc' });
      const transactions = xgateRes?.data?.transactions || [];

      let matchedCount = 0;
      const matchedOrders = [];

      for (const order of pendingOrders) {
        // Tìm giao dịch khớp với orderNumber hoặc UUID và số tiền >= order.totalPrice
        const matchedTx = transactions.find((tx) => {
          const content = String(tx.content || '').toUpperCase();
          const hasCode = content.includes(order.orderNumber.toUpperCase()) || content.includes(order.id.toUpperCase());
          const hasAmount = Number(tx.amount) >= Number(order.totalPrice);
          return hasCode && hasAmount;
        });

        if (matchedTx) {
          console.log(`[xGate Reconcile] Matched transaction ${matchedTx.id} with Order #${order.orderNumber}`);
          await PaymentService.processOnlineWebhook({
            orderId: order.id,
            gatewayTransactionId: matchedTx.id,
            amount: Number(matchedTx.amount),
            idempotencyKey: `xgate_${matchedTx.id}`
          });
          matchedCount++;
          matchedOrders.push({ orderNumber: order.orderNumber, amount: matchedTx.amount, txId: matchedTx.id });
        }
      }

      return {
        matched: matchedCount,
        checked: pendingOrders.length,
        matchedOrders,
        message: `Đã đối soát thành công ${matchedCount}/${pendingOrders.length} đơn hàng qua xGate.`
      };
    } catch (error) {
      console.error('[xGate Reconcile Error]:', error);
      throw error;
    }
  },

  /**
   * Kiểm tra và xác thực thanh toán tức thì cho một đơn hàng cụ thể
   */
  async verifyOrderPayment(orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, payments: true }
    });

    if (!order) {
      throw new Error('Không tìm thấy đơn hàng cần xác thực');
    }

    if (order.paymentStatus === 'PAID') {
      return { success: true, message: 'Đơn hàng đã được thanh toán trước đó', order };
    }

    // Tra cứu xGate theo mã đơn hàng trong content
    const res = await this.fetchTransactions({
      type: 'in',
      content: order.orderNumber,
      limit: 10
    });

    const transactions = res?.data?.transactions || [];
    const matchedTx = transactions.find(
      (tx) => Number(tx.amount) >= Number(order.totalPrice)
    );

    if (matchedTx) {
      console.log(`[xGate Instant Verify] Found matching payment for Order #${order.orderNumber}`);
      const result = await PaymentService.processOnlineWebhook({
        orderId: order.id,
        gatewayTransactionId: matchedTx.id,
        amount: Number(matchedTx.amount),
        idempotencyKey: `xgate_${matchedTx.id}`
      });
      return { success: true, verified: true, message: 'Thanh toán đã được ghi nhận thành công!', result };
    }

    return {
      success: false,
      verified: false,
      message: 'Chưa tìm thấy giao dịch chuyển khoản phù hợp trên hệ thống ngân hàng BIDV. Vui lòng kiểm tra lại sau 10-30 giây.'
    };
  },

  /**
   * Tìm giao dịch chuyển tiền ra ('out') từ xGate khớp với lệnh rút tiền của đối tác
   */
  async findMatchingPayoutTransfer(payout) {
    const res = await this.fetchTransactions({
      type: 'out',
      limit: 30,
      sort: 'date_desc'
    });

    const transactions = res?.data?.transactions || [];
    const targetAmount = Number(payout.amount);
    const partnerAccount = (payout.partner?.partnerProfile?.bankAccountNumber || payout.partner?.bankAccountNumber || '').trim();

    const matched = transactions.find((tx) => {
      const txAmount = Number(tx.amount);
      const receiverAcc = (tx.receiver_account || '').trim();
      const content = String(tx.content || '').toUpperCase();

      const amountMatches = Math.abs(txAmount - targetAmount) < 1;
      const accountMatches = partnerAccount && receiverAcc.includes(partnerAccount);
      const memoMatches = content.includes(payout.id.slice(0, 8).toUpperCase());

      return (amountMatches && accountMatches) || (amountMatches && memoMatches);
    });

    return matched || null;
  }
};
