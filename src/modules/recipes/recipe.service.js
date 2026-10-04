import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { HttpStatus } from '../../shared/constants/httpStatus.js';

export const RecipeService = {
  async getRecipes({ category, search, page = 1, limit = 50 } = {}) {
    const where = {};

    if (category && category !== 'all' && category !== 'ALL') {
      where.category = category.toLowerCase();
    }

    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search.trim() } },
      ];
    }

    const total = await prisma.recipe.count({ where });
    const recipes = await prisma.recipe.findMany({
      where,
      orderBy: { rating: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    return {
      recipes,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  },

  async getRecipeById(id) {
    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy công thức món ăn này');
    }

    return recipe;
  },

  async createRecipe(data) {
    return prisma.recipe.create({
      data: {
        name: data.name,
        image: data.image || '🍲',
        calories: Number(data.calories) || 0,
        cookTime: Number(data.cookTime) || 0,
        servings: Number(data.servings) || 1,
        cost: Number(data.cost) || 0,
        category: data.category || 'com',
        tags: data.tags || [],
        ingredients: data.ingredients || [],
        steps: data.steps || [],
        rating: Number(data.rating) || 5.0,
        reviews: 0,
      },
    });
  },
};
