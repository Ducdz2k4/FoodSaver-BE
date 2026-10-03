import { HttpStatus } from '../constants/httpStatus.js';

export class ApiError extends Error {
  constructor(statusCode, message, errors = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors = null) {
    return new ApiError(HttpStatus.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(HttpStatus.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(HttpStatus.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(HttpStatus.NOT_FOUND, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(HttpStatus.CONFLICT, message);
  }

  static unprocessableEntity(message = 'Unprocessable Entity', errors = null) {
    return new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, message, errors);
  }

  static serviceUnavailable(message = 'Service unavailable') {
    return new ApiError(HttpStatus.SERVICE_UNAVAILABLE, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, message, null, false);
  }
}
