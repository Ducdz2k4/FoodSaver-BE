import { CommunityService } from './community.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const CommunityController = {
  listPosts: asyncHandler(async (req, res) => {
    const { category, tag, search, sortBy, bookmarkedOnly, page, limit } = req.query;
    const userId = req.user?.id || null;
    const userIp = req.ip || req.connection?.remoteAddress || 'unknown';

    const { posts, meta } = await CommunityService.getPosts({
      category,
      tag,
      search,
      sortBy,
      bookmarkedOnly: bookmarkedOnly === 'true' || bookmarkedOnly === true,
      page,
      limit,
      userId,
      userIp,
    });

    return ApiResponse.success(res, {
      message: 'Danh sách bài viết cộng đồng',
      data: posts,
      meta,
    });
  }),

  getPostById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const userIp = req.ip || req.connection?.remoteAddress || 'unknown';

    const post = await CommunityService.getPostById(id, { userId, userIp });
    return ApiResponse.success(res, {
      message: 'Chi tiết bài viết',
      data: post,
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
      authorBadge: req.user?.partnerCapability === 'VERIFIED' ? 'Đối tác đã xác minh' : null,
      authorRole: req.user?.role || 'Thành viên cộng đồng',
      title: req.body.title,
      content: req.body.content,
      imageUrl: req.body.imageUrl,
      category: req.body.category,
      tags: req.body.tags,
      recipeData: req.body.recipeData,
      mealPlan: req.body.mealPlan,
    });

    return ApiResponse.created(res, {
      message: 'Chia sẻ bài viết thành công',
      data: post,
    });
  }),

  deletePost: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await CommunityService.deletePost(id, {
      userId: req.user?.id,
      role: req.user?.role,
    });
    return ApiResponse.success(res, {
      message: result.message,
      data: result,
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

  toggleBookmark: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    const result = await CommunityService.toggleBookmarkPost(id, { userId });
    return ApiResponse.success(res, {
      message: result.bookmarked ? 'Đã lưu bài viết vào sổ tay' : 'Đã bỏ lưu bài viết',
      data: result,
    });
  }),

  getComments: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const comments = await CommunityService.getComments(id);
    return ApiResponse.success(res, {
      message: 'Danh sách bình luận',
      data: comments,
    });
  }),

  addComment: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const authorName = req.user?.fullName || req.body.authorName || 'Thành viên FoodSaver';
    const authorAvatar = req.user?.avatar || req.body.authorAvatar || '👤';

    const comment = await CommunityService.addComment(id, {
      userId,
      authorName,
      authorAvatar,
      content: req.body.content,
    });

    return ApiResponse.created(res, {
      message: 'Đã gửi bình luận thành công',
      data: comment,
    });
  }),

  deleteComment: asyncHandler(async (req, res) => {
    const { id, commentId } = req.params;
    const result = await CommunityService.deleteComment(id, commentId, {
      userId: req.user?.id,
      role: req.user?.role,
    });
    return ApiResponse.success(res, {
      message: result.message,
      data: result,
    });
  }),

  getTrendingTags: asyncHandler(async (req, res) => {
    const tags = await CommunityService.getTrendingTags();
    return ApiResponse.success(res, {
      message: 'Danh sách hashtag xu hướng',
      data: tags,
    });
  }),

  getTopContributors: asyncHandler(async (req, res) => {
    const contributors = await CommunityService.getTopContributors();
    return ApiResponse.success(res, {
      message: 'Top thành viên tích cực',
      data: contributors,
    });
  }),

  importMealPlan: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    const { startDate } = req.body;

    const result = await CommunityService.importMealPlan(id, { userId, startDate });
    return ApiResponse.success(res, {
      message: result.message,
      data: result,
    });
  }),
};
