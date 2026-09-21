import { HttpStatus } from '../constants/httpStatus.js';
import { env } from '../../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Normalizers for common 3rd-party library / engine errors
 */
const handleBadJsonSyntaxError = () => {
  return ApiError.badRequest('Cú pháp JSON không hợp lệ trong body yêu cầu');
};

const handleCastErrorDB = (err) => {
  return ApiError.badRequest(`Giá trị không hợp lệ cho trường '${err.path}': ${err.value}`);
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'trường';
  const value = err.keyValue ? err.keyValue[field] : '';
  return ApiError.conflict(`Dữ liệu '${value}' của '${field}' đã tồn tại trong hệ thống`);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors || {}).map((item) => ({
    field: item.path,
    message: item.message
  }));
  return ApiError.badRequest('Dữ liệu không đáp ứng ràng buộc', errors);
};

const handleJWTError = () => {
  return ApiError.unauthorized('Mã token không hợp lệ hoặc đã bị chỉnh sửa');
};

const handleJWTExpiredError = () => {
  return ApiError.unauthorized('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại');
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

  // 2. Handle Database errors (Mongoose / MongoDB)
  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);

  // 3. Handle JWT errors
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

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
