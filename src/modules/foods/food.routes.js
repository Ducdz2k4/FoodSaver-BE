import { Router } from 'express';
import { FoodController } from './food.controller.js';
import { validate } from '../../shared/middlewares/validate.js';
import {
  createFoodSchema,
  updateFoodSchema,
  queryFoodSchema,
  foodIdParamSchema
} from './food.validation.js';

const router = Router();

router.get('/', validate(queryFoodSchema), FoodController.getAllFoods);
router.post('/', validate(createFoodSchema), FoodController.createFood);
router.get('/:id', validate(foodIdParamSchema), FoodController.getFoodById);
router.put('/:id', validate(updateFoodSchema), FoodController.updateFood);
router.delete('/:id', validate(foodIdParamSchema), FoodController.deleteFood);

export const foodRoutes = router;
