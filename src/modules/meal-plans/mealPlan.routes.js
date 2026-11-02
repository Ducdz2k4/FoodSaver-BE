import { Router } from 'express';
import { MealPlanController } from './mealPlan.controller.js';
import { optionalAuth, authenticate } from '../../shared/middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, MealPlanController.getMonthPlans);
router.get('/summary', optionalAuth, MealPlanController.getSummary);
router.post('/', authenticate, MealPlanController.savePlan);
router.delete('/:id', authenticate, MealPlanController.deletePlan);

export const mealPlanRoutes = router;
