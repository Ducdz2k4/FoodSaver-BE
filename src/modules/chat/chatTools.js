import { prisma } from '../../config/database.js';

/**
 * Tool 1: estimate_min_cost
 * Calculates minimum feasible financial and calorie baseline using real database items
 */
export async function estimateMinCost({ days = 1, people = 1, mealsPerDay = 3, targetBudget = 0 }) {
  // Fetch real recipes and active listings from database
  let availableRecipes = [];
  try {
    availableRecipes = await prisma.recipe.findMany({
      take: 20,
      select: { id: true, name: true, cost: true, calories: true, category: true }
    });
  } catch {
    availableRecipes = [];
  }

  // Calculate cheapest valid meals from real DB or benchmark
  const costs = availableRecipes.map(r => r.cost).filter(c => c > 0);
  const minSingleMealCost = costs.length > 0 ? Math.min(...costs) : 18000;
  const avgSingleMealCost = costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : 28000;

  // Ultra-saving benchmark: bulk staples (gạo + trứng + đậu hũ + rau muống/cải)
  const bareSurvivalCostPerDay = 18000; // ~6k/bữa
  const balancedSavingCostPerDay = Math.min(35000, minSingleMealCost * 1.5);
  const comfortableCostPerDay = avgSingleMealCost * 2;

  const totalMinBare = bareSurvivalCostPerDay * days * people;
  const totalBalanced = balancedSavingCostPerDay * days * people;
  const totalComfortable = comfortableCostPerDay * days * people;

  return {
    days,
    people,
    mealsPerDay,
    targetBudget,
    breakdown: {
      bareSurvivalPerDay: bareSurvivalCostPerDay,
      balancedSavingPerDay: balancedSavingCostPerDay,
      comfortablePerDay: comfortableCostPerDay,
      totalMinRequired: totalMinBare,
      totalBalancedRequired: totalBalanced,
      totalComfortableRequired: totalComfortable,
    },
    sampleCheapDishes: availableRecipes.slice(0, 4)
  };
}

/**
 * Tool 2: search_rescue_deals
 * Real surplus listings from FoodSaver partners
 */
export async function searchRescueDeals({ maxPrice = 50000, limit = 4, category } = {}) {
  try {
    const where = {
      status: { in: ['AVAILABLE', 'EXPIRING_SOON'] },
      quantity: { gt: 0 }
    };
    if (maxPrice > 0) {
      where.discountPrice = { lte: maxPrice };
    }
    if (category && category !== 'ALL') {
      where.category = category;
    }

    const listings = await prisma.listing.findMany({
      where,
      take: limit,
      orderBy: [{ urgencyScore: 'desc' }, { discountPrice: 'asc' }],
      include: {
        partner: {
          select: { storeName: true, address: true, phone: true }
        }
      }
    });

    return listings.map(l => ({
      id: l.id,
      title: l.title,
      originalPrice: l.originalPrice,
      discountPrice: l.discountPrice,
      quantity: l.quantity,
      partnerName: l.partner?.storeName || 'Đối tác FoodSaver',
      address: l.pickupAddress || l.partner?.address || '',
      images: l.imageUrls ? (typeof l.imageUrls === 'string' ? JSON.parse(l.imageUrls) : l.imageUrls) : []
    }));
  } catch (err) {
    console.warn('[Tool: searchRescueDeals] Fallback:', err.message);
    return [];
  }
}

/**
 * Tool 3: search_recipes
 * Find recipes by name/keyword or category
 */
export async function searchRecipes({ query = '', limit = 5 } = {}) {
  try {
    const where = {};
    if (query.trim()) {
      where.OR = [
        { name: { contains: query.trim() } },
        { tags: { contains: query.trim() } }
      ];
    }
    const recipes = await prisma.recipe.findMany({
      where,
      take: limit,
      orderBy: { rating: 'desc' }
    });
    return recipes;
  } catch {
    return [];
  }
}

/**
 * Tool 4: generate_meal_schedule
 * Produces structured meal schedule tailored to budget and days
 */
export async function generateMealSchedule({ days = 3, budget = 150000, people = 1 }) {
  const dailyBudget = Math.floor(budget / days / people);
  const recipes = await prisma.recipe.findMany({ take: 16 });

  const schedule = [];
  for (let d = 1; d <= Math.min(days, 7); d++) {
    const breakfast = recipes[(d - 1) % recipes.length] || { name: 'Bánh mì ốp la', cost: 12000, calories: 350 };
    const lunch = recipes[(d) % recipes.length] || { name: 'Cơm tấm sườn', cost: 25000, calories: 650 };
    const dinner = recipes[(d + 1) % recipes.length] || { name: 'Canh chua cá lóc', cost: 22000, calories: 500 };

    schedule.push({
      day: d,
      slots: {
        breakfast: { name: breakfast.name, cost: Math.min(dailyBudget * 0.25, breakfast.cost || 12000), calories: breakfast.calories || 350 },
        lunch: { name: lunch.name, cost: Math.min(dailyBudget * 0.45, lunch.cost || 25000), calories: lunch.calories || 650 },
        dinner: { name: dinner.name, cost: Math.min(dailyBudget * 0.30, dinner.cost || 20000), calories: dinner.calories || 500 }
      },
      dayTotalCost: Math.min(dailyBudget, (breakfast.cost || 12000) + (lunch.cost || 25000) + (dinner.cost || 20000))
    });
  }

  return {
    days,
    budget,
    dailyBudget,
    schedule
  };
}

/**
 * Tool Registry Metadata
 */
export const CHAT_TOOLS = [
  {
    name: 'estimate_min_cost',
    description: 'Tính toán chi phí tối thiểu theo ngày, người và phân bổ dinh dưỡng từ dữ liệu thực phẩm thực tế',
    execute: estimateMinCost
  },
  {
    name: 'search_rescue_deals',
    description: 'Tìm kiếm các suất ăn giải cứu cận date từ đối tác FoodSaver theo khoảng giá và mức giảm',
    execute: searchRescueDeals
  },
  {
    name: 'search_recipes',
    description: 'Tra cứu công thức nấu ăn, định lượng nguyên liệu và giá dự kiến',
    execute: searchRecipes
  },
  {
    name: 'generate_meal_schedule',
    description: 'Sinh kế hoạch phân bổ món ăn từng ngày theo ngân sách khả thi',
    execute: generateMealSchedule
  }
];
