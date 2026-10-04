import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { HttpStatus } from '../../shared/constants/httpStatus.js';

/**
 * Extract search keywords from recipe name and category for partner listing matching
 */
function extractKeywords(name, category) {
  const cleanName = (name || '').toLowerCase();
  const keywords = [];

  if (cleanName.includes('cơm tấm') || cleanName.includes('sườn')) {
    keywords.push('cơm tấm', 'sườn', 'cơm sườn', 'cơm');
  }
  if (cleanName.includes('bún bò')) {
    keywords.push('bún bò', 'bò huế', 'bún');
  }
  if (cleanName.includes('phở')) {
    keywords.push('phở bò', 'phở');
  }
  if (cleanName.includes('bánh mì')) {
    keywords.push('bánh mì', 'croissant', 'baguette');
  }
  if (cleanName.includes('canh chua') || cleanName.includes('cá lóc')) {
    keywords.push('canh chua', 'cá lóc', 'canh');
  }
  if (cleanName.includes('gỏi cuốn')) {
    keywords.push('gỏi cuốn', 'cuốn');
  }
  if (cleanName.includes('xôi')) {
    keywords.push('xôi xéo', 'xôi');
  }
  if (cleanName.includes('cơm rang') || cleanName.includes('dưa bò')) {
    keywords.push('cơm rang', 'dưa bò', 'cơm');
  }
  if (cleanName.includes('trái cây') || cleanName.includes('nước ép')) {
    keywords.push('trái cây', 'nước ép', 'sinh tố');
  }
  if (cleanName.includes('chè')) {
    keywords.push('chè', 'ngọt', 'tráng miệng');
  }
  if (cleanName.includes('salad')) {
    keywords.push('salad', 'rau');
  }

  const words = cleanName.split(/\s+/).filter((w) => w.length >= 3);
  keywords.push(...words);

  return Array.from(new Set(keywords));
}

function matchPartnerListing(recipe, listings) {
  const keywords = extractKeywords(recipe.name, recipe.category);

  for (const kw of keywords) {
    const matched = listings.find((l) => {
      const title = (l.title || '').toLowerCase();
      const desc = (l.description || '').toLowerCase();
      const hasImage = Array.isArray(l.imageUrls) && l.imageUrls.length > 0 && Boolean(l.imageUrls[0]);
      return hasImage && (title.includes(kw) || desc.includes(kw));
    });

    if (matched) {
      return {
        partnerImage: matched.imageUrls[0],
        partnerListingId: matched.id,
        partnerListingTitle: matched.title,
        partnerStoreName: matched.partner?.businessName || 'Đối tác FoodSaver',
        partnerPrice: matched.discountPrice,
        partnerOriginalPrice: matched.originalPrice,
      };
    }
  }

  return {
    partnerImage: null,
    partnerListingId: null,
    partnerListingTitle: null,
    partnerStoreName: null,
    partnerPrice: null,
    partnerOriginalPrice: null,
  };
}

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

    const partnerListings = await prisma.listing.findMany({
      where: { status: 'AVAILABLE' },
      select: {
        id: true,
        title: true,
        description: true,
        discountPrice: true,
        originalPrice: true,
        imageUrls: true,
        partner: {
          select: {
            businessName: true,
          },
        },
      },
      take: 100,
    });

    const enrichedRecipes = recipes.map((r) => {
      const partnerData = matchPartnerListing(r, partnerListings);
      return {
        ...r,
        ...partnerData,
      };
    });

    return {
      recipes: enrichedRecipes,
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

    const partnerListings = await prisma.listing.findMany({
      where: { status: 'AVAILABLE' },
      select: {
        id: true,
        title: true,
        description: true,
        discountPrice: true,
        originalPrice: true,
        imageUrls: true,
        partner: {
          select: {
            businessName: true,
          },
        },
      },
      take: 100,
    });

    const partnerData = matchPartnerListing(recipe, partnerListings);

    return {
      ...recipe,
      ...partnerData,
    };
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
