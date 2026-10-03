import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import {
  registerSchema,
  loginSchema,
  googleLoginSchema,
  verifyOtpSchema,
  setPasswordSchema,
  refreshTokenSchema,
  changePasswordSchema,
  updateProfileSchema
} from './auth.validation.js';

const router = Router();

// Public auth endpoints
router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/google', validate(googleLoginSchema), AuthController.googleLogin);
router.post('/refresh-token', validate(refreshTokenSchema), AuthController.refreshToken);

// Protected auth endpoints (Require JWT Bearer token)
router.post('/verify-otp', authenticate, validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/resend-otp', authenticate, AuthController.resendOtp);
router.post('/set-password', authenticate, validate(setPasswordSchema), AuthController.setPassword);
router.get('/me', authenticate, AuthController.getMe);
router.put('/profile', authenticate, validate(updateProfileSchema), AuthController.updateProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);
router.post('/logout', authenticate, AuthController.logout);

export const authRoutes = router;
