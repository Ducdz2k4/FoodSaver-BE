import { PartnerService } from './partner.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const PartnerController = {
  apply: asyncHandler(async (req, res) => {
    const result = await PartnerService.applyPartner(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Nộp hồ sơ đối tác thành công. Vui lòng chờ Ban Quản Trị xét duyệt trong 2-24 giờ',
      data: result
    });
  }),

  getMyProfile: asyncHandler(async (req, res) => {
    const result = await PartnerService.getMyPartnerProfile(req.user.id);
    return ApiResponse.success(res, {
      message: 'Lấy thông tin hồ sơ đối tác thành công',
      data: result
    });
  }),

  getPendingPartners: asyncHandler(async (_req, res) => {
    const result = await PartnerService.getPendingPartners();
    return ApiResponse.success(res, {
      message: 'Lấy danh sách hồ sơ đối tác chờ duyệt thành công',
      data: result
    });
  }),

  verifyPartner: asyncHandler(async (req, res) => {
    const result = await PartnerService.verifyPartner(req.params.id, req.user.id, req.body);
    const actionLabel = req.body.status === 'VERIFIED' ? 'Phê duyệt' : 'Từ chối';
    return ApiResponse.success(res, {
      message: `${actionLabel} hồ sơ đối tác thành công`,
      data: result
    });
  })
};
