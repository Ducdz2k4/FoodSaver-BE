import { OrderService } from './order.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const OrderController = {
  estimateShipping: asyncHandler(async (req, res) => {
    const result = OrderService.estimateShipping(req.body.distanceKm);
    return ApiResponse.success(res, {
      message: 'Ước tính phí giao hàng thành công',
      data: result
    });
  }),

  create: asyncHandler(async (req, res) => {
    const result = await OrderService.createOrder(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Đặt đơn thành công',
      data: result
    });
  }),

  bargainShippingFee: asyncHandler(async (req, res) => {
    const result = await OrderService.bargainShippingFee(req.user.id, req.params.id, req.body.proposedFee);
    return ApiResponse.success(res, {
      message: 'Gửi yêu cầu chém giá phí ship thành công',
      data: result
    });
  }),

  respondBargain: asyncHandler(async (req, res) => {
    const result = await OrderService.respondBargain(req.user.id, req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Phản hồi thương lượng phí ship thành công',
      data: result
    });
  }),

  lockOrder: asyncHandler(async (req, res) => {
    const result = await OrderService.lockOrder(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Đơn hàng đã được chốt và khóa sau 5s xác nhận',
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
