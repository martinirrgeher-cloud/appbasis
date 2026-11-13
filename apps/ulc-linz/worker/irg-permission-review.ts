import { UlcLinzAuthorizationDeniedError } from "./authorization";
import type { UlcUserAccessChoice } from "./user-admin-permission-profiles";

/**
 * N16 PREVIEW-ONLY capability plan. Deliberately no permission-store writer
 * and no active user-administration import. This is not authorization.
 *
 * Its output can later be supplied to the audited core permission
 * administration only AFTER a separate server-side actor/target check and
 * the exact expected-role/grant/revoke CAS contract is reviewed.
 */
const CAP_VIEW = "ulc-linz:module:performance_registration:view";
const CAP_EDIT = "ulc-linz:module:performance_registration:edit";

export interface UlcIrgTrainerPermissionReviewInput {
  readonly targetSourceRole: string;
  readonly expectedRoleIds: readonly string[];
  readonly expectedGrants: readonly string[];
  readonly expectedRevokes: readonly string[];
  readonly roleCapabilities: readonly string[];
  readonly choice: UlcUserAccessChoice;
}

export interface UlcIrgTrainerPermissionReviewPlan {
  readonly expectedRoleIds: readonly string[];
  readonly expectedGrants: readonly string[];
  readonly expectedRevokes: readonly string[];
  readonly proposedGrants: readonly string[];
  readonly proposedRevokes: readonly string[];
  readonly changedCapabilities: readonly string[];
}

export function reviewUlcIrgTrainerPermission(
  input: UlcIrgTrainerPermissionReviewInput,
): UlcIrgTrainerPermissionReviewPlan {
  if (input.targetSourceRole !== "trainer" ||
      input.expectedRoleIds.length !== 1 ||
      input.expectedRoleIds[0] !== "ulc-linz:trainer" ||
      !["none","view","edit"].includes(input.choice) ||
      !validSet(input.expectedGrants) || !validSet(input.expectedRevokes) ||
      !validSet(input.roleCapabilities) ||
      input.expectedGrants.some(x => input.expectedRevokes.includes(x))) {
    throw new UlcLinzAuthorizationDeniedError();
  }
  const grants = new Set(input.expectedGrants);
  const revokes = new Set(input.expectedRevokes);
  const defaults = new Set(input.roleCapabilities);

  for (const [capability, wants] of [
    [CAP_VIEW, input.choice !== "none"],
    [CAP_EDIT, input.choice === "edit"],
  ] as const) {
    if (defaults.has(capability)) {
      grants.delete(capability);
      if (wants) revokes.delete(capability);
      else revokes.add(capability);
    } else {
      revokes.delete(capability);
      if (wants) grants.add(capability);
      else grants.delete(capability);
    }
  }
  const previous = new Set([...input.expectedGrants, ...input.expectedRevokes]);
  const proposed = new Set([...grants, ...revokes]);
  const changedCapabilities = [CAP_VIEW,CAP_EDIT].filter(capability =>
    previous.has(capability) !== proposed.has(capability) ||
    input.expectedGrants.includes(capability) !== grants.has(capability) ||
    input.expectedRevokes.includes(capability) !== revokes.has(capability),
  );
  return Object.freeze({
    expectedRoleIds: Object.freeze([...input.expectedRoleIds]),
    expectedGrants: Object.freeze([...input.expectedGrants]),
    expectedRevokes: Object.freeze([...input.expectedRevokes]),
    proposedGrants: Object.freeze([...grants].sort()),
    proposedRevokes: Object.freeze([...revokes].sort()),
    changedCapabilities: Object.freeze(changedCapabilities),
  });
}

function validSet(values: unknown): values is readonly string[] {
  return Array.isArray(values) && values.length <= 100 &&
    values.every((x: unknown) => typeof x === "string" && x.length > 0 &&
      x.length <= 200 && x === x.trim()) &&
    new Set(values).size === values.length;
}
