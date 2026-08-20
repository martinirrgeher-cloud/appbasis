import {
  principalId,
  roleId,
  type PermissionStore,
} from "@appbasis/permissions";

import type {
  UlcLinzCurrentIdentity,
  UlcLinzMembershipResolver,
  UlcLinzSubjectScopeResolver,
} from "./authorization";
import {
  exportUlcLinzData,
  UlcLinzDataExportBlockedError,
  type UlcLinzDataExportDependencies,
  type UlcLinzDataExportRequest,
  type UlcLinzDataExportResult,
  type UlcLinzExportAuthorization,
} from "./data-export";
import roleDataScope from "./role-data-scope.json";

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;

export interface UlcLinzCanonicalDataExportDependencies {
  readonly permissions: PermissionStore;
  readonly memberships: UlcLinzMembershipResolver;
  readonly subjectScopes: UlcLinzSubjectScopeResolver;
  readonly readDatasets: UlcLinzDataExportDependencies["readDatasets"];
  readonly recordExportAudit: UlcLinzDataExportDependencies["recordExportAudit"];
  readonly now: UlcLinzDataExportDependencies["now"];
}

/**
 * Canonical M5-E integration boundary.
 *
 * The lower-level export coordinator deliberately remains responsible only for
 * export shaping/sanitization. Runtime consumers must enter through this
 * service so that ULC membership, canonical active runtime role and
 * Self/Managed subject scope are verified against the existing M5-B contracts
 * before any dataset read occurs.
 */
export async function exportUlcLinzDataWithCanonicalAuthorization(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCanonicalDataExportDependencies,
  request: UlcLinzDataExportRequest,
): Promise<UlcLinzDataExportResult> {
  return exportUlcLinzData(
    current,
    {
      authorizeExport: ({ current: authorizedCurrent, request: authorizedRequest }) =>
        authorizeUlcLinzDataExport(
          authorizedCurrent,
          dependencies,
          authorizedRequest,
        ),
      readDatasets: dependencies.readDatasets,
      recordExportAudit: dependencies.recordExportAudit,
      now: dependencies.now,
    },
    request,
  );
}

async function authorizeUlcLinzDataExport(
  current: UlcLinzCurrentIdentity,
  dependencies: Pick<
    UlcLinzCanonicalDataExportDependencies,
    "permissions" | "memberships" | "subjectScopes"
  >,
  request: UlcLinzDataExportRequest,
): Promise<UlcLinzExportAuthorization> {
  assertCanonicalAuthorizationPolicy();

  const identityId = requiredIdentifier(current.identity.identityId);
  const organizationId = requiredIdentifier(request.organizationId);
  const membership = await dependencies.memberships.resolveMembership({
    identityId,
    organizationId,
  });

  if (
    membership === null ||
    membership.active !== true ||
    membership.organizationId !== organizationId ||
    !isSourceRole(membership.sourceRole)
  ) {
    deny();
  }

  const actorPrincipalId = principalId(identityId);
  const expectedRoleId = roleId(
    roleDataScope.runtimeRoleIds[membership.sourceRole],
  );
  const [principal, activeRole] = await Promise.all([
    dependencies.permissions.findPrincipal(actorPrincipalId),
    dependencies.permissions.findRole(expectedRoleId),
  ]);
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== expectedRoleId ||
    activeRole === null ||
    activeRole.roleId !== expectedRoleId
  ) {
    deny();
  }

  if (request.scope === "organization") {
    if (membership.sourceRole !== "admin") deny();
    return Object.freeze({
      actorPrincipalId,
      organizationId,
      sourceRole: membership.sourceRole,
      scope: "organization",
      subjectId: null,
    });
  }

  const subjectId = requiredIdentifier(request.subjectId);
  if (request.scope === "managed" && membership.sourceRole !== "parent") {
    deny();
  }

  const relationType = request.scope === "managed" ? "managed" : "self";
  const related = await dependencies.subjectScopes.hasRelation({
    identityId,
    organizationId,
    subjectId,
    relationType,
  });
  if (!related) deny();

  return Object.freeze({
    actorPrincipalId,
    organizationId,
    sourceRole: membership.sourceRole,
    scope: request.scope,
    subjectId,
  });
}

function assertCanonicalAuthorizationPolicy(): void {
  if (
    roleDataScope.id !== "ulc-linz-role-data-scope-v0.1" ||
    roleDataScope.dataScopes.organizationBoundary !== "same-organization-only" ||
    roleDataScope.dataScopes.inactiveMembership !== "deny" ||
    roleDataScope.dataScopes.athleteLink.relationType !== "self" ||
    roleDataScope.dataScopes.athleteLink.explicitLinksOnly !== true ||
    roleDataScope.dataScopes.parentLink.relationType !== "managed" ||
    roleDataScope.dataScopes.parentLink.explicitLinksOnly !== true
  ) {
    deny();
  }
}

function isSourceRole(value: string): value is UlcLinzSourceRole {
  return Object.hasOwn(roleDataScope.runtimeRoleIds, value);
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    deny();
  }
  return value;
}

function deny(): never {
  throw new UlcLinzDataExportBlockedError("AUTHORIZATION_MISMATCH");
}
