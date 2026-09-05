const definitions = {
  AUTH_REQUIRED: [
    401,
    "A verified creator access token is required.",
    "refresh_auth",
  ],
  AUTH_EXPIRED: [401, "The creator access token has expired.", "refresh_auth"],
  REQUEST_ACCESS_REQUIRED: [
    401,
    "Request recovery authorization is required.",
    "none",
  ],
  USER_SUSPENDED: [403, "This user account is unavailable.", "resolve_blocker"],
  WORKSPACE_SUSPENDED: [
    403,
    "This workspace is unavailable.",
    "resolve_blocker",
  ],
  CAPABILITY_DISABLED: [
    403,
    "This request is not allowed by server configuration.",
    "none",
  ],
  RESOURCE_NOT_FOUND: [404, "The requested resource was not found.", "none"],
  METHOD_NOT_ALLOWED: [405, "This HTTP method is not supported.", "none"],
  BOOTSTRAP_REQUIRED: [
    409,
    "Identity initialization is required.",
    "resolve_blocker",
  ],
  INVALID_REQUEST: [
    400,
    "The request does not match the transport contract.",
    "none",
  ],
  PRECONDITION_REQUIRED: [
    428,
    "The current resource ETag is required.",
    "reload_resource",
  ],
  PAYLOAD_TOO_LARGE: [413, "The request exceeds the transport limit.", "none"],
  UNSUPPORTED_MEDIA_TYPE: [
    415,
    "Use an uncompressed application/json request body.",
    "none",
  ],
  DEPENDENCY_UNAVAILABLE: [
    503,
    "A required service is unavailable.",
    "resolve_blocker",
  ],
  CAPABILITY_NOT_IMPLEMENTED: [
    503,
    "This operation is not implemented in this release.",
    "none",
  ],
  INTERNAL_ERROR: [500, "The request could not be completed.", "none"],
} as const;
export type ErrorCode = keyof typeof definitions;
export class AppError extends Error {
  readonly status: number;
  readonly retryAction: string;
  constructor(readonly code: ErrorCode) {
    const [status, message, retryAction] = definitions[code];
    super(message);
    this.status = status;
    this.retryAction = retryAction;
  }
  detail() {
    return {
      code: this.code,
      message: this.message,
      retryAction: this.retryAction,
      fields: [],
      blockers: [],
    };
  }
}
