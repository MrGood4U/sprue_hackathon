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
  RESOURCE_CONFLICT: [
    409,
    "A resource with the same protected identity already exists.",
    "reload_resource",
  ],
  GRAPH_CREDENTIAL_REQUIRED: [
    409,
    "Select an active Graph API credential before discovering sources.",
    "resolve_blocker",
  ],
  GRAPH_SOURCE_VERIFICATION_FAILED: [
    422,
    "The Graph source identity or schema could not be verified.",
    "none",
  ],
  DATA_API_KEY_REQUIRED: [
    401,
    "A valid Sprue data API key is required.",
    "none",
  ],
  DATA_API_KEY_INVALID: [
    403,
    "The Sprue data API key is invalid, expired, or outside this product scope.",
    "none",
  ],
  X402_PREREQUISITES_MISSING: [
    409,
    "A healthy deployment and verified Hedera HBAR recipient are required before x402 publication.",
    "resolve_blocker",
  ],
  X402_PAYMENT_REPLAYED: [
    409,
    "This x402 payment authorization has already been used.",
    "none",
  ],
  X402_SETTLEMENT_FAILED: [
    502,
    "The x402 payment could not be settled, so no protected response was released.",
    "none",
  ],
  LIVE_EXECUTION_FAILED: [
    502,
    "The fixed live data plan could not complete its upstream query.",
    "none",
  ],
  RATE_LIMITED: [
    429,
    "The provider limit prevents this operation from completing now.",
    "resolve_blocker",
  ],
  INVALID_REQUEST: [
    400,
    "The request does not match the transport contract.",
    "none",
  ],
  VALIDATION_FAILED: [
    422,
    "The structured data product definition did not pass validation.",
    "none",
  ],
  PRECONDITION_REQUIRED: [
    428,
    "The current resource ETag is required.",
    "reload_resource",
  ],
  PRECONDITION_FAILED: [
    412,
    "The resource changed after it was read.",
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
