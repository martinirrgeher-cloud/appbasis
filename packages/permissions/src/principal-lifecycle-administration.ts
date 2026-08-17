import { principalId, type PrincipalId } from "./contracts";
import type { RoleAdministrationAuditContext, RoleAdministrationPostgresClient } from "./role-administration";

const MAX_AUDIT_REASON_LENGTH = 500;

export type PrincipalLifecycleAdministrationErrorCode =
  | "INVALID_AUDIT_CONTEXT"
  | "PRINCIPAL_ACCESS_NOT_QUARANTINED";

export class PrincipalLifecycleAdministrationError extends Error {
  readonly code: PrincipalLifecycleAdministrationErrorCode;

  constructor(code: PrincipalLifecycleAdministrationErrorCode, message: string) {
    super(message);
    this.name = "PrincipalLifecycleAdministrationError";
    this.code = code;
  }
}

export class PostgresPrincipalLifecycleAdministration {
  constructor(private readonly client: RoleAdministrationPostgresClient) {}

  async recordIdentityDeletionAttempt(
    requestedPrincipalId: PrincipalId,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<void> {
    const targetPrincipalId = validatedPrincipalId(requestedPrincipalId);
    const audit = normalizedAuditContext(auditContext);

    await this.client.begin(async (transaction) => {
      await transaction.unsafe(
        `INSERT INTO appbasis_permission_administration_audit (
           event_type,
           actor_principal_id,
           reason,
           target_type,
           target_id,
           previous_value,
           new_value
         )
         VALUES ('principal.identity.delete.requested', $1, $2, 'principal', $3, NULL, NULL)`,
        [audit.actorPrincipalId, audit.reason, targetPrincipalId],
      );
    });
  }

  async deleteQuarantinedPrincipal(
    requestedPrincipalId: PrincipalId,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<boolean> {
    const targetPrincipalId = validatedPrincipalId(requestedPrincipalId);
    const audit = normalizedAuditContext(auditContext);

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

      await transaction.unsafe(
        `INSERT INTO appbasis_permission_administration_audit (
           event_type,
           actor_principal_id,
           reason,
           target_type,
           target_id,
           previous_value,
           new_value
         )
         VALUES ('principal.delete', $1, $2, 'principal', $3, NULL, NULL)`,
        [audit.actorPrincipalId, audit.reason, targetPrincipalId],
      );
      return true;
    });
  }
}

function normalizedAuditContext(context: RoleAdministrationAuditContext): {
  readonly actorPrincipalId: PrincipalId;
  readonly reason: string;
} {
  const actorPrincipalId = validatedPrincipalId(context.actorPrincipalId);
  const reason = context.reason;
  if (
    typeof reason !== "string" ||
    reason.length === 0 ||
    reason.length > MAX_AUDIT_REASON_LENGTH ||
    reason !== reason.trim()
  ) {
    throw new PrincipalLifecycleAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      `Audit reason must be trimmed and contain 1-${MAX_AUDIT_REASON_LENGTH} characters.`,
    );
  }
  return { actorPrincipalId, reason };
}

function validatedPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new PrincipalLifecycleAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      "Audit principal ID is invalid.",
    );
  }
  return principalId(raw);
}
