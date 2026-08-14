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
const APPLY_PERMISSION_FOUNDATION = "  await applyMigration(permissionMigrationUrl);";
const APPLY_PERMISSION_LIFECYCLE =
  "  await applyMigration(permissionRoleLifecycleMigrationUrl);";

export function createIdentityRuntimeTemplate(input) {
  const generated = createCoreIdentityRuntimeTemplate(input);
  const files = generated.files.map((entry) => {
    if (entry.path !== POSTGRES_E2E_PATH) return entry;
    return Object.freeze({
      ...entry,
      content: withPermissionRoleLifecycleMigration(entry.content),
    });
  });

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function withPermissionRoleLifecycleMigration(content) {
  if (content.includes("0001_appbasis_permission_role_lifecycle.sql")) {
    return content;
  }
  if (!content.includes(PERMISSION_FOUNDATION_BLOCK)) {
    throw new Error(
      "Generated PostgreSQL E2E template is missing the permission foundation migration block.",
    );
  }
  if (!content.includes(APPLY_PERMISSION_FOUNDATION)) {
    throw new Error(
      "Generated PostgreSQL E2E template is missing the permission foundation migration application.",
    );
  }

  return content
    .replace(
      PERMISSION_FOUNDATION_BLOCK,
      `${PERMISSION_FOUNDATION_BLOCK}\n${PERMISSION_LIFECYCLE_BLOCK}`,
    )
    .replace(
      APPLY_PERMISSION_FOUNDATION,
      `${APPLY_PERMISSION_FOUNDATION}\n${APPLY_PERMISSION_LIFECYCLE}`,
    );
}
