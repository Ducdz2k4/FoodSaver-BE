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
  })
};
