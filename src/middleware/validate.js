const ApiError = require('../utils/ApiError');

// Validates + sanitizes req.body with a zod schema (unknown fields are stripped)
module.exports = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new ApiError(400, 'Validation failed', details));
  }
  req.body = result.data;
  next();
};
