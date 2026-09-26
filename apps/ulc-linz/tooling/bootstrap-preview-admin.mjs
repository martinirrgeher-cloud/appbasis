import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import {
  BetterAuthIdentityBackend,
  createIdentityRuntime,
} from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { createInitialTechnicalAdmin } from "@appbasis/identity/root-admin";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  capabilityId,
  principalId,
} from "@appbasis/permissions";

import {
  GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME,
  GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
  GENERATED_PREVIEW_USER_USERNAME,
  classifyTechnicalRootAdminState,
} from "../../../tooling/generated-app-preview-access-bootstrap-contract.mjs";
import { mapUlcLinzManagedPermissionsToPrincipalOverrides } from "../../../tooling/ulc-linz-m5-principal-permission-mapping.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "../../../tooling/ulc-linz-m5-role-data-scope.mjs";

const EXPECTED_DATABASE = "appbasis_ulc_linz_preview";
const EXPECTED_APPLICATION_ROLE = "appbasis_ulc_linz_preview_application";
const EXPECTED_WORKER = "appbasis-ulc-linz";
const PREVIEW_ORGANIZATION_ID = "ulc-linz-preview";
const PREVIEW_SUBJECT_ID = "ulc-linz-preview-admin";
const PREVIEW_DISPLAY_NAME = "ULC Linz Preview Admin";
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export class UlcLinzD4PreviewAccessBootstrapError extends Error {
  constructor(message) {
    super(message);
    this.name = "UlcLinzD4PreviewAccessBootstrapError";
  }
}

export function readUlcLinzD4PreviewAccessEnvironment(env = process.env) {
  if (env.ULC_LINZ_D4_PREVIEW_ACCESS_APPLY !== "1") {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "ULC D4 preview access bootstrap was not explicitly authorized.",
    );
  }

  const connectionString = requiredPreviewDatabaseUrl(env.APPBASIS_DATABASE_URL);
  const secret = requiredSecret(env.APPBASIS_BETTER_AUTH_SECRET);
  const baseURL = requiredPreviewOrigin(env.APPBASIS_GENERATED_PREVIEW_URL);
  const rootAdminPassword = requiredPassword(
    env.APPBASIS_ROOT_ADMIN_PASSWORD,
    "APPBASIS_ROOT_ADMIN_PASSWORD",
  );
  const userTemporaryPassword = requiredPassword(
    env.APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD,
    "APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD",
  );
  if (rootAdminPassword === userTemporaryPassword) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "Technical root and preview user passwords must be distinct.",
    );
  }

  return Object.freeze({
    connectionString,
    secret,
    baseURL,
    rootAdminPassword,
    userTemporaryPassword,
  });
}

