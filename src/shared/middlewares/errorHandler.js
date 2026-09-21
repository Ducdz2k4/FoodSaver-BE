import { HttpStatus } from '../constants/httpStatus.js';
import { env } from '../../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Normalizers for common 3rd-party library / engine errors
 */
const handleBadJsonSyntaxError = () => {
  return ApiError.badRequest('Cú pháp JSON không hợp lệ trong body yêu cầu');
};

const handleJWTError = () => {
  return ApiError.unauthorized('Mã token không hợp lệ hoặc đã bị chỉnh sửa');
};

const handleJWTExpiredError = () => {
  return ApiError.unauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại');
};

/**
 * Handle Prisma ORM Known Request Errors
 */
const handlePrismaKnownRequestError = (err) => {
  switch (err.code) {
    case 'P2002': {
      const target = Array.isArray(err.meta?.target) 
        ? err.meta.target.join(', ') 
        : (err.meta?.target || 'dữ liệu');
      return ApiError.conflict(`Dữ liệu của '${target}' đã tồn tại trong hệ thống`);
    }
    case 'P2025':
      return ApiError.notFound(err.meta?.cause || 'Không tìm thấy bản ghi yêu cầu');
    case 'P2003':
      return ApiError.badRequest(`Ràng buộc dữ liệu liên kết không hợp lệ (${err.meta?.field_name || 'khóa ngoại'})`);
    case 'P2000':
      return ApiError.badRequest('Giá trị truyền vào vượt quá độ dài tối đa cho phép');
    case 'P1001':
      return ApiError.internal('Không thể kết nối tới cơ sở dữ liệu MySQL');
    default:
      return ApiError.badRequest(`Lỗi truy vấn cơ sở dữ liệu: ${err.message}`);
  }
};

/**
 * Centralized Global Error Handler Middleware
 */
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // 1. Handle Malformed JSON body from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = handleBadJsonSyntaxError();
  }

  // 2. Handle JWT errors
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // 3. Handle Prisma Errors
  if (err.name === 'PrismaClientKnownRequestError') {
    error = handlePrismaKnownRequestError(err);
  } else if (err.name === 'PrismaClientValidationError') {
    error = ApiError.badRequest('Tham số truy vấn cơ sở dữ liệu không hợp lệ');
  } else if (err.name === 'PrismaClientInitializationError') {
    error = ApiError.internal('Không thể khởi tạo kết nối cơ sở dữ liệu MySQL');
  }

  const statusCode = error.statusCode || error.status || HttpStatus.INTERNAL_SERVER_ERROR;
  const isOperational = error.isOperational ?? false;

  let message = error.message || 'Đã xảy ra lỗi máy chủ nội bộ';

  // In production, mask unexpected server errors to avoid leaking sensitive internal details
  if (env.isProduction && statusCode === HttpStatus.INTERNAL_SERVER_ERROR && !isOperational) {
    message = 'Đã xảy ra sự cố từ hệ thống. Vui lòng thử lại sau!';
  }

  const response = {
    success: false,
    statusCode,
    message,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  };

  if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
    response.errors = error.errors;
  }

  if (!env.isProduction && err.stack) {
    response.stack = err.stack;
  }

  if (statusCode >= 500) {
    console.error(`[Global Error] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json(response);
};
