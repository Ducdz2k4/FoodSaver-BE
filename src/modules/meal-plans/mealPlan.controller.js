import { MealPlanService } from './mealPlan.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const MealPlanController = {
  getMonthPlans: asyncHandler(async (req, res) => {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const userId = req.user?.id || null;

    const plans = await MealPlanService.getMonthPlans({ year, month, userId });
    return ApiResponse.success(res, {
      message: 'Kế hoạch ăn trong tháng',
      data: plans,
    });
  }),

  savePlan: asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const { date, slot, meal, calories, cost, ingredients } = req.body;

    const plan = await MealPlanService.savePlanSlot({
      userId,
      date,
      slot,
      meal,
      calories,
      cost,
      ingredients,
    });

    return ApiResponse.success(res, {
      message: 'Lưu kế hoạch bữa ăn thành công',
      data: plan,
    });
  }),

  deletePlan: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    await MealPlanService.deletePlanSlot(id, userId);

    return ApiResponse.success(res, {
      message: 'Đã xóa bữa ăn khỏi kế hoạch',
    });
  }),

  getSummary: asyncHandler(async (req, res) => {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const userId = req.user?.id || null;

    const summary = await MealPlanService.getMonthSummary({ year, month, userId });
    return ApiResponse.success(res, {
      message: 'Tổng kết chi tiêu và dinh dưỡng tháng',
      data: summary,
    });
  }),
};
