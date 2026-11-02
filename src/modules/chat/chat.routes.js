import { Router } from 'express';
import { chatController } from './chat.controller.js';
import { optionalAuth } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { z } from 'zod';

const messageSchema = {
  body: z.object({
    message: z.string().trim().min(1).max(10000),
    sessionId: z.string().trim().min(1).max(100).optional()
  })
};

const router = Router();
router.use(optionalAuth);

// Message endpoints
router.post('/message', validate(messageSchema), chatController.sendMessage);
router.post('/stream', validate(messageSchema), chatController.streamMessage);

// Memory & transparency endpoints
router.get('/memory', chatController.getMemory);
router.delete('/memory/:key', chatController.deleteMemoryKey);
router.delete('/session', chatController.clearSession);

export const chatRoutes = router;
