import { ListingService } from './listing.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const ListingController = {
  create: asyncHandler(async (req, res) => {
    const result = await ListingService.createListing(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Đăng món ăn giải cứu thành công',
      data: result
    });
  }),

  getPartnerListings: asyncHandler(async (req, res) => {
    const result = await ListingService.getPartnerListings(req.user.id, req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách món ăn của quán thành công',
      data: result.listings,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  }),

  update: asyncHandler(async (req, res) => {
    const result = await ListingService.updateListing(req.user.id, req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật thông tin món ăn thành công',
      data: result
    });
  }),

  toggleStatus: asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SYS_ADMIN';
    const result = await ListingService.toggleStatus(req.user.id, req.params.id, req.body.status, isAdmin);
    return ApiResponse.success(res, {
      message: 'Cập nhật trạng thái món ăn thành công',
      data: result
    });
  }),

  delete: asyncHandler(async (req, res) => {
    await ListingService.deleteListing(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Xóa món ăn thành công'
    });
  }),

  getPublicListings: asyncHandler(async (req, res) => {
    const result = await ListingService.getPublicListings(req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách món ăn thành công',
      data: result.listings,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  }),

  getListingById: asyncHandler(async (req, res) => {
    const userLat = req.query.lat ? Number(req.query.lat) : undefined;
    const userLng = req.query.lng ? Number(req.query.lng) : undefined;
    const result = await ListingService.getListingById(req.params.id, userLat, userLng);
    return ApiResponse.success(res, {
      message: 'Lấy chi tiết món ăn thành công',
      data: result
    });
  }),

  getAdminListings: asyncHandler(async (req, res) => {
    const result = await ListingService.getAdminListings(req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách món ăn quản trị thành công',
      data: result.listings,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  })
};
