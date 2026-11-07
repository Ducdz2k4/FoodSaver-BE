import { LedgerService } from './ledger.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const ledgerController = {
  getFinancialSummary: asyncHandler(async (req, res) => {
    const data = await LedgerService.getPartnerFinancialSummary(req.user.id);
    return ApiResponse.success(res, {
      message: 'Thông tin tài chính đối tác',
      data
    });
  }),

  requestPayout: asyncHandler(async (req, res) => {
    const payout = await LedgerService.requestPayout(req.user.id, req.body);
    return ApiResponse.success(res, {
      message: 'Gửi yêu cầu rút tiền thành công',
      data: payout
    });
  }),

  // ADMIN METHODS
  getAdminPayouts: asyncHandler(async (req, res) => {
    const { status, page, limit, search } = req.query;
    const result = await LedgerService.getAdminPayouts({ status, page, limit, search });
    return ApiResponse.success(res, {
      message: 'Danh sách yêu cầu rút tiền',
      data: result.payouts,
      meta: result.meta
    });
  }),

  processPayout: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payout = await LedgerService.processPayout(req.user.id, id);
    return ApiResponse.success(res, {
      message: 'Đã chuyển trạng thái yêu cầu rút tiền sang Đang xử lý',
      data: payout
    });
  }),

  completePayout: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payout = await LedgerService.completePayout(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Hoàn tất chi trả rút tiền thành công',
      data: payout
    });
  }),

  rejectPayout: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payout = await LedgerService.rejectPayout(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Đã từ chối yêu cầu rút tiền và hoàn tiền vào ví đối tác',
      data: payout
    });
  })
};
