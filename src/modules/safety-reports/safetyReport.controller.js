import { SafetyReportService } from './safetyReport.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const SafetyReportController = {
  createReport: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const report = await SafetyReportService.createReport(req.user.id, id, req.body);
    return ApiResponse.created(res, {
      message: 'Gửi báo cáo sự cố an toàn thực phẩm thành công',
      data: report,
    });
  }),

  getReportByOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const report = await SafetyReportService.getReportByOrder(req.user.id, req.user.role, id);
    return ApiResponse.success(res, {
      message: 'Thông tin sự cố đơn hàng',
      data: report,
    });
  }),

  getAdminReports: asyncHandler(async (req, res) => {
    const result = await SafetyReportService.getAdminReports(req.query);
    return ApiResponse.success(res, {
      message: 'Danh sách sự cố ATTP',
      data: result.reports,
      meta: result.meta,
    });
  }),

  getAdminReportById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const report = await SafetyReportService.getAdminReportById(id);
    return ApiResponse.success(res, {
      message: 'Chi tiết sự cố ATTP',
      data: report,
    });
  }),

  updateAdminReport: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const report = await SafetyReportService.updateAdminReport(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật trạng thái xử lý sự cố thành công',
      data: report,
    });
  }),
};
