import { Router } from 'express';
import { AdminStatsController } from './admin.controller.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';

const router = Router();

// Toàn bộ API Thống kê Quản trị yêu cầu quyền ADMIN hoặc SYS_ADMIN
router.use(authenticate, authorize('ADMIN', 'SYS_ADMIN'));

router.get('/dashboard', AdminStatsController.getDashboardMetrics);
router.get('/reports', AdminStatsController.getESGReports);

export const adminStatsRoutes = router;