export async function bootstrapUlcLinzD4PreviewAccess(
  env = process.env,
  dependencies = {},
) {
  const config = readUlcLinzD4PreviewAccessEnvironment(env);
  const createDatabase =
    dependencies.createPostgresDatabase ?? createPostgresDatabase;
  const createRootAdmin =
    dependencies.createInitialTechnicalAdmin ?? createInitialTechnicalAdmin;

  await ensureTechnicalRootAdmin(config, {
    createDatabase,
    createRootAdmin,
  });

  const connection = createDatabase(config.connectionString);
  let backend = null;
  let rootSession = null;
  try {
    const auth = (dependencies.createBetterAuthRuntime ?? createBetterAuthRuntime)({
      database: connection.database,
      baseURL: config.baseURL,
      secret: config.secret,
    });
    backend = dependencies.createIdentityBackend
      ? dependencies.createIdentityBackend({
          auth,
          sql: connection.client,
          baseURL: config.baseURL,
        })
      : new BetterAuthIdentityBackend({
          auth,
          sql: connection.client,
          baseURL: config.baseURL,
        });

    rootSession = await backend.signInWithUsername({
      username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
      password: config.rootAdminPassword,
    });
    await requireTechnicalRootAdmin(
      connection.client,
      rootSession.identityId,
    );

    const identity = (dependencies.createIdentityRuntime ?? createIdentityRuntime)({
      auth,
      sql: connection.client,
      baseURL: config.baseURL,
      administrativeSessionToken: rootSession.sessionToken,
    });
    const created = await identity.service.createInitialUser({
      username: GENERATED_PREVIEW_USER_USERNAME,
      displayName: PREVIEW_DISPLAY_NAME,
      temporaryPassword: config.userTemporaryPassword,
    });
    if (
      created.username !== GENERATED_PREVIEW_USER_USERNAME ||
      created.accountStatus !== "active"
    ) {
      throw new UlcLinzD4PreviewAccessBootstrapError(
        "ULC D4 preview administrator identity state is invalid.",
      );
    }

    await upsertPreviewAdminMembership(
      connection.client,
      created.identityId,
    );

    const previewPrincipalId = principalId(created.identityId);
    await ensurePermissionPrincipal(connection.client, previewPrincipalId);

    const store = new PostgresPermissionStore(connection.client);
    const existing = await store.findPrincipal(previewPrincipalId);
    if (existing === null) {
      throw new UlcLinzD4PreviewAccessBootstrapError(
        "ULC D4 preview permission principal is unavailable.",
      );
    }

    const adminRoleId =
      ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin;
    const overrides = mapUlcLinzManagedPermissionsToPrincipalOverrides({
      sourceRole: "admin",
      permissions: [],
    });
    const administration = new PostgresPrincipalAccessAdministration(
      connection.client,
    );
    await administration.replacePrincipalAccess(
      previewPrincipalId,
      [adminRoleId],
      overrides,
      {
        actorPrincipalId: principalId(rootSession.identityId),
        reason: "ULC D4 preview administrator bootstrap",
      },
      {
        expectedRoleIds: existing.roleIds,
        expectedGrants: existing.grants,
        expectedRevokes: existing.revokes,
      },
    );

    await requireExactPreviewAdminState(
      connection.client,
      store,
      created.identityId,
      previewPrincipalId,
      adminRoleId,
    );

    const countdownAllowed = await store.evaluatePermission({
      principalId: previewPrincipalId,
      capability: capabilityId("ulc-linz:module:countdown:view"),
    });
    if (countdownAllowed !== true) {
      throw new UlcLinzD4PreviewAccessBootstrapError(
        "ULC D4 preview administrator cannot access the countdown.",
      );
    }

    return Object.freeze({
      username: GENERATED_PREVIEW_USER_USERNAME,
      mustChangePassword: created.mustChangePassword,
      roleId: adminRoleId,
      organizationId: PREVIEW_ORGANIZATION_ID,
    });
  } finally {
    if (backend !== null && rootSession !== null) {
      await backend.endSession(rootSession.sessionToken).catch(() => {});
    }
    await connection.client.end();
  }
}

async function ensureTechnicalRootAdmin(config, dependencies) {
  const connection = dependencies.createDatabase(config.connectionString);
  let users;
  try {
    users = await connection.client.unsafe(
      `SELECT username, role, banned
       FROM "user"
       ORDER BY username`,
    );
  } finally {
    await connection.client.end();
  }

  const action = classifyTechnicalRootAdminState(users);
  if (action === "ready") return;
  await dependencies.createRootAdmin({
    connectionString: config.connectionString,
    secret: config.secret,
    baseURL: config.baseURL,
    username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
    displayName: GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME,
    password: config.rootAdminPassword,
  });
}

async function requireTechnicalRootAdmin(client, identityId) {
  const rows = await client.unsafe(
    `SELECT username, role, banned,
            EXISTS (
              SELECT 1
              FROM appbasis_identity_security_state
              WHERE identity_id = "user".id
            ) AS has_appbasis_identity
     FROM "user"
     WHERE id = $1
     LIMIT 1`,
    [identityId],
  );
  const row = rows[0];
  if (
    row?.username !== GENERATED_PREVIEW_ROOT_ADMIN_USERNAME ||
    row?.role !== "admin" ||
    row?.banned === true ||
    row?.has_appbasis_identity === true
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "ULC D4 preview technical root administrator evidence is invalid.",
    );
  }
}

