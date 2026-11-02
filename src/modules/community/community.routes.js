import { Router } from 'express';
import { CommunityController } from './community.controller.js';
import { authenticate, optionalAuth } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { z } from 'zod';

const postSchema = {
  body: z.object({
    title: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(20000),
    imageUrl: z.string().trim().max(500).optional().nullable(),
    category: z.string().trim().min(1).max(50).optional(),
    tags: z.array(z.string().max(100)).max(30).optional(),
    recipeData: z.unknown().optional().nullable(),
    mealPlan: z.unknown().optional().nullable(),
    authorName: z.string().trim().max(100).optional(),
    authorAvatar: z.string().trim().max(255).optional(),
  }),
};

const commentSchema = {
  body: z.object({
    content: z.string().trim().min(1).max(2000),
    authorName: z.string().trim().max(100).optional(),
    authorAvatar: z.string().trim().max(255).optional(),
  }),
};

const router = Router();

router.get('/trending-tags', CommunityController.getTrendingTags);
router.get('/top-contributors', CommunityController.getTopContributors);

router.get('/posts', optionalAuth, CommunityController.listPosts);
router.get('/posts/:id', optionalAuth, CommunityController.getPostById);
router.post('/posts', optionalAuth, validate(postSchema), CommunityController.createPost);
router.delete('/posts/:id', authenticate, CommunityController.deletePost);

router.post('/posts/:id/like', optionalAuth, CommunityController.toggleLike);
router.post('/posts/:id/bookmark', authenticate, CommunityController.toggleBookmark);

router.get('/posts/:id/comments', CommunityController.getComments);
router.post('/posts/:id/comments', optionalAuth, validate(commentSchema), CommunityController.addComment);
router.delete('/posts/:id/comments/:commentId', authenticate, CommunityController.deleteComment);

router.post('/posts/:id/import-plan', authenticate, CommunityController.importMealPlan);

export const communityRoutes = router;
