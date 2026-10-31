const env = require('../config/env');
const ApiError = require('../utils/ApiError');

exports.notFound = (req, res, next) =>
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));

// Maps PostgreSQL error codes to HTTP responses
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  const details = err.details;

  switch (err.code) {
    case '23505': // unique_violation
      status = 409;
      message = 'Duplicate value: a record with the same unique field already exists';
      break;
    case '23503': // foreign_key_violation
      status = 409;
      message = 'Referenced record does not exist or is still in use';
      break;
    case '23514': // check_violation
    case '23502': // not_null_violation
      status = 400;
      message = 'Invalid data';
      break;
    case '22P02': // invalid_text_representation (bad UUID etc.)
    case '22007':
    case '22008':
      status = 400;
      message = 'Invalid input value';
      break;
    default:
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
