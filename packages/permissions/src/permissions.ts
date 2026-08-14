import type { PermissionRequest, PermissionStore } from "./contracts";
import { PermissionDeniedError } from "./errors";

export async function can(
  store: PermissionStore,
  request: PermissionRequest,
): Promise<boolean> {
  if (store.evaluatePermission !== undefined) {
    return store.evaluatePermission(request);
  }

  if (!(await store.isKnownCapability(request.capability))) return false;

  const principal = await store.findPrincipal(request.principalId);
  if (principal === null) return false;

  if (principal.revokes.includes(request.capability)) return false;
  if (principal.grants.includes(request.capability)) return true;

  for (const assignedRoleId of principal.roleIds) {
    const role = await store.findRole(assignedRoleId);
    if (role?.capabilities.includes(request.capability)) return true;
  }

  return false;
}

export async function assert(
  store: PermissionStore,
  request: PermissionRequest,
): Promise<void> {
  if (!(await can(store, request))) {
    throw new PermissionDeniedError(request.principalId, request.capability);
  }
}
