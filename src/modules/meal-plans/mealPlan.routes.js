import { Router } from 'express';
import { MealPlanController } from './mealPlan.controller.js';
import { optionalAuth } from '../../shared/middlewares/auth.js';

const router = Router();

router.get('/', optionalAuth, MealPlanController.getMonthPlans);
router.get('/summary', optionalAuth, MealPlanController.getSummary);
router.post('/', optionalAuth, MealPlanController.savePlan);
router.delete('/:id', optionalAuth, MealPlanController.deletePlan);

export const mealPlanRoutes = router;
