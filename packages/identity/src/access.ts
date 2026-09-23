import type { CurrentIdentity, IdentityAction } from "./contracts";
import { IdentityError } from "./errors";

export type { CurrentIdentity, IdentityAction } from "./contracts";

export function assertIdentityActionAllowed(
  current: CurrentIdentity,
  action: IdentityAction,
): void {
  if (
    current.access === "password-change-required" &&
    action !== "change-password" &&
    action !== "end-session"
  ) {
    throw new IdentityError(
      "PASSWORD_CHANGE_REQUIRED",
      "The password must be changed before using the application.",
    );
  }
}
