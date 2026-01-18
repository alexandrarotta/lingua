export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_UNAUTHORIZED"
  | "AUTH_EMAIL_TAKEN"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_INVALID_REFRESH"
  | "AUTH_RESET_TOKEN_INVALID"
  | "AUTH_RESET_TOKEN_EXPIRED"
  | "SESSION_NOT_FOUND";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;

  constructor(input: { statusCode: number; code: ApiErrorCode; message: string }) {
    super(input.message);
    this.statusCode = input.statusCode;
    this.code = input.code;
  }
}

export function badRequest(code: ApiErrorCode, message: string) {
  return new ApiError({ statusCode: 400, code, message });
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError({ statusCode: 401, code: "AUTH_UNAUTHORIZED", message });
}

export function notFound(code: ApiErrorCode, message: string) {
  return new ApiError({ statusCode: 404, code, message });
}

