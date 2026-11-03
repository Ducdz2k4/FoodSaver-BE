import { Router } from 'express';
import { SafetyReportController } from './safetyReport.controller.js';
import { authenticate, authorize } from '../../shared/middlewares/auth.js';

const adminSafetyReportRouter = Router();

// Toàn bộ API Quản lý sự cố ATTP yêu cầu quyền ADMIN hoặc SYS_ADMIN
adminSafetyReportRouter.use(authenticate, authorize('ADMIN', 'SYS_ADMIN'));

adminSafetyReportRouter.get('/', SafetyReportController.getAdminReports);
adminSafetyReportRouter.get('/:id', SafetyReportController.getAdminReportById);
adminSafetyReportRouter.patch('/:id', SafetyReportController.updateAdminReport);

export const adminSafetyReportRoutes = adminSafetyReportRouter;
