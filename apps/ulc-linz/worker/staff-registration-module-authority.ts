import { UlcLinzAuthorizationDeniedError } from "./authorization";
import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * N16: canonical, transacted group authority; currently unexposed.
 * The draft v18 migration extends the existing unique module mapping but
 * performs no group assignment or role grant. Historical IRG registrations
 * remain stored under kindertraining, independently from its authorization.
 */
export type UlcStaffRegistrationPermissionModule =
  "kindertraining" | "performance_registration";

export interface UlcStaffRegistrationModuleAuthority {
  readonly moduleId: "kindertraining";
  readonly authorizationModuleId: UlcStaffRegistrationPermissionModule;
  readonly capability:
    | "ulc-linz:module:kindertraining:edit"
    | "ulc-linz:module:performance_registration:edit";
}

export async function assertUlcStaffRegistrationModuleAuthority(
  transaction: UlcTrainingSessionSqlClient,
  organizationId: string,
  groupId: string,
): Promise<UlcStaffRegistrationModuleAuthority> {
  const rows = await transaction.unsafe(
    `SELECT module_id FROM ulc_linz_training_module_group
     WHERE organization_id = $1 AND group_id = $2 FOR SHARE`,
    [organizationId, groupId],
  );
  if (rows.length !== 1) throw new UlcLinzAuthorizationDeniedError();
  switch (rows[0]?.module_id) {
    case "kindertraining":
      return Object.freeze({
        moduleId: "kindertraining" as const,
        authorizationModuleId: "kindertraining" as const,
        capability: "ulc-linz:module:kindertraining:edit" as const,
      });
    case "performance_registration":
      return Object.freeze({
        moduleId: "kindertraining" as const,
        authorizationModuleId: "performance_registration" as const,
        capability: "ulc-linz:module:performance_registration:edit" as const,
      });
    default:
      // No module inference from name, attendance mode, or client input.
      throw new UlcLinzAuthorizationDeniedError();
  }
}
