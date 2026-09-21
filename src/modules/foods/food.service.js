import { FoodModel } from './food.model.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const FoodService = {
  async getAllFoods(filters) {
    return FoodModel.findAll(filters);
  },

  async getFoodById(id) {
    const food = await FoodModel.findById(id);
    if (!food) {
      throw ApiError.notFound(`Không tìm thấy món ăn với ID: ${id}`);
    }
    return food;
  },

  async createFood(foodData) {
    if (foodData.discountedPrice > foodData.originalPrice) {
      throw ApiError.badRequest('Giá sau giảm không được lớn hơn giá gốc');
    }

    const expiry = new Date(foodData.expiryTime);
    if (expiry.getTime() <= Date.now()) {
      throw ApiError.badRequest('Thời gian hết hạn phải ở tương lai');
    }

    return FoodModel.create(foodData);
  },

  async updateFood(id, updateData) {
    const current = await this.getFoodById(id);

    const originalPrice = updateData.originalPrice ?? current.originalPrice;
    const discountedPrice = updateData.discountedPrice ?? current.discountedPrice;

    if (discountedPrice > originalPrice) {
      throw ApiError.badRequest('Giá sau giảm không được lớn hơn giá gốc');
    }

    return FoodModel.update(id, updateData);
  },

  async deleteFood(id) {
    await this.getFoodById(id);
    await FoodModel.delete(id);
    return { id, message: 'Đã xóa món ăn thành công' };
  }
};
