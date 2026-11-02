import { Router } from 'express';
import { UserController } from './user.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';
import {
  listUsersSchema,
  userIdParamSchema,
  createUserSchema,
  updateUserSchema,
  updateStatusSchema,
  updateRoleSchema
} from './user.validation.js';

const router = Router();

// All user management routes require valid JWT authentication
router.use(authenticate);

// Admin-only: list all users & create user (ADMIN, SYS_ADMIN)
router.get('/', authorize('ADMIN', 'SYS_ADMIN'), validate(listUsersSchema), UserController.getAllUsers);
router.post('/', authorize('ADMIN', 'SYS_ADMIN'), validate(createUserSchema), UserController.createUser);

// Get single user details (Self or Admin)
router.get('/:id', validate(userIdParamSchema), UserController.getUserById);

// Admin-only user management operations (ADMIN, SYS_ADMIN)
router.put('/:id', authorize('ADMIN', 'SYS_ADMIN'), validate(updateUserSchema), UserController.updateUser);
router.patch('/:id/status', authorize('ADMIN', 'SYS_ADMIN'), validate(updateStatusSchema), UserController.updateStatus);
router.patch('/:id/role', authorize('ADMIN', 'SYS_ADMIN'), validate(updateRoleSchema), UserController.updateRole);
router.delete('/:id', authorize('ADMIN', 'SYS_ADMIN'), validate(userIdParamSchema), UserController.deleteUser);

export const userRoutes = router;
