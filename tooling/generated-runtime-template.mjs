import { extendIdentityPermissionsWorkerTemplate } from "./generated-identity-permissions-worker-template.mjs";
import { renderGeneratedPrivateWorkerBootstrapConfig } from "./generated-private-worker-config.mjs";
import { createIdentityRuntimeTemplate as createCoreIdentityRuntimeTemplate } from "./generated-runtime-template-core.mjs";
import { extendUlcLinzDatabaseAssetsTemplate } from "./generated-ulc-linz-database-assets.mjs";
import { extendUlcLinzSecurityLoggingTemplate } from "./generated-ulc-linz-security-logging-template.mjs";

const POSTGRES_E2E_PATH = "test/app.postgres.e2e.ts";
const WORKER_ENTRYPOINT_PATH = "worker/index.ts";
const ULC_SECURITY_EVENT_POSTGRES_PATH = "worker/security-events-postgres.ts";
const PRODUCTION_WORKER_BOOTSTRAP_CONFIG_PATH = "wrangler.production.bootstrap.jsonc";
const PERMISSION_FOUNDATION_BLOCK = `const permissionMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  import.meta.url,
);`;
const PERMISSION_LIFECYCLE_BLOCK = `const permissionRoleLifecycleMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
  import.meta.url,
);`;
const PERMISSION_AUDIT_BLOCK = `const permissionAdministrationAuditMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
  import.meta.url,
);`;
const PRINCIPAL_PERMISSION_AUDIT_BLOCK = `const principalPermissionAdministrationAuditMigrationUrl = new URL(
  "../../../packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
  import.meta.url,
);`;
const APPLY_PERMISSION_FOUNDATION = "  await applyMigration(permissionMigrationUrl);";
const APPLY_PERMISSION_LIFECYCLE =
  "  await applyMigration(permissionRoleLifecycleMigrationUrl);";
const APPLY_PERMISSION_AUDIT =
  "  await applyMigration(permissionAdministrationAuditMigrationUrl);";
const APPLY_PRINCIPAL_PERMISSION_AUDIT =
  "  await applyMigration(principalPermissionAdministrationAuditMigrationUrl);";

export function createIdentityRuntimeTemplate(input) {
  const generated = extendUlcLinzSecurityLoggingTemplate(
    input,
    extendUlcLinzDatabaseAssetsTemplate(
      input,
      extendIdentityPermissionsWorkerTemplate(
        input,
        createCoreIdentityRuntimeTemplate(input),
      ),
    ),
  );
  const files = generated.files.map((entry) => {
    if (entry.path === POSTGRES_E2E_PATH) {
      return Object.freeze({
        ...entry,
        content: withPermissionMigrations(entry.content),
      });
    }
    if (input?.appId === "ulc-linz" && entry.path === ULC_SECURITY_EVENT_POSTGRES_PATH) {
      return Object.freeze({
        ...entry,
        content: withServerOwnedUlcSecurityRetention(entry.content),
      });
    }
    return entry;
  });

  if (files.some((entry) => entry.path === WORKER_ENTRYPOINT_PATH)) {
    files.push(
      Object.freeze({
        path: PRODUCTION_WORKER_BOOTSTRAP_CONFIG_PATH,
        content: renderGeneratedPrivateWorkerBootstrapConfig(input),
      }),
    );
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function withServerOwnedUlcSecurityRetention(content) {
  const oldCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < $1::timestamptz
\`;

export function createPostgresUlcLinzSecurityEventLogger(`;
  const newCleanup = `const PURGE_SECURITY_EVENT_SQL = \`
DELETE FROM ulc_linz_security_event_log
WHERE retained_until < statement_timestamp()
\`;

export function createPostgresUlcLinzSecurityEventLogger(`;
  const oldFunction = `export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
  now: Date,
): Promise<void> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("A valid retention evaluation time is required.");
  }
  await client.unsafe(PURGE_SECURITY_EVENT_SQL, [now.toISOString()]);
}`;
  const newFunction = `/**
 * Deletes only events whose database-enforced twelve-calendar-month boundary is
 * strictly older than the PostgreSQL server's statement timestamp. There is no
 * caller-supplied clock or cutoff, so an HTTP/request/operator value cannot
 * shorten the retention period.
 */
export async function purgeExpiredUlcLinzSecurityEvents(
  client: UlcLinzSecurityEventSqlClient,
): Promise<void> {
  await client.unsafe(PURGE_SECURITY_EVENT_SQL);
}`;

  if (!content.includes(oldCleanup) || !content.includes(oldFunction)) {
    throw new Error("Generated ULC security retention source drifted before server-owned cutoff hardening.");
  }
  return content.replace(oldCleanup, newCleanup).replace(oldFunction, newFunction);
}

function withPermissionMigrations(content) {
  let next = content;

  if (!next.includes("0001_appbasis_permission_role_lifecycle.sql")) {
    if (!next.includes(PERMISSION_FOUNDATION_BLOCK)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission foundation migration block.",
      );
    }
    if (!next.includes(APPLY_PERMISSION_FOUNDATION)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission foundation migration application.",
      );
    }
    next = next
      .replace(
        PERMISSION_FOUNDATION_BLOCK,
        `${PERMISSION_FOUNDATION_BLOCK}\n${PERMISSION_LIFECYCLE_BLOCK}`,
      )
      .replace(
        APPLY_PERMISSION_FOUNDATION,
        `${APPLY_PERMISSION_FOUNDATION}\n${APPLY_PERMISSION_LIFECYCLE}`,
      );
  }

  if (!next.includes("0002_appbasis_permission_administration_audit.sql")) {
    if (!next.includes(PERMISSION_LIFECYCLE_BLOCK)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission lifecycle migration block.",
      );
    }
    if (!next.includes(APPLY_PERMISSION_LIFECYCLE)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission lifecycle migration application.",
      );
    }
    next = next
      .replace(
        PERMISSION_LIFECYCLE_BLOCK,
        `${PERMISSION_LIFECYCLE_BLOCK}\n${PERMISSION_AUDIT_BLOCK}`,
      )
      .replace(
        APPLY_PERMISSION_LIFECYCLE,
        `${APPLY_PERMISSION_LIFECYCLE}\n${APPLY_PERMISSION_AUDIT}`,
      );
  }

  if (!next.includes("0003_appbasis_principal_permission_administration_audit.sql")) {
    if (!next.includes(PERMISSION_AUDIT_BLOCK)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission administration audit migration block.",
      );
    }
    if (!next.includes(APPLY_PERMISSION_AUDIT)) {
      throw new Error(
        "Generated PostgreSQL E2E template is missing the permission administration audit migration application.",
      );
    }
    next = next
      .replace(
        PERMISSION_AUDIT_BLOCK,
        `${PERMISSION_AUDIT_BLOCK}\n${PRINCIPAL_PERMISSION_AUDIT_BLOCK}`,
      )
      .replace(
        APPLY_PERMISSION_AUDIT,
        `${APPLY_PERMISSION_AUDIT}\n${APPLY_PRINCIPAL_PERMISSION_AUDIT}`,
      );
  }

  return next;
}
