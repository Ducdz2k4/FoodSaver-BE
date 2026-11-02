import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { HttpStatus } from '../../shared/constants/httpStatus.js';

export const CommunityService = {
  async getPosts({ category, tag, search, sortBy = 'hot', bookmarkedOnly = false, page = 1, limit = 20, userId, userIp } = {}) {
    page = Math.max(1, parseInt(page, 10) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const where = {};

    if (category && category !== 'all' && category !== 'ALL') {
      where.category = category.toLowerCase();
    }

    if (tag) {
      const cleanTag = tag.replace(/^#/, '').trim().toLowerCase();
      where.tags = {
        array_contains: cleanTag,
      };
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term } },
        { content: { contains: term } },
        { authorName: { contains: term } },
      ];
    }

    if (bookmarkedOnly && userId) {
      where.postBookmarks = {
        some: { userId },
      };
    }

    let orderBy;
    switch (sortBy) {
      case 'new':
        orderBy = { createdAt: 'desc' };
        break;
      case 'comments':
        orderBy = [{ comments: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'bookmarks':
        orderBy = [{ bookmarks: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'hot':
      default:
        orderBy = [{ likes: 'desc' }, { createdAt: 'desc' }];
        break;
    }

    const total = await prisma.communityPost.count({ where });

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        postLikes: {
          where: userId ? { userId } : userIp ? { userIp } : { id: '__none__' },
          select: { id: true },
        },
        postBookmarks: userId
          ? {
              where: { userId },
              select: { id: true },
            }
          : false,
        postComments: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            authorName: true,
            authorAvatar: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    const formattedPosts = posts.map((p) => {
      const { postLikes, postBookmarks, ...rest } = p;
      return {
        ...rest,
        isLiked: Array.isArray(postLikes) && postLikes.length > 0,
        isBookmarked: Array.isArray(postBookmarks) && postBookmarks.length > 0,
      };
    });

    return {
      posts: formattedPosts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getPostById(id, { userId, userIp } = {}) {
    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        postLikes: {
          where: userId ? { userId } : userIp ? { userIp } : { id: '__none__' },
          select: { id: true },
        },
        postBookmarks: userId
          ? {
              where: { userId },
              select: { id: true },
            }
          : false,
        postComments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!post) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy bài viết');
    }

    // Increment views asynchronously
    prisma.communityPost.update({
      where: { id },
      data: { views: { increment: 1 } },
    }).catch(() => {});

    const { postLikes, postBookmarks, ...rest } = post;
    return {
      ...rest,
      isLiked: Array.isArray(postLikes) && postLikes.length > 0,
      isBookmarked: Array.isArray(postBookmarks) && postBookmarks.length > 0,
    };
  },

  async createPost({
    userId,
    authorName,
    authorAvatar = '👤',
    authorBadge,
    authorRole,
    title,
    content,
    imageUrl,
    category = 'tips',
    tags = [],
    recipeData,
    mealPlan,
  }) {
    if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Tiêu đề và nội dung bài viết không được để trống');
    }

    const cleanTags = Array.isArray(tags)
      ? tags.map((t) => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean)
      : [];

    return prisma.communityPost.create({
      data: {
        userId: userId || null,
        authorName: authorName || 'Thành viên FoodSaver',
        authorAvatar: authorAvatar || '👤',
        authorBadge: authorBadge || null,
        authorRole: authorRole || 'Người yêu ẩm thực & tiết kiệm',
        title: title.trim(),
        content: content.trim(),
        imageUrl: imageUrl || null,
        category: category.toLowerCase(),
        tags: cleanTags,
        recipeData: recipeData || null,
        mealPlan: mealPlan || null,
        likes: 0,
        comments: 0,
        bookmarks: 0,
        views: 1,
      },
    });
  },

  async deletePost(id, { userId, role } = {}) {
    const post = await prisma.communityPost.findUnique({ where: { id } });
    if (!post) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Bài viết không tồn tại');
    }

    const isAdmin = role === 'ADMIN' || role === 'SYS_ADMIN';
    if (!isAdmin && post.userId !== userId) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Bạn không có quyền xóa bài viết này');
    }

    await prisma.communityPost.delete({ where: { id } });
    return { success: true, message: 'Đã xóa bài viết thành công' };
  },

  async toggleLikePost(postId, { userId, userIp } = {}) {
    return prisma.$transaction(async (tx) => {
      const post = await tx.communityPost.findUnique({
        where: { id: postId },
      });
      if (!post) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy bài viết này');
      }

      const where = { postId };
      if (userId) {
        where.userId = userId;
      } else if (userIp) {
        where.userIp = userIp;
      }

      const existingLike = await tx.communityLike.findFirst({ where });

      if (existingLike) {
        await tx.communityLike.delete({ where: { id: existingLike.id } });
        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { likes: { decrement: 1 } },
          select: { likes: true },
        });
        return { liked: false, likes: Math.max(0, updated.likes) };
      } else {
        await tx.communityLike.create({
          data: {
            postId,
            userId: userId || null,
            userIp: userIp || null,
          },
        });
        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { likes: { increment: 1 } },
          select: { likes: true },
        });
        return { liked: true, likes: updated.likes };
      }
    });
  },

  async toggleBookmarkPost(postId, { userId }) {
    if (!userId) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'Vui lòng đăng nhập để lưu bài viết vào sổ tay');
    }

    return prisma.$transaction(async (tx) => {
      const post = await tx.communityPost.findUnique({
        where: { id: postId },
      });
      if (!post) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy bài viết này');
      }

      const existingBookmark = await tx.communityBookmark.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      if (existingBookmark) {
        await tx.communityBookmark.delete({
          where: { id: existingBookmark.id },
        });
        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { bookmarks: { decrement: 1 } },
          select: { bookmarks: true },
        });
        return { bookmarked: false, bookmarks: Math.max(0, updated.bookmarks) };
      } else {
        await tx.communityBookmark.create({
          data: {
            postId,
            userId,
          },
        });
        const updated = await tx.communityPost.update({
          where: { id: postId },
          data: { bookmarks: { increment: 1 } },
          select: { bookmarks: true },
        });
        return { bookmarked: true, bookmarks: updated.bookmarks };
      }
    });
  },

  async getComments(postId) {
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Bài viết không tồn tại');
    }

    return prisma.communityComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async addComment(postId, { userId, authorName, authorAvatar, content }) {
    if (!content || !content.trim()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Nội dung bình luận không được để trống');
    }

    return prisma.$transaction(async (tx) => {
      const post = await tx.communityPost.findUnique({
        where: { id: postId },
      });
      if (!post) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy bài viết này');
      }

      const comment = await tx.communityComment.create({
        data: {
          postId,
          userId: userId || null,
          authorName: authorName || 'Thành viên FoodSaver',
          authorAvatar: authorAvatar || '👤',
          content: content.trim(),
        },
      });

      await tx.communityPost.update({
        where: { id: postId },
        data: { comments: { increment: 1 } },
      });

      return comment;
    });
  },

  async deleteComment(postId, commentId, { userId, role } = {}) {
    const comment = await prisma.communityComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.postId !== postId) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Bình luận không tồn tại');
    }

    const isAdmin = role === 'ADMIN' || role === 'SYS_ADMIN';
    if (!isAdmin && comment.userId !== userId) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Bạn không có quyền xóa bình luận này');
    }

    await prisma.$transaction([
      prisma.communityComment.delete({ where: { id: commentId } }),
      prisma.communityPost.update({
        where: { id: postId },
        data: { comments: { decrement: 1 } },
      }),
    ]);

    return { success: true, message: 'Đã xóa bình luận' };
  },

  async getTrendingTags() {
    // Extract all tags from existing posts in DB and compute frequency
    const posts = await prisma.communityPost.findMany({
      select: { tags: true },
    });

    const countMap = {};
    for (const post of posts) {
      if (Array.isArray(post.tags)) {
        for (const rawTag of post.tags) {
          const t = String(rawTag).replace(/^#/, '').trim().toLowerCase();
          if (t) {
            countMap[t] = (countMap[t] || 0) + 1;
          }
        }
      }
    }

    const sorted = Object.entries(countMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return sorted;
  },

  async getTopContributors() {
    // Aggregate contributors from real community posts and likes in DB
    const posts = await prisma.communityPost.findMany({
      select: {
        userId: true,
        authorName: true,
        authorAvatar: true,
        authorBadge: true,
        likes: true,
      },
    });

    const userMap = {};
    for (const p of posts) {
      const key = p.userId || p.authorName;
      if (!userMap[key]) {
        userMap[key] = {
          userId: p.userId,
          name: p.authorName,
          avatar: p.authorAvatar,
          badge: p.authorBadge || 'Thành viên nhiệt huyết',
          postCount: 0,
          totalLikes: 0,
        };
      }
      userMap[key].postCount += 1;
      userMap[key].totalLikes += p.likes || 0;
    }

    const sorted = Object.values(userMap)
      .sort((a, b) => (b.totalLikes * 2 + b.postCount) - (a.totalLikes * 2 + a.postCount))
      .slice(0, 5);

    return sorted;
  },

  async importMealPlan(postId, { userId, startDate } = {}) {
    if (!userId) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'Vui lòng đăng nhập để áp dụng kế hoạch ăn vào lịch của bạn');
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'Không tìm thấy bài viết này');
    }

    if (!post.mealPlan) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Bài viết này không chứa kế hoạch bữa ăn để nhập');
    }

    const rawPlan = post.mealPlan;
    // Expected structure: array of items: [{ dayOffset?: number, date?: string, slot: string, meal: string, image?: string, calories?: number, cost?: number, ingredients?: string[] }]
    // Or object with days/meals
    let items = [];
    if (Array.isArray(rawPlan)) {
      items = rawPlan;
    } else if (rawPlan.meals && Array.isArray(rawPlan.meals)) {
      items = rawPlan.meals;
    } else if (rawPlan.days && Array.isArray(rawPlan.days)) {
      // Days array: [{ day: 1, meals: [...] }]
      rawPlan.days.forEach((dayObj, dIdx) => {
        if (Array.isArray(dayObj.meals)) {
          dayObj.meals.forEach((m) => {
            items.push({ ...m, dayOffset: m.dayOffset ?? dIdx });
          });
        }
      });
    }

    if (items.length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Kế hoạch không có các bữa ăn hợp lệ để thêm');
    }

    // Determine base date
    const baseDate = startDate ? new Date(startDate) : new Date();
    // Normalize to YYYY-MM-DD
    const formatDate = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    let importedCount = 0;
    const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];

    for (const item of items) {
      const slot = (item.slot || 'lunch').toLowerCase();
      if (!validSlots.includes(slot)) continue;

      let targetDateStr;
      if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        targetDateStr = item.date;
      } else {
        const offset = Number(item.dayOffset) || 0;
        const d = new Date(baseDate);
        d.setDate(d.getDate() + offset);
        targetDateStr = formatDate(d);
      }

      const meal = item.meal || item.name || 'Bữa ăn chia sẻ';
      const calories = Number(item.calories) || 0;
      const cost = Number(item.cost) || 0;
      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      const image = item.image || post.imageUrl || null;

      // Upsert into MealPlan
      const existing = await prisma.mealPlan.findFirst({
        where: {
          userId,
          date: targetDateStr,
          slot,
        },
      });

      if (existing) {
        await prisma.mealPlan.update({
          where: { id: existing.id },
          data: { meal, image, calories, cost, ingredients },
        });
      } else {
        await prisma.mealPlan.create({
          data: {
            userId,
            date: targetDateStr,
            slot,
            meal,
            image,
            calories,
            cost,
            ingredients,
          },
        });
      }
      importedCount++;
    }

    return {
      success: true,
      importedCount,
      message: `Đã áp dụng thành công ${importedCount} bữa ăn vào lịch ăn uống của bạn!`,
    };
  },
};
