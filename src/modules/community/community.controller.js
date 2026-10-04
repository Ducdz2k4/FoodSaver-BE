import { CommunityService } from './community.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const CommunityController = {
  listPosts: asyncHandler(async (req, res) => {
    const { category, sortBy, page, limit } = req.query;
    const { posts, meta } = await CommunityService.getPosts({ category, sortBy, page, limit });

    return ApiResponse.success(res, {
      message: 'Danh sách bài viết cộng đồng',
      data: posts,
      meta,
    });
  }),

  createPost: asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const authorName = req.user?.fullName || req.body.authorName;
    const authorAvatar = req.user?.avatar || req.body.authorAvatar;

    const post = await CommunityService.createPost({
      userId,
      authorName,
      authorAvatar,
      authorBadge: req.body.authorBadge,
      authorRole: req.body.authorRole,
      title: req.body.title,
      content: req.body.content,
      category: req.body.category,
      tags: req.body.tags,
      mealPlan: req.body.mealPlan,
    });

    return ApiResponse.created(res, {
      message: 'Chia sẻ bài viết thành công',
      data: post,
    });
  }),

  toggleLike: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const userIp = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await CommunityService.toggleLikePost(id, { userId, userIp });
    return ApiResponse.success(res, {
      message: result.liked ? 'Đã thích bài viết' : 'Đã bỏ thích bài viết',
      data: result,
    });
  }),
};
