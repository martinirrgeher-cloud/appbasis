import { principalId, type PrincipalId } from "./contracts";
import type { RoleAdministrationPostgresClient } from "./role-administration";

export type PrincipalLifecycleAdministrationErrorCode =
  | "INVALID_PRINCIPAL_ID"
  | "PRINCIPAL_ACCESS_NOT_QUARANTINED";

export class PrincipalLifecycleAdministrationError extends Error {
  readonly code: PrincipalLifecycleAdministrationErrorCode;

  constructor(code: PrincipalLifecycleAdministrationErrorCode, message: string) {
    super(message);
    this.name = "PrincipalLifecycleAdministrationError";
    this.code = code;
  }
}

/**
 * Destructive cleanup boundary for the permission owner.
 *
 * The high-level lifecycle coordinator must first call the existing audited
 * replacePrincipalAccess() operation. This owner refuses to delete a principal
 * while any role/grant/revoke remains. No new audit event type is introduced
 * here because the permission audit schema is owned by its existing migration
 * lifecycle and is concurrently consumed by M5-F.
 */
export class PostgresPrincipalLifecycleAdministration {
  constructor(private readonly client: RoleAdministrationPostgresClient) {}

  async deleteQuarantinedPrincipal(
    requestedPrincipalId: PrincipalId,
  ): Promise<boolean> {
    const targetPrincipalId = validatedPrincipalId(requestedPrincipalId);

    return this.client.begin(async (transaction) => {
      const principalRows = await transaction.unsafe(
        `SELECT principal_id
         FROM appbasis_permission_principal
         WHERE principal_id = $1
         FOR UPDATE`,
        [targetPrincipalId],
      );
      if (principalRows.length === 0) return false;
      if (principalRows.length !== 1) {
        throw new PrincipalLifecycleAdministrationError(
          "PRINCIPAL_ACCESS_NOT_QUARANTINED",
          "Permission principal state is inconsistent.",
        );
      }

      const accessRows = await transaction.unsafe(
        `SELECT
           (SELECT count(*)::int FROM appbasis_permission_principal_role WHERE principal_id = $1) AS role_count,
           (SELECT count(*)::int FROM appbasis_permission_principal_grant WHERE principal_id = $1) AS grant_count,
           (SELECT count(*)::int FROM appbasis_permission_principal_revoke WHERE principal_id = $1) AS revoke_count`,
        [targetPrincipalId],
      );
      const access = accessRows[0];
      if (
        access === undefined ||
        access.role_count !== 0 ||
        access.grant_count !== 0 ||
        access.revoke_count !== 0
      ) {
        throw new PrincipalLifecycleAdministrationError(
          "PRINCIPAL_ACCESS_NOT_QUARANTINED",
          "Permission principal must have no roles, grants, or revokes before deletion.",
        );
      }

      const deletedRows = await transaction.unsafe(
        `DELETE FROM appbasis_permission_principal
         WHERE principal_id = $1
         RETURNING principal_id`,
        [targetPrincipalId],
      );
      if (deletedRows.length !== 1) {
        throw new PrincipalLifecycleAdministrationError(
          "PRINCIPAL_ACCESS_NOT_QUARANTINED",
          "Permission principal deletion did not affect exactly one principal.",
        );
      }
      return true;
    });
  }
}

function validatedPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new PrincipalLifecycleAdministrationError(
      "INVALID_PRINCIPAL_ID",
      "Permission principal ID is invalid.",
    );
  }
  return principalId(raw);
}
