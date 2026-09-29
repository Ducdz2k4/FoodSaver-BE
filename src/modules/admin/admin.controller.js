import { AdminStatsService } from './admin.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const AdminStatsController = {
  getDashboardMetrics: asyncHandler(async (_req, res) => {
    const data = await AdminStatsService.getDashboardMetrics();
    return ApiResponse.success(res, {
      message: 'Lấy dữ liệu thống kê tổng thể thành công',
      data
    });
  }),

  getESGReports: asyncHandler(async (_req, res) => {
    const data = await AdminStatsService.getESGReports();
    return ApiResponse.success(res, {
      message: 'Lấy dữ liệu báo cáo tác động ESG thành công',
      data
    });
  })
};
