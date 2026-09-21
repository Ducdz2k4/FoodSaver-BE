import { ApiError } from '../utils/apiError.js';

export const notFound = (req, _res, next) => {
  next(ApiError.notFound(`Không tìm thấy tuyến đường: ${req.method} ${req.originalUrl}`));
};
