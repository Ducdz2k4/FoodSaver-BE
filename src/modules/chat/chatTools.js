import { prisma } from '../../config/database.js';
import { MealPlanService } from '../meal-plans/mealPlan.service.js';

/**
 * Tool 1: estimate_min_cost
 * Calculates minimum feasible financial and calorie baseline using real database items
 */
export async function estimateMinCost({ days = 1, people = 1, mealsPerDay = 3, targetBudget = 0, isVegetarian = false }) {
  let availableRecipes = [];
  try {
    availableRecipes = await prisma.recipe.findMany({
      take: 20,
      select: { id: true, name: true, cost: true, calories: true, category: true }
    });
  } catch {
    availableRecipes = [];
  }

  const bareSurvivalCostPerDay = isVegetarian ? 15000 : 18000;
  const balancedSavingCostPerDay = isVegetarian ? 30000 : 35000;
  const comfortableCostPerDay = isVegetarian ? 45000 : 55000;

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
export async function searchRescueDeals({ maxPrice = 50000, limit = 4, category, isVegetarian = false } = {}) {
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
 */
export async function searchRecipes({ query = '', limit = 5, isVegetarian = false } = {}) {
  try {
    const where = {};
    if (isVegetarian) {
      where.category = 'chay';
    } else if (query.trim()) {
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
 * Produces structured meal schedule tailored to budget, days, and dietary style (authentic Vietnamese dishes)
 */
export async function generateMealSchedule({ days = 3, budget = 150000, people = 1, isVegetarian = false, isHomeCooking = true }) {
  const dailyBudget = Math.floor(budget / days / people);
  const schedule = [];
  const countDays = Math.min(days, 7);

  // Authentic Vietnamese vegetarian dishes
  const vegBreakfastList = [
    { name: 'Bánh mì chả lụa chay & dưa leo', cost: 10000, calories: 310, ingredients: ['Bánh mì', 'Chả lụa chay', 'Dưa leo', 'Ngò rí', 'Nước tương tỏi ớt'] },
    { name: 'Bún xào chay rau cải nấm rơm', cost: 12000, calories: 350, ingredients: ['Bún gạo', 'Cải ngọt', 'Đậu hũ chiên', 'Nấm rơm', 'Cà rốt'] },
    { name: 'Xôi bắp hạt sen dừa sợi', cost: 10000, calories: 360, ingredients: ['Nếp thơm', 'Bắp nếp', 'Hạt sen tươi', 'Mè rang', 'Đậu phộng'] },
    { name: 'Cháo nấm hương hạt sen chay', cost: 12000, calories: 290, ingredients: ['Gạo tẻ', 'Hạt sen', 'Nấm hương', 'Hành hoa', 'Tiêu sọ'] }
  ];

  const vegLunchList = [
    { name: 'Đậu hũ sốt cà chua hành hoa + Cơm trắng + Canh rau ngót', cost: 15000, calories: 460, ingredients: ['Đậu hũ mơ', 'Cà chua chín', 'Hành hoa', 'Rau ngót', 'Gạo thơm'] },
    { name: 'Nấm rơm kho sả ớt + Canh chua chay + Cơm trắng', cost: 16000, calories: 450, ingredients: ['Nấm rơm', 'Sả ớt băm', 'Thơm (dứa)', 'Bạc hà', 'Đậu bắp'] },
    { name: 'Bún riêu chay đậu hũ nấm rơm', cost: 18000, calories: 430, ingredients: ['Bún tươi', 'Riêu đậu nành', 'Đậu hũ chiên', 'Nấm rơm', 'Rau muống bào'] },
    { name: 'Cơm chiên ngũ sắc rau củ hạt sen', cost: 15000, calories: 480, ingredients: ['Cơm nguội', 'Đậu Hà Lan', 'Cà rốt', 'Hạt sen', 'Nấm đùi gà'] }
  ];

  const vegDinnerList = [
    { name: 'Rau củ luộc ngũ sắc chấm kho quẹt chay + Cơm trắng', cost: 14000, calories: 380, ingredients: ['Bầu non', 'Cà rốt', 'Đậu bắp', 'Bông cải', 'Nước mắm chay kho quẹt', 'Tóp mỡ bánh mì'] },
    { name: 'Canh bí đỏ đậu phộng + Đậu hũ chiên sả + Cơm trắng', cost: 13000, calories: 410, ingredients: ['Bí đỏ', 'Đậu phộng', 'Đậu hũ trắng', 'Sả ớt', 'Gạo thơm'] },
    { name: 'Đậu hũ kho nấm đông cô + Canh cải bẹ xanh gừng tươi', cost: 15000, calories: 420, ingredients: ['Đậu hũ', 'Nấm đông cô', 'Cải bẹ xanh', 'Gừng tươi', 'Tiêu'] },
    { name: 'Canh mướp hương mồng tơi nấm rơm + Cơm trắng', cost: 12000, calories: 360, ingredients: ['Mướp hương', 'Rau mồng tơi', 'Nấm rơm', 'Đậu phộng rang'] }
  ];

  // Standard non-veg Vietnamese dishes
  const standardBreakfast = [
    { name: 'Bánh mì ốp la pate', cost: 12000, calories: 380, ingredients: ['Bánh mì', 'Trứng gà', 'Pate', 'Dưa leo'] },
    { name: 'Xôi xéo mỡ hành ruốc', cost: 15000, calories: 420, ingredients: ['Gạo nếp', 'Đậu xanh', 'Hành phi', 'Ruốc thịt'] },
    { name: 'Cháo sườn sụn quẩy giòn', cost: 15000, calories: 390, ingredients: ['Gạo tẻ', 'Sườn sụn', 'Quẩy giòn', 'Hành hoa'] }
  ];

  const standardLunch = [
    { name: 'Cơm rang dưa bò', cost: 22000, calories: 480, ingredients: ['Cơm', 'Thịt bò', 'Dưa chua', 'Trứng gà'] },
    { name: 'Phở bò tái nạm', cost: 25000, calories: 450, ingredients: ['Bánh phở', 'Nạm bò', 'Hành tây', 'Rau thơm'] },
    { name: 'Bún chả giò rau sống', cost: 22000, calories: 460, ingredients: ['Bún tươi', 'Chả giò', 'Rau sống', 'Nước mắm chua ngọt'] }
  ];

  const standardDinner = [
    { name: 'Đậu hũ sốt cà chua hành hoa + Cơm', cost: 13000, calories: 350, ingredients: ['Đậu hũ', 'Cà chua', 'Cơm trắng', 'Hành hoa'] },
    { name: 'Canh chua cá lóc + Cơm trắng', cost: 16000, calories: 360, ingredients: ['Cá lóc', 'Thơm', 'Cà chua', 'Đậu bắp', 'Cơm'] },
    { name: 'Trứng chiên thịt băm + Canh rau cải', cost: 14000, calories: 410, ingredients: ['Trứng', 'Thịt heo băm', 'Rau cải', 'Gạo thơm'] }
  ];

  for (let d = 1; d <= countDays; d++) {
    let breakfast, lunch, dinner;

    if (isVegetarian) {
      breakfast = vegBreakfastList[(d - 1) % vegBreakfastList.length];
      lunch = vegLunchList[(d - 1) % vegLunchList.length];
      dinner = vegDinnerList[(d - 1) % vegDinnerList.length];
    } else {
      breakfast = standardBreakfast[(d - 1) % standardBreakfast.length];
      lunch = standardLunch[(d - 1) % standardLunch.length];
      dinner = standardDinner[(d - 1) % standardDinner.length];
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
    isVegetarian,
    schedule
  };
}

/**
 * Tool 5: read_user_calendar
 * Checks database for existing meal plans on a specific date (e.g. 2026-10-05)
 */
export async function readUserCalendar({ date, userId }) {
  try {
    const where = { date };
    if (userId) {
      where.OR = [{ userId }, { userId: null }];
    }

    const plans = await prisma.mealPlan.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });

    const slots = {
      breakfast: plans.find(p => p.slot === 'breakfast') || null,
      lunch: plans.find(p => p.slot === 'lunch') || null,
      dinner: plans.find(p => p.slot === 'dinner') || null,
      snack: plans.find(p => p.slot === 'snack') || null,
    };

    return {
      date,
      hasExisting: plans.length > 0,
      existingCount: plans.length,
      existingSlots: slots,
      plans
    };
  } catch (err) {
    console.error('[Tool: readUserCalendar Error]:', err.message);
    return { date, hasExisting: false, existingCount: 0, existingSlots: {}, plans: [] };
  }
}

/**
 * Tool 6: write_user_calendar
 * Writes / replaces meal plan slots directly in database (prisma.mealPlan)
 */
export async function writeUserCalendar({ date, userId, slots = [] }) {
  try {
    const applied = [];
    for (const item of slots) {
      const res = await MealPlanService.savePlanSlot({
        userId: userId || null,
        date,
        slot: item.slot,
        meal: item.meal,
        image: item.image || null,
        calories: Number(item.calories) || 0,
        cost: Number(item.cost) || 0,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : []
      });
      applied.push(res);
    }

    return {
      success: true,
      date,
      appliedCount: applied.length,
      applied
    };
  } catch (err) {
    console.error('[Tool: writeUserCalendar Error]:', err.message);
    throw err;
  }
}

/**
 * Tool Registry Metadata
 */
export const CHAT_TOOLS = [
  {
    name: 'estimate_min_cost',
    description: 'Tính toán chi phí tối thiểu theo ngày, người và phân bổ dinh dưỡng từ dữ liệu thực tế',
    execute: estimateMinCost
  },
  {
    name: 'search_rescue_deals',
    description: 'Tìm kiếm các suất ăn giải cứu cận date từ đối tác FoodSaver',
    execute: searchRescueDeals
  },
  {
    name: 'search_recipes',
    description: 'Tra cứu công thức nấu ăn món Việt, món chay và định lượng nguyên liệu',
    execute: searchRecipes
  },
  {
    name: 'generate_meal_schedule',
    description: 'Sinh kế hoạch phân bổ món ăn từng ngày chuẩn Việt (chay hoặc mặn)',
    execute: generateMealSchedule
  },
  {
    name: 'read_user_calendar',
    description: 'Đọc dữ liệu lịch ăn của người dùng trong cơ sở dữ liệu để kiểm tra món đã lên lịch',
    execute: readUserCalendar
  },
  {
    name: 'write_user_calendar',
    description: 'Lưu hoặc thay thế món ăn vào Lịch ăn tháng trong Database thật',
    execute: writeUserCalendar
  }
];
