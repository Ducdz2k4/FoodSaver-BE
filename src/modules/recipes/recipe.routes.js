import { Router } from 'express';
import { RecipeController } from './recipe.controller.js';

const router = Router();

router.get('/', RecipeController.list);
router.get('/:id', RecipeController.getById);
router.post('/', RecipeController.create);

export const recipeRoutes = router;
