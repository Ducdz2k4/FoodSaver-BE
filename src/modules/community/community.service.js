import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';
import { HttpStatus } from '../../shared/constants/httpStatus.js';

export const CommunityService = {
  async getPosts({ category, sortBy = 'hot', page = 1, limit = 20 } = {}) {
    const where = {};
    if (category && category !== 'all' && category !== 'ALL') {
      where.category = category.toLowerCase();
    }

    const orderBy = sortBy === 'new'
      ? { createdAt: 'desc' }
      : [{ likes: 'desc' }, { createdAt: 'desc' }];

    const total = await prisma.communityPost.count({ where });
    const posts = await prisma.communityPost.findMany({
      where,
      orderBy,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    return {
      posts,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
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
    category = 'tips',
    tags = [],
    mealPlan,
  }) {
    if (!title || !content) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'Tiêu đề và nội dung bài viết không được để trống');
    }

    return prisma.communityPost.create({
      data: {
        userId: userId || null,
        authorName: authorName || 'Thành viên FoodSaver',
        authorAvatar: authorAvatar || '👤',
        authorBadge: authorBadge || null,
        authorRole: authorRole || 'Người yêu ẩm thực & tiết kiệm',
        title: title.trim(),
        content: content.trim(),
        category: category.toLowerCase(),
        tags: Array.isArray(tags) ? tags : [],
        mealPlan: mealPlan || null,
        likes: 0,
        comments: 0,
        views: 1,
      },
    });
  },

  async toggleLikePost(postId, { userId, userIp } = {}) {
    const post = await prisma.communityPost.findUnique({
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

    const existingLike = await prisma.communityLike.findFirst({ where });

    if (existingLike) {
      await prisma.communityLike.delete({ where: { id: existingLike.id } });
      const updated = await prisma.communityPost.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } },
        select: { likes: true },
      });
      return { liked: false, likes: Math.max(0, updated.likes) };
    } else {
      await prisma.communityLike.create({
        data: {
          postId,
          userId: userId || null,
          userIp: userIp || null,
        },
      });
      const updated = await prisma.communityPost.update({
        where: { id: postId },
        data: { likes: { increment: 1 } },
        select: { likes: true },
      });
      return { liked: true, likes: updated.likes };
    }
  },
};
