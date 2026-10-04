import { RecipeService } from './recipe.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const RecipeController = {
  list: asyncHandler(async (req, res) => {
    const { category, search, page, limit } = req.query;
    const { recipes, meta } = await RecipeService.getRecipes({ category, search, page, limit });
    return ApiResponse.success(res, {
      message: 'Danh sách công thức món ăn',
      data: recipes,
      meta,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const recipe = await RecipeService.getRecipeById(id);
    return ApiResponse.success(res, {
      message: 'Chi tiết công thức món ăn',
      data: recipe,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const recipe = await RecipeService.createRecipe(req.body);
    return ApiResponse.created(res, {
      message: 'Tạo công thức món ăn thành công',
      data: recipe,
    });
  }),
};
