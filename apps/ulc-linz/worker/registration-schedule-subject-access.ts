import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import type { UlcLinzCurrentIdentity } from "./authorization";
import type { PostgresUlcLinzScopePersistence } from "./scope-persistence";
import {
  ULC_REGISTRATION_ACTOR_ACCESS_MAX_ROWS,
  type PostgresUlcRegistrationScheduleActorAccessReader,
  type UlcRegistrationScheduleActorAccessRow,
} from "./registration-schedule-actor-access-postgres";
import roleDataScope from "./role-data-scope.json";

/**
 * Proposed, OFFLINE-only subject-access contract. It does not expand the
 * historical M5-E export, expose a browser endpoint, or settle legal
 * exceptions for audit/security records. Enable only after privacy review
 * and integration with the canonical audited data-access workflow.
 */
export class UlcRegistrationScheduleSubjectAccessBlockedError extends Error {
  constructor() {
    super("Registration-schedule subject access is not authorized.");
    this.name = "UlcRegistrationScheduleSubjectAccessBlockedError";
  }
}

export interface UlcRegistrationScheduleSubjectAccessRequest {
  readonly organizationId: string;
  readonly targetIdentityId: string;
  readonly scope: "self" | "organization-admin";
}

/**
 * Only a durable storage adapter may return this receipt. A Promise<void>,
 * buffered in-memory log, or a successful console write is not enough to
 * authorize a personal actor-history disclosure.
 */
export interface UlcRegistrationScheduleAccessAuditReceipt {
  readonly persisted: true;
  readonly eventId: string;
}

export interface UlcRegistrationScheduleSubjectAccessDependencies {
  readonly permissions: Pick<PermissionStore, "findPrincipal">;
  readonly scopes: Pick<
    PostgresUlcLinzScopePersistence,
    "resolveMembership" | "findLifecycleTarget" | "findDeletionMarker"
  >;
  readonly reader: Pick<
    PostgresUlcRegistrationScheduleActorAccessReader,
    "readActorReferences"
  >;
  readonly recordAccessAudit: (input: {
    readonly actorIdentityId: string;
    readonly organizationId: string;
    readonly targetIdentityId: string;
    readonly scope: "self" | "organization-admin";
    readonly recordCount: number;
    readonly accessedAt: string;
  }) => Promise<UlcRegistrationScheduleAccessAuditReceipt>;
  readonly now: () => Date;
}

export interface UlcRegistrationScheduleSubjectAccessResult {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly targetIdentityId: string;
  readonly accessedAt: string;
  readonly records: readonly UlcRegistrationScheduleActorAccessRow[];
}

function blocked(): never {
  throw new UlcRegistrationScheduleSubjectAccessBlockedError();
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value !== value.trim()) blocked();
  return value;
}

export async function inspectUlcRegistrationScheduleActorData(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcRegistrationScheduleSubjectAccessDependencies,
  request: UlcRegistrationScheduleSubjectAccessRequest,
): Promise<UlcRegistrationScheduleSubjectAccessResult> {
  assertIdentityActionAllowed(current, "application");
  const actor = identifier(current.identity.identityId);
  const org = identifier(request.organizationId);
  const target = identifier(request.targetIdentityId);
  const scope = request.scope;
  if (scope !== "self" && scope !== "organization-admin") blocked();
  const now = dependencies.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) blocked();

  const membership = await dependencies.scopes.resolveMembership({
    identityId: actor, organizationId: org,
  });
  if (membership?.organizationId !== org || membership.active !== true) blocked();

  if (scope === "self") {
    if (target !== actor) blocked();
  } else {
    if (membership.sourceRole !== "admin") blocked();
    const admin = await dependencies.permissions.findPrincipal(principalId(actor));
    if (admin?.principalId !== principalId(actor) ||
        admin.roleIds.length !== 1 ||
        admin.roleIds[0] !== roleId(roleDataScope.runtimeRoleIds.admin) ||
        admin.grants.length !== 0 || admin.revokes.length !== 0) blocked();
  }

  // No data inspection before the subject's owning organization is proved.
  // A deleted subject may be accessed only while an authoritative marker
  // remains valid; no identity is inferred from historical actor strings.
  if (target !== actor) {
    const [member, marker] = await Promise.all([
      dependencies.scopes.findLifecycleTarget(target),
      dependencies.scopes.findDeletionMarker(target),
    ]);
    if (member !== null && marker !== null) blocked();
    if (member !== null) {
      if (member.identityId !== target || member.organizationId !== org) blocked();
    } else if (marker !== null) {
      if (marker.identityId !== target || marker.organizationId !== org ||
          !(marker.completedAt instanceof Date) ||
          !(marker.purgeAfter instanceof Date) ||
          !Number.isFinite(marker.completedAt.getTime()) ||
          !Number.isFinite(marker.purgeAfter.getTime()) ||
          marker.completedAt.getTime() > now.getTime() ||
          marker.purgeAfter.getTime() < now.getTime() ||
          marker.purgeAfter.getTime() <= marker.completedAt.getTime()) blocked();
    } else {
      blocked();
    }
  }

  const records = await dependencies.reader.readActorReferences(org, target);
  if (!Array.isArray(records) ||
      records.length > ULC_REGISTRATION_ACTOR_ACCESS_MAX_ROWS) blocked();
  const accessedAt = now.toISOString();
  // Fail closed: unrecorded access must never return personal audit data.
  if (typeof dependencies.recordAccessAudit !== "function") blocked();
  try {
    const receipt = await dependencies.recordAccessAudit({
      actorIdentityId: actor, organizationId: org,
      targetIdentityId: target, scope,
      recordCount: records.length, accessedAt,
    });
    if (!receipt || receipt.persisted !== true ||
        typeof receipt.eventId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(receipt.eventId)) {
      blocked();
    }
  } catch {
    blocked();
  }
  return Object.freeze({
    schemaVersion: 1,
    organizationId: org,
    targetIdentityId: target,
    accessedAt,
    records: Object.freeze([...records]),
  });
}
