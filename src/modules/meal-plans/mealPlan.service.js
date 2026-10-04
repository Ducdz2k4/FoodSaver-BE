import { prisma } from '../../config/database.js';

export const MealPlanService = {
  async getMonthPlans({ year, month, userId } = {}) {
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;

    const where = {
      date: { startsWith: prefix },
    };

    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }

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
        calories: p.calories,
        cost: p.cost,
        ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
      };
    }

    return grouped;
  },

  async savePlanSlot({ userId, date, slot, meal, calories = 0, cost = 0, ingredients = [] }) {
    // Check if slot exists for this date
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
        calories: Number(calories) || 0,
        cost: Number(cost) || 0,
        ingredients,
      },
    });
  },

  async deletePlanSlot(id, userId) {
    const plan = await prisma.mealPlan.findUnique({ where: { id } });
    if (!plan) return null;

    return prisma.mealPlan.delete({ where: { id } });
  },

  async getMonthSummary({ year, month, userId } = {}) {
    const monthStr = String(month).padStart(2, '0');
    const prefix = `${year}-${monthStr}`;

    const where = {
      date: { startsWith: prefix },
    };
    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }

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
