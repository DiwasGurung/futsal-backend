const env = require('../config/env');
const ApiError = require('../utils/ApiError');

exports.notFound = (req, res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  let details = err.details;

  if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for: ${Object.keys(err.keyPattern || {}).join(', ') || 'unique field'}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid ID';
  }

  if (status === 500) {
    console.error(err);
    if (env.nodeEnv === 'production') message = 'Internal server error';
  }

  res.status(status).json({
    success: false,
    message,
    ...(details && { details }),
    ...(env.nodeEnv === 'development' && status === 500 && { stack: err.stack }),
  });
};
