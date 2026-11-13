import { UlcLinzAuthorizationDeniedError } from "./authorization";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16 – dormant, transaction-bound module authority for staff registration.
 *
 * A group's self-registration mode and display name are NOT module identity.
 * In schema v16 only the canonical youth mapping is backed by a persisted,
 * unique organization/group row. A performance_registration capability, even
 * when granted to a trainer/admin, does not prove that an unmapped group is IRG.
 *
 * This intentionally CANNOT authorize performance_registration until a
 * separate, operator-approved, stored module authority exists. Do not infer
 * IRG from an unmapped group, group name, or client-selected module string.
 */
export interface UlcStaffRegistrationModuleAuthority {
  readonly moduleId: "kindertraining";
  readonly capability: "ulc-linz:module:kindertraining:edit";
}

export async function assertUlcStaffRegistrationModuleAuthority(
  transaction: UlcTrainingSessionSqlClient,
  organizationId: string,
  groupId: string,
): Promise<UlcStaffRegistrationModuleAuthority> {
  const mappings = await transaction.unsafe(
    `SELECT module_id FROM ulc_linz_training_module_group
     WHERE organization_id = $1 AND group_id = $2 FOR SHARE`,
    [organizationId, groupId],
  );

  // Even a performance_registration:edit principal does not authorize a
  // group without an explicit, locked module mapping. Do not promote unknown
  // module strings or an absent mapping to a fallback classification.
  if (mappings.length !== 1 || mappings[0]?.module_id !== "kindertraining") {
    throw new UlcLinzAuthorizationDeniedError();
  }

  return Object.freeze({
    moduleId: "kindertraining" as const,
    capability: "ulc-linz:module:kindertraining:edit" as const,
  });
}
