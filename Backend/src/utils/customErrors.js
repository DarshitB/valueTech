class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
} // Custom error class for application-specific errors

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
} // Custom error for not found resources

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
} // Custom error for bad requests

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
} // Custom error for resource conflicts

module.exports = {
  AppError,
  NotFoundError,
  BadRequestError,
  ConflictError
};
