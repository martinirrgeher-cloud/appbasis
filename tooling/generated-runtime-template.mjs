import { extendIdentityPermissionsWorkerTemplate } from "./generated-identity-permissions-worker-template.mjs";
import { renderGeneratedPrivateWorkerConfig } from "./generated-private-worker-config.mjs";
import { createIdentityRuntimeTemplate as createCoreIdentityRuntimeTemplate } from "./generated-runtime-template-core.mjs";

const POSTGRES_E2E_PATH = "test/app.postgres.e2e.ts";
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
  const generated = extendIdentityPermissionsWorkerTemplate(
    input,
    createCoreIdentityRuntimeTemplate(input),
  );
  const files = generated.files.map((entry) => {
    if (entry.path !== POSTGRES_E2E_PATH) return entry;
    return Object.freeze({
      ...entry,
      content: withPermissionMigrations(entry.content),
    });
  });
  files.push(
    Object.freeze({
      path: "wrangler.production.jsonc",
      content: renderGeneratedPrivateWorkerConfig(input),
    }),
  );

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
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
