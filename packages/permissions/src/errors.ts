import type { CapabilityId, PrincipalId } from "./contracts";

export class PermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED" as const;

  constructor(
    readonly principalId: PrincipalId,
    readonly capability: CapabilityId,
  ) {
    super(`Principal ${principalId} is not allowed to use capability ${capability}.`);
    this.name = "PermissionDeniedError";
  }
}
