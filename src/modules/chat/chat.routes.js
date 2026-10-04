import { Router } from 'express';
import { chatController } from './chat.controller.js';

const router = Router();

// Message endpoints
router.post('/message', chatController.sendMessage);
router.post('/stream', chatController.streamMessage);

// Memory & transparency endpoints
router.get('/memory', chatController.getMemory);
router.delete('/memory/:key', chatController.deleteMemoryKey);
router.delete('/session', chatController.clearSession);

export const chatRoutes = router;