async function upsertPreviewAdminMembership(client, identityId) {
  await client.begin(async (tx) => {
    await tx.unsafe(
      `INSERT INTO ulc_linz_membership (
         identity_id,
         organization_id,
         subject_id,
         source_role,
         active
       ) VALUES ($1, $2, $3, 'admin', true)
       ON CONFLICT (identity_id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         subject_id = EXCLUDED.subject_id,
         source_role = 'admin',
         active = true,
         ended_at = NULL,
         retention_exception_reason = NULL,
         retention_exception_actor = NULL,
         retention_exception_created_at = NULL,
         retention_review_at = NULL,
         updated_at = now()`,
      [identityId, PREVIEW_ORGANIZATION_ID, PREVIEW_SUBJECT_ID],
    );
  });
}

async function ensurePermissionPrincipal(client, requestedPrincipalId) {
  await client.begin(async (tx) => {
    await tx.unsafe(
      `INSERT INTO appbasis_permission_principal (principal_id)
       VALUES ($1)
       ON CONFLICT (principal_id) DO NOTHING`,
      [requestedPrincipalId],
    );
  });
}

async function requireExactPreviewAdminState(
  client,
  store,
  identityId,
  requestedPrincipalId,
  adminRoleId,
) {
  const rows = await client.unsafe(
    `SELECT organization_id, subject_id, source_role, active
     FROM ulc_linz_membership
     WHERE identity_id = $1`,
    [identityId],
  );
  const membership = rows[0];
  if (
    rows.length !== 1 ||
    membership?.organization_id !== PREVIEW_ORGANIZATION_ID ||
    membership?.subject_id !== PREVIEW_SUBJECT_ID ||
    membership?.source_role !== "admin" ||
    membership?.active !== true
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "ULC D4 preview administrator membership is not exact.",
    );
  }

  const principal = await store.findPrincipal(requestedPrincipalId);
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== adminRoleId ||
    principal.grants.length !== 0 ||
    principal.revokes.length !== 0
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "ULC D4 preview administrator permission state is not exact.",
    );
  }
}

function requiredPreviewDatabaseUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0 || normalized !== value) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_DATABASE_URL must be canonical.",
    );
  }
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.hostname.includes("-pooler") ||
    decodeURIComponent(url.username) !== EXPECTED_APPLICATION_ROLE ||
    decodeURIComponent(url.pathname.slice(1)) !== EXPECTED_DATABASE ||
    url.searchParams.get("sslmode") !== "require"
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_DATABASE_URL must select the exact direct ULC D4 preview application database role.",
    );
  }
  return normalized;
}

function requiredPreviewOrigin(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_GENERATED_PREVIEW_URL must be the ULC D4 workers.dev origin.",
    );
  }
  if (
    normalized !== value ||
    url.protocol !== "https:" ||
    !url.hostname.startsWith(`${EXPECTED_WORKER}.`) ||
    !url.hostname.endsWith(".workers.dev") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_GENERATED_PREVIEW_URL must be the exact ULC D4 workers.dev origin.",
    );
  }
  return url.origin;
}

function requiredSecret(value) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.trim() !== value
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      "APPBASIS_BETTER_AUTH_SECRET is invalid.",
    );
  }
  return value;
}

function requiredPassword(value, field) {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0 ||
    /[\r\n]/u.test(value)
  ) {
    throw new UlcLinzD4PreviewAccessBootstrapError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters without line breaks.`,
    );
  }
  return value;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  try {
    const result = await bootstrapUlcLinzD4PreviewAccess();
    if (
      result.username !== GENERATED_PREVIEW_USER_USERNAME ||
      result.roleId !== ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin
    ) {
      throw new Error("Unexpected ULC D4 preview access bootstrap result.");
    }
    console.log(
      `ULC D4 preview access bootstrap PASS; login user ${result.username} is ready.`,
    );
  } catch (error) {
    console.error(
      error instanceof UlcLinzD4PreviewAccessBootstrapError
        ? error.message
        : "ULC D4 preview access bootstrap failed.",
    );
    process.exitCode = 1;
  }
}
