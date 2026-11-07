import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const LedgerService = {
  /**
   * Đảm bảo các tài khoản kế toán tồn tại
   */
  async ensureAccount(code, type, partnerId = null, name = '') {
    let account = await prisma.ledgerAccount.findUnique({
      where: { code }
    });

    if (!account) {
      account = await prisma.ledgerAccount.create({
        data: {
          code,
          type,
          partnerId,
          name: name || code,
          currency: 'VND',
          balance: 0
        }
      });
    }

    return account;
  },

  /**
   * Tạo giao dịch kép (Double-Entry Transaction)
   * BẮT BUỘC: Tổng Debit === Tổng Credit
   */
  async createDoubleEntryTransaction(tx, {
    transactionNo,
    idempotencyKey,
    orderId,
    type,
    amount,
    description,
    entries // array of { accountCode, accountType, partnerId, entryType: 'DEBIT' | 'CREDIT', amount }
  }) {
    // 1. Kiểm tra idempotency
    if (idempotencyKey) {
      const existing = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        include: { entries: { include: { account: true } } }
      });
      if (existing) {
        return existing;
      }
    }

    // 2. Validate Tổng Nợ == Tổng Có
    let totalDebit = 0;
    let totalCredit = 0;

    for (const e of entries) {
      const val = Number(e.amount);
      if (e.entryType === 'DEBIT') {
        totalDebit += val;
      } else if (e.entryType === 'CREDIT') {
        totalCredit += val;
      } else {
        throw ApiError.badRequest(`Loại bút toán không hợp lệ: ${e.entryType}`);
      }
    }

    if (Math.round(totalDebit) !== Math.round(totalCredit)) {
      throw ApiError.internal(
        `Vi phạm nguyên tắc kế toán kép: Tổng Nợ (${totalDebit}) khác Tổng Có (${totalCredit})!`
      );
    }

    // 3. Tạo transaction record
    const ledgerTx = await tx.ledgerTransaction.create({
      data: {
        transactionNo: transactionNo || `LTX_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        idempotencyKey: idempotencyKey || null,
        orderId: orderId || null,
        type,
        amount: totalDebit,
        description: description || ''
      }
    });

    // 4. Tạo các entry và cập nhật số dư account
    for (const e of entries) {
      // Tìm hoặc tạo account
      let account = await tx.ledgerAccount.findUnique({
        where: { code: e.accountCode }
      });

      if (!account) {
        account = await tx.ledgerAccount.create({
          data: {
            code: e.accountCode,
            type: e.accountType,
            partnerId: e.partnerId || null,
            name: e.accountName || e.accountCode,
            currency: 'VND',
            balance: 0
          }
        });
      }

      await tx.ledgerEntry.create({
        data: {
          transactionId: ledgerTx.id,
          accountId: account.id,
          entryType: e.entryType,
          amount: e.amount
        }
      });

      // Cập nhật balance account (Asset/Expense: Debit + / Credit -; Liability/Equity/Revenue: Credit + / Debit -)
      const isNormalDebit = ['GATEWAY_CLEARING', 'ESCROW', 'PARTNER_RECEIVABLE', 'REFUND_PAYABLE'].includes(e.accountType);
      const delta = e.entryType === 'DEBIT' ? (isNormalDebit ? Number(e.amount) : -Number(e.amount)) : (isNormalDebit ? -Number(e.amount) : Number(e.amount));

      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: {
          balance: { increment: delta }
        }
      });
    }

    return ledgerTx;
  },

  /**
   * USE CASE 1: ONLINE PAYMENT (Khách thanh toán trực tuyến qua Gateway)
   * Tiền vào Escrow (Tạm giữ):
   * Dr gateway_clearing: [Total Amount]
   * Cr escrow:           [Total Amount]
   */
  async recordOnlineEscrow({ orderId, amount, idempotencyKey }, transactionClient) {
    const execute = async (tx) => {
      const amt = Number(amount);
      const entries = [
        {
          accountCode: 'gateway_clearing',
          accountType: 'GATEWAY_CLEARING',
          entryType: 'DEBIT',
          amount: amt,
          accountName: 'Tài khoản thanh toán cổng Gateway'
        },
        {
          accountCode: 'escrow',
          accountType: 'ESCROW',
          entryType: 'CREDIT',
          amount: amt,
          accountName: 'Tài khoản ký quỹ giữ hộ (Escrow)'
        }
      ];

      return this.createDoubleEntryTransaction(tx, {
        idempotencyKey: idempotencyKey || `escrow_${orderId}`,
        orderId,
        type: 'ONLINE_PAYMENT_ESCROW',
        amount: amt,
        description: `Ký quỹ tiền hàng đơn #${orderId} vào Escrow`,
        entries
      });
    };
    return transactionClient ? execute(transactionClient) : prisma.$transaction(execute);
  },

  /**
   * USE CASE 2: ONLINE SETTLEMENT (Đơn ONLINE hoàn tất)
   * Phân bổ từ Escrow:
   * Dr escrow:           [Total = merchandiseTotal + shippingFee]
   * Cr partner_pending:  [(merchandiseTotal - serviceFee) + shippingFee] (100% shipping thuộc partner)
   * Cr platform_revenue: [serviceFee] (Chỉ tính trên merchandise, KHÔNG tính trên shipping)
   */
  async recordOrderSettlement({ orderId, partnerId, merchandiseTotal, serviceFee, shippingFee = 0, discountAmount = 0, idempotencyKey }, transactionClient) {
    const execute = async (tx) => {
      const key = idempotencyKey || `settle_${orderId}`;
      const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const merch = Number(merchandiseTotal);
      const fee = Number(serviceFee);
      const ship = Number(shippingFee);
      const discount = Number(discountAmount);
      const partnerEarnings = Math.max(0, merch - fee + ship);
      const totalEscrowRelease = merch + ship - discount;
      const platformRevenue = fee - discount;

      const entries = [
        {
          accountCode: 'escrow',
          accountType: 'ESCROW',
          entryType: 'DEBIT',
          amount: totalEscrowRelease,
          accountName: 'Tài khoản ký quỹ giữ hộ (Escrow)'
        },
        {
          accountCode: `partner_pending:${partnerId}`,
          accountType: 'PARTNER_PENDING',
          partnerId,
          entryType: 'CREDIT',
          amount: partnerEarnings,
          accountName: `Doanh thu chờ đối soát - Quán ${partnerId}`
        },
        {
          accountCode: 'platform_revenue',
          accountType: 'PLATFORM_REVENUE',
          entryType: platformRevenue >= 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(platformRevenue),
          accountName: 'Doanh thu phí dịch vụ nền tảng FoodSaver'
        }
      ];

      const ledgerTx = await this.createDoubleEntryTransaction(tx, {
        idempotencyKey: idempotencyKey || `settle_${orderId}`,
        orderId,
        type: 'ORDER_SETTLEMENT',
        amount: totalEscrowRelease,
        description: `Đối soát hoàn thành đơn ONLINE #${orderId}`,
        entries
      });

      // Cập nhật Projection: PartnerWallet
      await tx.partnerWallet.upsert({
        where: { partnerId },
        update: {
          pendingBalance: { increment: partnerEarnings }
        },
        create: {
          partnerId,
          availableBalance: 0,
          pendingBalance: partnerEarnings
        }
      });

      return ledgerTx;
    };
    return transactionClient ? execute(transactionClient) : prisma.$transaction(execute);
  },

  /**
   * Chuyển số dư từ Pending sang Available sau dispute window
   */
  async releasePendingToAvailable(partnerId, amount, idempotencyKey) {
    return prisma.$transaction(async (tx) => {
      const amt = Number(amount);
      const entries = [
        {
          accountCode: `partner_pending:${partnerId}`,
          accountType: 'PARTNER_PENDING',
          partnerId,
          entryType: 'DEBIT',
          amount: amt
        },
        {
          accountCode: `partner_wallet:${partnerId}`,
          accountType: 'PARTNER_WALLET',
          partnerId,
          entryType: 'CREDIT',
          amount: amt
        }
      ];

      const ledgerTx = await this.createDoubleEntryTransaction(tx, {
        idempotencyKey,
        type: 'RELEASE_PENDING_TO_AVAILABLE',
        amount: amt,
        description: `Chuyển số dư khả dụng cho đối tác ${partnerId}`,
        entries
      });

      await tx.partnerWallet.update({
        where: { partnerId },
        data: {
          pendingBalance: { decrement: amt },
          availableBalance: { increment: amt }
        }
      });

      return ledgerTx;
    });
  },

  /**
   * USE CASE 3: CASH ORDER (Thanh toán tiền mặt cho Partner)
   * Khách trả tiền mặt trực tiếp cho Quán, Marketplace không giữ tiền hàng.
   * Ghi nhận nợ phí dịch vụ:
   * Dr partner_receivable: [serviceFee]
   * Cr platform_revenue:   [serviceFee]
   */
  async recordCashReceivableBooking({ orderId, partnerId, merchandiseTotal, serviceFee, idempotencyKey }, transactionClient) {
    const execute = async (tx) => {
      const key = idempotencyKey || `cash_fee_${orderId}`;
      const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const fee = Number(serviceFee);

      const entries = [
        {
          accountCode: `partner_receivable:${partnerId}`,
          accountType: 'PARTNER_RECEIVABLE',
          partnerId,
          entryType: 'DEBIT',
          amount: fee,
          accountName: `Khoản nợ phí dịch vụ tiền mặt - Quán ${partnerId}`
        },
        {
          accountCode: 'platform_revenue',
          accountType: 'PLATFORM_REVENUE',
          entryType: 'CREDIT',
          amount: fee,
          accountName: 'Doanh thu phí dịch vụ nền tảng FoodSaver'
        }
      ];

      const ledgerTx = await this.createDoubleEntryTransaction(tx, {
        idempotencyKey: idempotencyKey || `cash_fee_${orderId}`,
        orderId,
        type: 'CASH_RECEIVABLE_BOOKING',
        amount: fee,
        description: `Ghi nhận nợ phí dịch vụ đơn tiền mặt #${orderId}`,
        entries
      });

      // Cập nhật Projection: PartnerReceivable
      const rec = await tx.partnerReceivable.upsert({
        where: { partnerId },
        update: {
          debtBalance: { increment: fee }
        },
        create: {
          partnerId,
          debtBalance: fee,
          debtLimit: 500000.00
        }
      });

      // Kiểm tra xem có vượt hạn mức nợ nần không
      if (Number(rec.debtBalance) >= Number(rec.debtLimit)) {
        await tx.partnerReceivable.update({
          where: { partnerId },
          data: { isSuspended: true }
        });
      }

      return ledgerTx;
    };
    return transactionClient ? execute(transactionClient) : prisma.$transaction(execute);
  },

  /**
   * USE CASE 4: REFUND (Hoàn tiền cho khách hàng)
   */
  async recordRefund({ orderId, amount, isPreSettlement = true, idempotencyKey }, transactionClient) {
    const execute = async (tx) => {
      const amt = Number(amount);
      let entries = [];

      if (isPreSettlement) {
        // Hoàn tiền trước khi đối soát (từ Escrow)
        entries = [
          {
            accountCode: 'escrow',
            accountType: 'ESCROW',
            entryType: 'DEBIT',
            amount: amt,
            accountName: 'Tài khoản ký quỹ giữ hộ (Escrow)'
          },
          {
            accountCode: 'refund_payable',
            accountType: 'REFUND_PAYABLE',
            entryType: 'CREDIT',
            amount: amt,
            accountName: 'Phải trả hoàn tiền khách hàng'
          }
        ];
      }

      return this.createDoubleEntryTransaction(tx, {
        idempotencyKey: idempotencyKey || `refund_${orderId}`,
        orderId,
        type: 'REFUND_TRANSACTION',
        amount: amt,
        description: `Hoàn tiền đơn #${orderId}`,
        entries
      });
    };
    return transactionClient ? execute(transactionClient) : prisma.$transaction(execute);
  },

  /**
   * USE CASE 5: PAYOUT (Đối tác yêu cầu rút tiền về tài khoản ngân hàng)
   */
  async requestPayout(userId, { amount, bankName, bankAccountNo, bankAccountName, idempotencyKey }) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { userId },
      include: { wallet: true, receivable: true }
    });

    if (!partner) {
      throw ApiError.forbidden('Chưa tìm thấy hồ sơ đối tác');
    }

    const amt = Number(amount);
    if (amt <= 0) {
      throw ApiError.badRequest('Số tiền rút phải lớn hơn 0');
    }

    const minPayout = 50000;
    if (amt < minPayout) {
      throw ApiError.badRequest(`Số tiền rút tối thiểu là ${minPayout.toLocaleString('vi-VN')}đ`);
    }

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.partnerWallet.findUnique({
        where: { partnerId: partner.id }
      });

      if (!wallet || Number(wallet.availableBalance) < amt) {
        throw ApiError.badRequest(
          `Số dư khả dụng không đủ (Hiện có: ${(wallet?.availableBalance || 0).toLocaleString('vi-VN')}đ)`
        );
      }

      // Trừ số dư khả dụng
      await tx.partnerWallet.update({
        where: { partnerId: partner.id },
        data: {
          availableBalance: { decrement: amt }
        }
      });

      // Tạo Ledger Transaction:
      // Dr partner_wallet:  [amount]
      // Cr payout_clearing: [amount]
      const entries = [
        {
          accountCode: `partner_wallet:${partner.id}`,
          accountType: 'PARTNER_WALLET',
          partnerId: partner.id,
          entryType: 'DEBIT',
          amount: amt
        },
        {
          accountCode: 'payout_clearing',
          accountType: 'PAYOUT_CLEARING',
          entryType: 'CREDIT',
          amount: amt,
          accountName: 'Tài khoản trung gian chi trả Payout'
        }
      ];

      await this.createDoubleEntryTransaction(tx, {
        idempotencyKey: idempotencyKey || `payout_${Date.now()}_${partner.id}`,
        type: 'PAYOUT_REQUEST',
        amount: amt,
        description: `Yêu cầu rút tiền đối tác ${partner.businessName}`,
        entries
      });

      const payout = await tx.payout.create({
        data: {
          payoutNumber: `PO${Date.now().toString().slice(-8)}`,
          partnerId: partner.id,
          amount: amt,
          bankName,
          bankAccountNo,
          bankAccountName,
          status: 'REQUESTED',
          idempotencyKey: idempotencyKey || null
        }
      });

      return payout;
    });
  },

  /**
   * Lấy tổng quan tài chính minh bạch cho Đối tác
   */
  async getPartnerFinancialSummary(userId) {
    const partner = await prisma.partnerProfile.findUnique({
      where: { userId },
      include: {
        wallet: true,
        receivable: true,
        payouts: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });

    if (!partner) {
      throw ApiError.forbidden('Chưa tìm thấy hồ sơ đối tác');
    }

    const wallet = partner.wallet || { availableBalance: 0, pendingBalance: 0 };
    const receivable = partner.receivable || { debtBalance: 0, debtLimit: 500000, isSuspended: false };

    return {
      partnerId: partner.id,
      businessName: partner.businessName,
      availableBalance: Number(wallet.availableBalance || 0),
      pendingBalance: Number(wallet.pendingBalance || 0),
      cashDebtBalance: Number(receivable.debtBalance || 0),
      debtLimit: Number(receivable.debtLimit || 500000),
      isSuspended: !!receivable.isSuspended,
      canAcceptCashOrders: Number(receivable.debtBalance || 0) < Number(receivable.debtLimit || 500000),
      recentPayouts: (partner.payouts || []).map(p => ({
        id: p.id,
        payoutNumber: p.payoutNumber,
        amount: Number(p.amount),
        status: p.status,
        createdAt: p.createdAt.toISOString()
      }))
    };
  },

  /**
   * ADMIN: Lấy danh sách yêu cầu rút tiền với bộ lọc trạng thái và phân trang
   */
  async getAdminPayouts({ status, page = 1, limit = 10, search = '' }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { payoutNumber: { contains: q } },
        { bankAccountNo: { contains: q } },
        { bankAccountName: { contains: q } },
        { partner: { businessName: { contains: q } } }
      ];
    }

    const [total, items] = await Promise.all([
      prisma.payout.count({ where }),
      prisma.payout.findMany({
        where,
        include: {
          partner: {
            select: {
              id: true,
              userId: true,
              businessName: true,
              phone: true,
              businessType: true,
              address: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  fullName: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      })
    ]);

    return {
      payouts: items.map(p => ({
        id: p.id,
        payoutNumber: p.payoutNumber,
        partnerId: p.partnerId,
        amount: Number(p.amount),
        bankName: p.bankName,
        bankAccountNo: p.bankAccountNo,
        bankAccountName: p.bankAccountName,
        bankReferenceCode: p.bankReferenceCode,
        status: p.status,
        rejectionReason: p.rejectionReason,
        processedAt: p.processedAt ? p.processedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        partner: p.partner
      })),
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  },

  /**
   * ADMIN: Chuyển trạng thái yêu cầu rút tiền sang Đang xử lý (PROCESSING)
   */
  async processPayout(adminUserId, payoutId) {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { partner: true }
    });

    if (!payout) {
      throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền');
    }

    if (payout.status !== 'REQUESTED') {
      throw ApiError.badRequest(`Không thể chuyển sang Đang xử lý khi yêu cầu đang ở trạng thái ${payout.status}`);
    }

    const updated = await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'PROCESSING'
      },
      include: {
        partner: {
          select: {
            id: true,
            businessName: true,
            phone: true
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        action: 'PAYOUT_PROCESSING',
        targetType: 'PAYOUT',
        targetId: payout.id,
        metadata: {
          payoutNumber: payout.payoutNumber,
          amount: Number(payout.amount),
          partnerId: payout.partnerId
        }
      }
    }).catch(err => console.error('Failed to create audit log:', err));

    return updated;
  },

  /**
   * ADMIN: Hoàn tất chuyển khoản rút tiền (COMPLETED) + Ghi mã giao dịch ngân hàng
   */
  async completePayout(adminUserId, payoutId, { bankReferenceCode }) {
    if (!bankReferenceCode || !bankReferenceCode.trim()) {
      throw ApiError.badRequest('Vui lòng cung cấp mã giao dịch ngân hàng / ủy nhiệm chi (bankReferenceCode)');
    }

    return prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
        include: { partner: true }
      });

      if (!payout) {
        throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền');
      }

      if (!['REQUESTED', 'PROCESSING'].includes(payout.status)) {
        throw ApiError.badRequest(`Yêu cầu rút tiền này đã hoàn tất hoặc bị từ chối (${payout.status})`);
      }

      const amt = Number(payout.amount);

      // Ledger Transaction:
      // Dr payout_clearing:  [amount]
      // Cr gateway_clearing: [amount]
      const entries = [
        {
          accountCode: 'payout_clearing',
          accountType: 'PAYOUT_CLEARING',
          entryType: 'DEBIT',
          amount: amt,
          accountName: 'Tài khoản trung gian chi trả Payout'
        },
        {
          accountCode: 'gateway_clearing',
          accountType: 'GATEWAY_CLEARING',
          entryType: 'CREDIT',
          amount: amt,
          accountName: 'Tài khoản thanh toán cổng Gateway / Tiền gửi'
        }
      ];

      await this.createDoubleEntryTransaction(tx, {
        idempotencyKey: `payout_complete_${payout.id}`,
        type: 'PAYOUT_COMPLETED',
        amount: amt,
        description: `Hoàn tất chi trả tiền rút #${payout.payoutNumber} cho đối tác ${payout.partner.businessName} (Mã GD: ${bankReferenceCode.trim()})`,
        entries
      });

      const updated = await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: 'COMPLETED',
          bankReferenceCode: bankReferenceCode.trim(),
          processedAt: new Date()
        },
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              phone: true
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: 'PAYOUT_COMPLETED',
          targetType: 'PAYOUT',
          targetId: payout.id,
          metadata: {
            payoutNumber: payout.payoutNumber,
            amount: amt,
            partnerId: payout.partnerId,
            bankReferenceCode: bankReferenceCode.trim()
          }
        }
      }).catch(err => console.error('Failed to create audit log:', err));

      // Notification to partner
      await tx.notification.create({
        data: {
          userId: payout.partner.userId,
          title: 'Yêu cầu rút tiền đã được xử lý thành công',
          message: `Yêu cầu rút ${amt.toLocaleString('vi-VN')}đ (#${payout.payoutNumber}) đã được chuyển khoản thành công. Mã giao dịch ngân hàng: ${bankReferenceCode.trim()}`,
          type: 'SYSTEM'
        }
      }).catch(err => console.error('Failed to create payout notification:', err));

      return updated;
    });
  },

  /**
   * ADMIN: Từ chối yêu cầu rút tiền (REJECTED) + Bút toán đảo hoàn tiền khả dụng
   */
  async rejectPayout(adminUserId, payoutId, { rejectionReason }) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw ApiError.badRequest('Vui lòng nêu rõ lý do từ chối yêu cầu rút tiền');
    }

    return prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
        include: { partner: true }
      });

      if (!payout) {
        throw ApiError.notFound('Không tìm thấy yêu cầu rút tiền');
      }

      if (!['REQUESTED', 'PROCESSING'].includes(payout.status)) {
        throw ApiError.badRequest(`Yêu cầu rút tiền này đã hoàn tất hoặc bị từ chối (${payout.status})`);
      }

      const amt = Number(payout.amount);

      // Reversal Double-Entry Ledger:
      // Dr payout_clearing:        [amount]
      // Cr partner_wallet:<id>:   [amount]
      const entries = [
        {
          accountCode: 'payout_clearing',
          accountType: 'PAYOUT_CLEARING',
          entryType: 'DEBIT',
          amount: amt,
          accountName: 'Tài khoản trung gian chi trả Payout'
        },
        {
          accountCode: `partner_wallet:${payout.partnerId}`,
          accountType: 'PARTNER_WALLET',
          partnerId: payout.partnerId,
          entryType: 'CREDIT',
          amount: amt,
          accountName: `Ví số dư khả dụng - Quán ${payout.partner.businessName}`
        }
      ];

      await this.createDoubleEntryTransaction(tx, {
        idempotencyKey: `payout_reject_${payout.id}`,
        type: 'PAYOUT_REVERSAL',
        amount: amt,
        description: `Bút toán đảo hoàn tiền rút #${payout.payoutNumber} do bị từ chối: ${rejectionReason.trim()}`,
        entries
      });

      // Hoàn trả số dư khả dụng cho ví đối tác
      await tx.partnerWallet.update({
        where: { partnerId: payout.partnerId },
        data: {
          availableBalance: { increment: amt }
        }
      });

      const updated = await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          processedAt: new Date()
        },
        include: {
          partner: {
            select: {
              id: true,
              businessName: true,
              phone: true
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          action: 'PAYOUT_REJECTED',
          targetType: 'PAYOUT',
          targetId: payout.id,
          metadata: {
            payoutNumber: payout.payoutNumber,
            amount: amt,
            partnerId: payout.partnerId,
            rejectionReason: rejectionReason.trim()
          }
        }
      }).catch(err => console.error('Failed to create audit log:', err));

      // Notification to partner
      await tx.notification.create({
        data: {
          userId: payout.partner.userId,
          title: 'Yêu cầu rút tiền bị từ chối',
          message: `Yêu cầu rút ${amt.toLocaleString('vi-VN')}đ (#${payout.payoutNumber}) đã bị từ chối. Lý do: ${rejectionReason.trim()}. Số tiền đã được hoàn trả về số dư khả dụng.`,
          type: 'SYSTEM'
        }
      }).catch(err => console.error('Failed to create payout notification:', err));

      return updated;
    });
  }
};
