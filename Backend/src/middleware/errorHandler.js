const { AppError } = require('../utils/customErrors');
const logger = require('../utils/logger'); // Import winston logger

function errorHandler(err, req, res, next) {
  // Log the error using Winston
  logger.error(err); // this logs full stack trace to `error.log`

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Catch all fallback
  res.status(500).json({
    message: 'Something went wrong. Please try again later.'
  });
}

module.exports = errorHandler;
