import { OrderService } from './order.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const OrderController = {
  create: asyncHandler(async (req, res) => {
    const result = await OrderService.createOrder(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Đặt giữ món ăn thành công',
      data: result
    });
  }),

  getMyOrders: asyncHandler(async (req, res) => {
    const result = await OrderService.getMyOrders(req.user.id, req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách đơn hàng thành công',
      data: result.orders,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  }),

  getOrderById: asyncHandler(async (req, res) => {
    const result = await OrderService.getOrderById(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Lấy chi tiết đơn hàng thành công',
      data: result
    });
  }),

  cancelOrder: asyncHandler(async (req, res) => {
    const result = await OrderService.cancelOrder(req.user.id, req.params.id, req.body.reason);
    return ApiResponse.success(res, {
      message: 'Hủy đơn hàng thành công',
      data: result
    });
  }),

  getPartnerOrders: asyncHandler(async (req, res) => {
    const result = await OrderService.getPartnerOrders(req.user.id, req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách đơn của quán thành công',
      data: result.orders,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  }),

  updatePartnerOrderStatus: asyncHandler(async (req, res) => {
    const result = await OrderService.updatePartnerOrderStatus(req.user.id, req.params.id, req.body.status);
    return ApiResponse.success(res, {
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: result
    });
  })
};
