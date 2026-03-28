import { ApiError } from "../utils/apiError.js";

export function notFoundHandler(_request, _response, next) {
  next(new ApiError(404, "Route not found."));
}

export function errorHandler(error, _request, response, _next) {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const payload = {
    error: {
      message: error.message || "Internal server error.",
    },
  };

  if (error instanceof ApiError && error.details) {
    payload.error.details = error.details;
  }

  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json(payload);
}
