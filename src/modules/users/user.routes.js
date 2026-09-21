import { Router } from 'express';
import { UserController } from './user.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import { listUsersSchema, userIdParamSchema, updateUserSchema } from './user.validation.js';

const router = Router();

router.get('/', validate(listUsersSchema), UserController.getAllUsers);
router.get('/:id', validate(userIdParamSchema), UserController.getUserById);
router.put('/:id', validate(updateUserSchema), UserController.updateUser);
router.delete('/:id', validate(userIdParamSchema), UserController.deleteUser);

export const userRoutes = router;
