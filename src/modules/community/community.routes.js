import { Router } from 'express';
import { CommunityController } from './community.controller.js';
import { optionalAuth } from '../../shared/middlewares/auth.js';

const router = Router();

router.get('/posts', CommunityController.listPosts);
router.post('/posts', optionalAuth, CommunityController.createPost);
router.post('/posts/:id/like', optionalAuth, CommunityController.toggleLike);

export const communityRoutes = router;
