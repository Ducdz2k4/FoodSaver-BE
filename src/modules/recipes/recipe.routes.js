import { Router } from 'express';
import { RecipeController } from './recipe.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';

const router = Router();

// Public: Xem danh sách và chi tiết công thức món ăn
router.get('/', RecipeController.list);
router.get('/:id', RecipeController.getById);

// Protected: Tạo công thức món ăn mới yêu cầu đăng nhập
router.post('/', authenticate, RecipeController.create);

export const recipeRoutes = router;
