const { AppError } = require('../utils/customErrors');
const logger = require('../utils/logger'); // Import winston logger

function errorHandler(err, req, res, next) {
  // Log the error using Winston
  logger.error(err); // this logs full stack trace to `error.log`

  if (err instanceof AppError) {
    const body = {
      state: 0,
      message: err.message,
    };
    if (typeof err.code === "string" && err.code.trim()) {
      body.code = err.code;
    }
    if (err.details && typeof err.details === "object") {
      body.details = err.details;
    }
    return res.status(err.statusCode).json(body);
  }

  // Catch all fallback
  res.status(500).json({
    state: 0,
    message: 'Something went wrong. Please try again later.'
  });
}

module.exports = errorHandler;
