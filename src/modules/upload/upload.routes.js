import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './upload.controller.js';
import { authenticate } from '../../shared/middlewares/auth.js';
import { ApiError } from '../../shared/utils/apiError.js';

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest('Định dạng tệp không được hỗ trợ. Chỉ chấp nhận ảnh JPG, PNG, WEBP'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter
});

const router = Router();

// Yêu cầu đăng nhập trước khi tải file
router.use(authenticate);

// POST /api/v1/upload/single
router.post('/single', upload.single('image'), UploadController.uploadSingle);

// POST /api/v1/upload/multiple
router.post('/multiple', upload.array('images', 5), UploadController.uploadMultiple);

export const uploadRoutes = router;
