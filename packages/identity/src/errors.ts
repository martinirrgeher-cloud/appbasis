export type IdentityErrorCode =
  | "AUTHENTICATION_FAILED"
  | "IDENTITY_DISABLED"
  | "IDENTITY_STATE_MISSING"
  | "PASSWORD_CHANGE_FAILED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "PASSWORD_CHANGE_NOT_REQUIRED"
  | "SESSION_INVALID";

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;

  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
  }
}
