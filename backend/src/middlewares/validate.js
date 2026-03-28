import { ApiError } from "../utils/apiError.js";

export function validate(schema, property = "body") {
  return function validationMiddleware(request, _response, next) {
    const parsed = schema.safeParse(request[property]);

    if (!parsed.success) {
      next(
        new ApiError(400, "Validation failed.", {
          issues: parsed.error.issues.map(issue => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    request[property] = parsed.data;
    next();
  };
}
