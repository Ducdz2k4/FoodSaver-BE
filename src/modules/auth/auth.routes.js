import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { registerSchema, loginSchema } from './auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.get('/me', AuthController.getMe);

export const authRoutes = router;
