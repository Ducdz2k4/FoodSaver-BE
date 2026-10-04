import { OrderService } from './order.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const OrderController = {
  estimateShipping: asyncHandler(async (req, res) => {
    const { distanceKm } = req.body;
    const result = OrderService.estimateShipping(distanceKm);
    return ApiResponse.success(res, {
      message: 'Ước tính phí giao hàng',
      data: result
    });
  }),

  verifyCoupon: asyncHandler(async (req, res) => {
    const { code, orderTotal } = req.body;
    const result = OrderService.verifyCoupon(code, orderTotal);
    return ApiResponse.success(res, {
      message: 'Áp dụng mã giảm giá thành công',
      data: result
    });
  }),

  create: asyncHandler(async (req, res) => {
    const order = await OrderService.createOrder(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Đặt giữ món ăn thành công',
      data: order
    });
  }),

  bargainShippingFee: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { proposedFee } = req.body;
    const order = await OrderService.bargainShippingFee(req.user.id, id, proposedFee);
    return ApiResponse.success(res, {
      message: 'Đã gửi yêu cầu thương lượng phí giao hàng',
      data: order
    });
  }),

  respondBargain: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await OrderService.respondBargain(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Đã phản hồi thương lượng phí giao hàng',
      data: order
    });
  }),

  lockOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await OrderService.lockOrder(req.user.id, id);
    return ApiResponse.success(res, {
      message: 'Đơn hàng đã được chốt giá thành công',
      data: order
    });
  }),

  getMyOrders: asyncHandler(async (req, res) => {
    const result = await OrderService.getMyOrders(req.user.id, req.query);
    return ApiResponse.success(res, {
      message: 'Danh sách đơn hàng của bạn',
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
    const { id } = req.params;
    const order = await OrderService.getOrderById(req.user.id, id);
    return ApiResponse.success(res, {
      message: 'Chi tiết đơn hàng',
      data: order
    });
  }),

  cancelOrder: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const order = await OrderService.cancelOrder(req.user.id, id, reason);
    return ApiResponse.success(res, {
      message: 'Đã hủy đơn hàng thành công',
      data: order
    });
  }),

  getPartnerOrders: asyncHandler(async (req, res) => {
    const result = await OrderService.getPartnerOrders(req.user.id, req.query);
    return ApiResponse.success(res, {
      message: 'Danh sách đơn hàng của quán',
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
    const { id } = req.params;
    const { status } = req.body;
    const order = await OrderService.updatePartnerOrderStatus(req.user.id, id, status);
    return ApiResponse.success(res, {
      message: 'Cập nhật trạng thái đơn hàng thành công',
      data: order
    });
  }),

  confirmHandover: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await OrderService.confirmHandover(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Xác nhận bàn giao món ăn thành công',
      data: order
    });
  }),

  customerConfirmReceipt: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const order = await OrderService.customerConfirmReceipt(req.user.id, id, req.body);
    return ApiResponse.success(res, {
      message: 'Xác nhận đã nhận món ăn thành công',
      data: order
    });
  })
};
