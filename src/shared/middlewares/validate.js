import { ApiError } from '../utils/apiError.js';

export const validate = (schemas) => {
  return (req, _res, next) => {
    const targets = ['body', 'query', 'params'];
    const validationErrors = [];

    for (const target of targets) {
      if (schemas[target]) {
        const result = schemas[target].safeParse(req[target]);
        if (!result.success) {
          const issues = result.error.issues.map(issue => ({
            location: target,
            field: issue.path.join('.'),
            message: issue.message
          }));
          validationErrors.push(...issues);
        } else {
          // Express 5 defines req.query with a getter, so we mutate properties instead of reassigning
          if (target === 'query') {
            for (const key of Object.keys(req.query)) {
              delete req.query[key];
            }
            Object.assign(req.query, result.data);
          } else if (target === 'params') {
            Object.assign(req.params, result.data);
          } else {
            req[target] = result.data;
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return next(ApiError.badRequest('Dữ liệu yêu cầu không hợp lệ', validationErrors));
    }

    return next();
  };
};
