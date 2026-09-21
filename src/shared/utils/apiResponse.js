import { HttpStatus } from '../constants/httpStatus.js';

export class ApiResponse {
  static success(res, {
    message = 'Success',
    data = null,
    statusCode = HttpStatus.OK,
    meta = undefined
  } = {}) {
    const payload = {
      success: true,
      statusCode,
      message,
      data
    };

    if (meta !== undefined) {
      payload.meta = meta;
    }

    return res.status(statusCode).json(payload);
  }

  static created(res, {
    message = 'Resource created successfully',
    data = null,
    meta = undefined
  } = {}) {
    return this.success(res, {
      message,
      data,
      statusCode: HttpStatus.CREATED,
      meta
    });
  }

  static noContent(res) {
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
