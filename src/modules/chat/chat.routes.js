import { Router } from 'express';
import { chatController } from './chat.controller.js';
import { optionalAuth, authenticate } from '../../shared/middlewares/auth.js';
import { validate } from '../../shared/middlewares/validate.js';
import { z } from 'zod';

const messageSchema = {
  body: z.object({
    message: z.string().trim().min(1).max(10000),
    sessionId: z.string().trim().min(1).max(100).optional()
  })
};

const createSessionSchema = {
  body: z.object({
    title: z.string().trim().min(1).max(255).optional()
  })
};

const updateSessionSchema = {
  body: z.object({
    title: z.string().trim().min(1).max(255)
  })
};

const router = Router();

// 1. Quản lý danh sách & nội dung Session bền vững (BẮT BUỘC ĐĂNG NHẬP)
router.get('/sessions', authenticate, chatController.listSessions);
router.post('/sessions', authenticate, validate(createSessionSchema), chatController.createSession);
router.get('/sessions/:id', authenticate, chatController.getSession);
router.patch('/sessions/:id', authenticate, validate(updateSessionSchema), chatController.updateSessionTitle);
router.delete('/sessions/:id', authenticate, chatController.deleteSession);

// 2. Chat message & streaming endpoints (optionalAuth: cho phép khách thử chatbot, nhận Bearer token nếu đã login)
router.post('/message', optionalAuth, validate(messageSchema), chatController.sendMessage);
router.post('/stream', optionalAuth, validate(messageSchema), chatController.streamMessage);

// 3. Memory & transparency endpoints
router.get('/memory', optionalAuth, chatController.getMemory);
router.delete('/memory/:key', optionalAuth, chatController.deleteMemoryKey);
router.delete('/session', optionalAuth, chatController.clearSession);

export const chatRoutes = router;
