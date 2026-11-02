import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { z } from 'zod';

const planSchema = z.object({
  userId: z.string().uuid(),
  date: z.iso.date(),
  slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  meal: z.string().trim().min(1).max(255),
  image: z.string().max(500).nullish(),
  calories: z.coerce.number().int().nonnegative(),
  cost: z.coerce.number().nonnegative(),
  ingredients: z.array(z.string().max(255)).max(100)
});

function validateMonth(year, month) {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw ApiError.badRequest('Tháng hoặc năm không hợp lệ');
  }
}

export const MealPlanService = {
  async getMonthPlans({ year, month, userId } = {}) {
    validateMonth(year, month);
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;

    const where = {
      date: { startsWith: prefix },
    };

    where.userId = userId || null;

    const plans = await prisma.mealPlan.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    // Group by date -> slot
    const grouped = {};
    for (const p of plans) {
      if (!grouped[p.date]) {
        grouped[p.date] = {};
      }
      grouped[p.date][p.slot] = {
        id: p.id,
        meal: p.meal,
        image: p.image || null,
        calories: p.calories,
        cost: p.cost,
        ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
      };
    }

    return grouped;
  },

  async savePlanSlot({ userId, date, slot, meal, image, calories = 0, cost = 0, ingredients = [] }) {
    if (!userId) throw ApiError.unauthorized('Vui lòng đăng nhập để lưu lịch ăn');
    const parsed = planSchema.safeParse({ userId, date, slot, meal, image, calories, cost, ingredients });
    if (!parsed.success) {
      throw ApiError.badRequest('Dữ liệu bữa ăn không hợp lệ', parsed.error.issues);
    }
    ({ userId, date, slot, meal, image, calories, cost, ingredients } = parsed.data);
    const where = {
      date,
      slot,
    };
    if (userId) {
      where.userId = userId;
    } else {
      where.userId = null;
    }

    const existing = await prisma.mealPlan.findFirst({ where });

    if (existing) {
      return prisma.mealPlan.update({
        where: { id: existing.id },
        data: {
          meal,
          image: image !== undefined ? image : existing.image,
          calories: Number(calories) || 0,
          cost: Number(cost) || 0,
          ingredients,
        },
      });
    }

    return prisma.mealPlan.create({
      data: {
        userId: userId || null,
        date,
        slot,
        meal,
        image: image || null,
        calories: Number(calories) || 0,
        cost: Number(cost) || 0,
        ingredients,
      },
    });
  },

  async deletePlanSlot(id, userId) {
    if (!userId) throw ApiError.unauthorized('Vui lòng đăng nhập để xóa lịch ăn');
    const plan = await prisma.mealPlan.findUnique({ where: { id } });
    if (!plan) return null;

    if (plan.userId !== userId) {
      throw ApiError.forbidden('Bạn không có quyền xóa bữa ăn này');
    }

    return prisma.mealPlan.delete({ where: { id } });
  },

  async getMonthSummary({ year, month, userId } = {}) {
    validateMonth(year, month);
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;

    const where = {
      date: { startsWith: prefix },
    };
    where.userId = userId || null;

    const plans = await prisma.mealPlan.findMany({ where });

    let totalCost = 0;
    let totalCalories = 0;
    const distinctDates = new Set();
    const allIngredients = new Set();

    for (const p of plans) {
      totalCost += Number(p.cost) || 0;
      totalCalories += Number(p.calories) || 0;
      distinctDates.add(p.date);
      if (Array.isArray(p.ingredients)) {
        p.ingredients.forEach((ing) => allIngredients.add(String(ing).trim()));
      }
    }

    return {
      totalCost,
      totalCalories,
      plannedDays: distinctDates.size,
      ingredientCount: allIngredients.size,
      shoppingList: Array.from(allIngredients),
    };
  },
};
