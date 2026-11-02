import { Router } from 'express';
import { CommunityController } from './community.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { z } from 'zod';

const postSchema = {
  body: z.object({
    title: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(20000),
    category: z.string().trim().min(1).max(50).optional(),
    tags: z.array(z.string().max(100)).max(30).optional(),
    mealPlan: z.unknown().optional()
  })
};

const router = Router();

router.get('/posts', CommunityController.listPosts);
router.post('/posts', authenticate, validate(postSchema), CommunityController.createPost);
router.post('/posts/:id/like', authenticate, CommunityController.toggleLike);

export const communityRoutes = router;
