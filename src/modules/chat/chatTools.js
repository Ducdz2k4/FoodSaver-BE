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
  let dbRecipes = [];
  try {
    dbRecipes = await prisma.recipe.findMany({ take: 16 });
  } catch {
    dbRecipes = [];
  }

  const schedule = [];
  const countDays = Math.min(days, 7);

  for (let d = 1; d <= countDays; d++) {
    let breakfast, lunch, dinner;

    if (dailyBudget >= 50000) {
      // 50k/day standard: Breakfast 12-15k, Lunch 20-25k, Dinner 12-15k
      const bList = [
        { name: 'Bánh mì ốp la pate', cost: 12000, calories: 380 },
        { name: 'Xôi xéo mỡ hành ruốc', cost: 15000, calories: 420 },
        { name: 'Cháo sườn sụn quẩy giòn', cost: 15000, calories: 390 }
      ];
      const lList = [
        { name: 'Cơm rang dưa bò', cost: 22000, calories: 480 },
        { name: 'Phở bò tái nạm (suất vừa)', cost: 25000, calories: 450 },
        { name: 'Bún chả giò rau sống', cost: 22000, calories: 460 }
      ];
      const dList = [
        { name: 'Đậu hũ sốt cà chua hành hoa + Cơm', cost: 13000, calories: 350 },
        { name: 'Canh chua cá lóc + Cơm trắng', cost: 15000, calories: 340 },
        { name: 'Suất ăn giải cứu đối tác FoodSaver (Giờ vàng)', cost: 13000, calories: 420 }
      ];

      breakfast = bList[(d - 1) % bList.length];
      lunch = lList[(d - 1) % lList.length];
      dinner = dList[(d - 1) % dList.length];
    } else if (dailyBudget >= 22000) {
      // 22k - 45k/day: Smart home-cooked saving
      const bList = [
        { name: 'Bánh mì trứng ốp la', cost: 8000, calories: 320 },
        { name: 'Xôi đậu phộng vừng dừa', cost: 8000, calories: 350 },
        { name: 'Bánh mì kẹp xúc xích trứng', cost: 8000, calories: 330 }
      ];
      const lList = [
        { name: 'Đậu hũ sốt cà chua + Cơm trắng', cost: 10000, calories: 420 },
        { name: 'Cơm rang trứng hành hoa + Dưa góp', cost: 10000, calories: 450 },
        { name: 'Suất cơm trưa giải cứu FoodSaver (Giờ vàng)', cost: 10000, calories: 460 }
      ];
      const dList = [
        { name: 'Canh rau cải thịt băm + Trứng luộc', cost: 7000, calories: 350 },
        { name: 'Trứng chiên nước mắm + Rau muống xào tỏi', cost: 7000, calories: 360 },
        { name: 'Canh đậu hũ rong biển + Cơm trắng', cost: 7000, calories: 330 }
      ];

      breakfast = bList[(d - 1) % bList.length];
      lunch = lList[(d - 1) % lList.length];
      dinner = dList[(d - 1) % dList.length];
    } else {
      // ~18k/day bare survival
      const bList = [
        { name: 'Bánh mì không + 1 quả trứng luộc', cost: 6000, calories: 280 },
        { name: 'Cháo trắng hột vịt muối / ruốc', cost: 5500, calories: 260 }
      ];
      const lList = [
        { name: 'Đậu hũ chiên sả + Rau muống luộc + Cơm', cost: 6500, calories: 400 },
        { name: 'Trứng chiên hành + Cơm trắng', cost: 6500, calories: 390 }
      ];
      const dList = [
        { name: 'Canh rau cải xanh + Nước mắm tỏi ớt + Cơm', cost: 5500, calories: 320 },
        { name: 'Đậu hũ kho tương + Canh bí đỏ', cost: 5500, calories: 340 }
      ];

      breakfast = bList[(d - 1) % bList.length];
      lunch = lList[(d - 1) % lList.length];
      dinner = dList[(d - 1) % dList.length];
    }

    const dayTotalCost = breakfast.cost + lunch.cost + dinner.cost;

    schedule.push({
      day: d,
      slots: { breakfast, lunch, dinner },
      dayTotalCost
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
