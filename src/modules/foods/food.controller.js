import { FoodService } from './food.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const FoodController = {
  getAllFoods: asyncHandler(async (req, res) => {
    const foods = await FoodService.getAllFoods(req.query);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách món ăn thành công',
      data: foods,
      meta: { total: foods.length }
    });
  }),

  getFoodById: asyncHandler(async (req, res) => {
    const food = await FoodService.getFoodById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Lấy chi tiết món ăn thành công',
      data: food
    });
  }),

  createFood: asyncHandler(async (req, res) => {
    const newFood = await FoodService.createFood(req.body);
    return ApiResponse.created(res, {
      message: 'Đăng bài giải cứu món ăn thành công',
      data: newFood
    });
  }),

  updateFood: asyncHandler(async (req, res) => {
    const updatedFood = await FoodService.updateFood(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Cập nhật món ăn thành công',
      data: updatedFood
    });
  }),

  deleteFood: asyncHandler(async (req, res) => {
    const result = await FoodService.deleteFood(req.params.id);
    return ApiResponse.success(res, {
      message: 'Xóa món ăn thành công',
      data: result
    });
  })
};
