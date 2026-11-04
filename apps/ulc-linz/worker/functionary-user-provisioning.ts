import { IdentityProvisioningConflictError } from "@appbasis/identity/service";
import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import { ensurePostgresPermissionPrincipal } from "@appbasis/permissions/provisioning";
import {
  capabilityId,
  principalId,
  roleId,
  PrincipalPermissionAdministrationError,
  RoleAdministrationError,
  type PermissionStore,
  type PostgresPrincipalAccessAdministration,
} from "@appbasis/permissions";
import roleDataScope from "./role-data-scope.json";

type Param = string | number | boolean | null;
export interface UlcFunctionarySql {
  unsafe(sql: string, params?: Param[]): PromiseLike<readonly Record<string, unknown>[]>;
}
type AccessAdministration = Pick<PostgresPrincipalAccessAdministration, "replacePrincipalAccess">;

export interface UlcFunctionaryCreateInput {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly username: string;
  readonly displayName: string;
  readonly temporaryPassword: string;
  readonly contactEmail?: string;
}

export class UlcFunctionaryProvisioningError extends Error {
  constructor(readonly code: "NOT_READY" | "CONFLICT" | "INVALID") {
    super("ULC functionary provisioning " + code.toLowerCase() + ".");
    this.name = "UlcFunctionaryProvisioningError";
  }
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > 170 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new UlcFunctionaryProvisioningError("INVALID");
  }
  return value;
}

export function createUlcFunctionaryUserProvisioningService({
  identityProvisioning, sql, permissions, accessAdministration,
}: {
  readonly identityProvisioning: IdentityPostgresProvisioningOwner;
  readonly sql: UlcFunctionarySql;
  readonly permissions: PermissionStore;
  readonly accessAdministration: AccessAdministration;
}) {
  const role = roleId(roleDataScope.runtimeRoleIds.functionary);
  const mapping = roleDataScope.principalPermissionMapping;
  const policy = roleDataScope.permissionTemplates.functionary;
  if (role !== "ulc-linz:functionary" || policy.sourceRole !== "functionary" ||
      policy.edit.length !== 0 || mapping.capabilityNamespace !== "ulc-linz:module" ||
      policy.view.some(k => !["athletes", "exercise_catalog", "training_blocks",
        "training_planning", "training_documentation", "countdown"].includes(k))) {
    throw new Error("ULC functionary canonical policy drift.");
  }
  const grants = Object.freeze(
    policy.view.map(k => capabilityId(mapping.capabilityNamespace + ":" + k + ":view"))
      .sort((a, b) => String(a).localeCompare(String(b))),
  );

  return Object.freeze({
    async createFunctionaryUser(input: UlcFunctionaryCreateInput) {
      const organizationId = identifier(input.organizationId);
      const actorPrincipalId = identifier(input.actorPrincipalId);

      // The identity owner provisions credentials before our membership
      // write. Fail closed here if the explicit role migration was not
      // installed, so a missing schema never produces an orphan test login.
      const readiness = await sql.unsafe(
        `SELECT
           EXISTS (
             SELECT 1 FROM appbasis_permission_role
             WHERE role_id=$1 AND state='active' AND kind='system'
           ) AS role_ready,
           EXISTS (
             SELECT 1 FROM pg_catalog.pg_constraint
             WHERE conname='ulc_linz_membership_source_role_check'
               AND pg_catalog.pg_get_constraintdef(oid) LIKE '%functionary%'
           ) AS membership_ready`,
        [role],
      );
      if (readiness.length !== 1 ||
          readiness[0]?.role_ready !== true ||
          readiness[0]?.membership_ready !== true) {
        throw new UlcFunctionaryProvisioningError("NOT_READY");
      }

      let identity;
      try {
        identity = await identityProvisioning.createInitialUser(
          {
            username: input.username,
            displayName: input.displayName,
            temporaryPassword: input.temporaryPassword,
            ...(input.contactEmail === undefined ? {} : { contactEmail: input.contactEmail }),
          },
          {
            provisioningOwner: "ulc-linz:functionary-user",
            actorPrincipalId,
            reason: "ULC Linz functionary user provisioning",
          },
        );
      } catch (error) {
        if (error instanceof IdentityProvisioningConflictError) {
          throw new UlcFunctionaryProvisioningError("CONFLICT");
        }
        throw error;
      }
      if (identity.accountStatus !== "active" || identity.mustChangePassword !== true) {
        throw new UlcFunctionaryProvisioningError("CONFLICT");
      }
      const identityId = identifier(identity.identityId);
      const subjectId = "ulc-functionary:" + identityId;
      const rows = await sql.unsafe(
        `INSERT INTO ulc_linz_membership
           (identity_id, organization_id, subject_id, source_role, active)
         SELECT account.id, $2, $3, 'functionary', true
         FROM "user" account
         WHERE account.id=$1 AND COALESCE(account.banned,false)=false
         ON CONFLICT (identity_id) DO NOTHING
         RETURNING identity_id, organization_id, subject_id, source_role, active`,
        [identityId, organizationId, subjectId],
      );
      if (rows.length !== 1 || rows[0]?.identity_id !== identityId ||
          rows[0]?.organization_id !== organizationId ||
          rows[0]?.subject_id !== subjectId ||
          rows[0]?.source_role !== "functionary" ||
          rows[0]?.active !== true) {
        throw new UlcFunctionaryProvisioningError("CONFLICT");
      }

      const principal = principalId(identityId);
      await ensurePostgresPermissionPrincipal(sql, principal);
      const previous = await permissions.findPrincipal(principal);
      if (previous === null || previous.roleIds.length !== 0 ||
          previous.grants.length !== 0 || previous.revokes.length !== 0) {
        throw new UlcFunctionaryProvisioningError("CONFLICT");
      }
      try {
        await accessAdministration.replacePrincipalAccess(
          principal,
          [role],
          { grants, revokes: [] },
          {
            actorPrincipalId: principalId(actorPrincipalId),
            reason: "ULC Linz functionary user provisioning",
          },
          {
            expectedRoleIds: previous.roleIds,
            expectedGrants: previous.grants,
            expectedRevokes: previous.revokes,
          },
        );
      } catch (error) {
        if ((error instanceof RoleAdministrationError &&
            error.code === "STALE_PRINCIPAL_ROLES") ||
            (error instanceof PrincipalPermissionAdministrationError &&
            error.code === "STALE_PRINCIPAL_PERMISSIONS")) {
          throw new UlcFunctionaryProvisioningError("CONFLICT");
        }
        throw error;
      }
      return Object.freeze({
        identityId, username: identity.username, displayName: identity.displayName,
        mustChangePassword: true as const,
      });
    },
  });
}
