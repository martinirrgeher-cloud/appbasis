import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export const GENERATED_PREVIEW_ROOT_ADMIN_USERNAME = "appbasis.preview.root";
export const GENERATED_PREVIEW_USER_USERNAME = "preview.admin";
const GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME =
  "AppBasis Generated Preview Technical Admin";
const TASKS_MANAGER_ROLE = "tasks:manager";
const TASKS_MANAGE_CAPABILITY = "tasks:manage";

export class GeneratedPreviewAccessBootstrapConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneratedPreviewAccessBootstrapConfigurationError";
  }
}

export class GeneratedPreviewAccessBootstrapStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeneratedPreviewAccessBootstrapStateError";
  }
}

export async function readGeneratedPreviewAccessBootstrapEnvironment(
  env = process.env,
) {
  if (env.APPBASIS_PREVIEW_ACCESS_BOOTSTRAP_APPLY !== "1") {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "Generated preview access bootstrap was not explicitly confirmed.",
    );
  }

  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    requiredTrimmed(env.APPBASIS_GENERATED_APP_ID, "APPBASIS_GENERATED_APP_ID"),
  );
  if (!contract.definition.platformServices.includes("permissions")) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "Generated preview access bootstrap requires the permissions platform service.",
    );
  }

  return Object.freeze({
    contract,
    connectionString: requiredPreviewDatabaseUrl(
      env.APPBASIS_DATABASE_URL,
      contract.target.database,
    ),
    secret: requiredSecret(env.APPBASIS_BETTER_AUTH_SECRET),
    baseURL: requiredGeneratedPreviewOrigin(
      env.APPBASIS_GENERATED_PREVIEW_URL,
      contract.target.workerName,
    ),
    rootAdminPassword: requiredPassword(
      env.APPBASIS_ROOT_ADMIN_PASSWORD,
      "APPBASIS_ROOT_ADMIN_PASSWORD",
    ),
    userTemporaryPassword: requiredPassword(
      env.APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD,
      "APPBASIS_PREVIEW_USER_TEMPORARY_PASSWORD",
    ),
  });
}

export async function bootstrapGeneratedPreviewAccess(
  env = process.env,
  dependencies = {},
) {
  const config = await readGeneratedPreviewAccessBootstrapEnvironment(env);
  const runtime = await loadWorkspaceRuntime(config.contract.definition.appId);
  const createDatabase =
    dependencies.createPostgresDatabase ?? runtime.createPostgresDatabase;
  const createRootAdmin =
    dependencies.createInitialTechnicalAdmin ?? runtime.createInitialTechnicalAdmin;
  const createAuth =
    dependencies.createBetterAuthRuntime ?? runtime.createBetterAuthRuntime;
  const createRuntime =
    dependencies.createIdentityRuntime ?? runtime.createIdentityRuntime;
  const createBackend =
    dependencies.createIdentityBackend ??
    ((options) => new runtime.BetterAuthIdentityBackend(options));
  const provisionPermissions =
    dependencies.provisionPostgresPermissions ?? runtime.provisionPostgresPermissions;

  await ensureTechnicalRootAdmin(config, {
    createDatabase,
    createRootAdmin,
  });

  const connection = createDatabase(config.connectionString);
  let rootSession = null;
  let backend = null;
  try {
    const auth = createAuth({
      database: connection.database,
      baseURL: config.baseURL,
      secret: config.secret,
    });
    backend = createBackend({
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
    const previewProvisioningState =
      await inspectPreviewUserProvisioningState(connection.client);
    if (previewProvisioningState.requiresCredentialProbe) {
      let previewProbe = null;
      try {
        previewProbe = await backend.signInWithUsername({
          username: GENERATED_PREVIEW_USER_USERNAME,
          password: config.userTemporaryPassword,
        });
      } catch {
        throw new GeneratedPreviewAccessBootstrapStateError(
          "Existing generated preview user cannot be authenticated with the protected temporary credential.",
        );
      }
      try {
        if (previewProbe.identityId !== previewProvisioningState.identityId) {
          throw new GeneratedPreviewAccessBootstrapStateError(
            "Existing generated preview user resolved an unexpected identity.",
          );
        }
      } finally {
        await backend.endSession(previewProbe.sessionToken);
      }
    }

    const identity = createRuntime({
      auth,
      sql: connection.client,
      baseURL: config.baseURL,
      administrativeSessionToken: rootSession.sessionToken,
    });
    const state = await identity.service.createInitialUser({
      username: GENERATED_PREVIEW_USER_USERNAME,
      displayName: `${config.contract.definition.displayName} Preview Admin`,
      temporaryPassword: config.userTemporaryPassword,
    });

    const bundle = buildGeneratedPreviewPermissionBundle({
      modules: config.contract.definition.modules,
      identityId: state.identityId,
    });
    await provisionPermissions(connection.client, bundle);

    return Object.freeze({
      appId: config.contract.definition.appId,
      username: state.username,
      mustChangePassword: state.mustChangePassword,
      roleIds: Object.freeze(
        bundle.principalRoleAssignments[0]?.roleIds === undefined
          ? []
          : [...bundle.principalRoleAssignments[0].roleIds],
      ),
    });
  } finally {
    if (backend !== null && rootSession !== null) {
      await backend.endSession(rootSession.sessionToken);
    }
    await connection.client.end();
  }
}

export function buildGeneratedPreviewPermissionBundle({ modules, identityId }) {
  if (!Array.isArray(modules)) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "Generated preview modules must be an array.",
    );
  }
  const knownCapabilities = [];
  const roles = [];
  const assignedRoleIds = [];

  for (const moduleId of modules) {
    if (moduleId === "tasks") {
      const capability = TASKS_MANAGE_CAPABILITY;
      knownCapabilities.push(capability);
      roles.push(
        Object.freeze({
          roleId: TASKS_MANAGER_ROLE,
          capabilities: Object.freeze([capability]),
        }),
      );
      assignedRoleIds.push(TASKS_MANAGER_ROLE);
      continue;
    }
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      `Generated preview access bootstrap does not support module ${moduleId}.`,
    );
  }

  return Object.freeze({
    knownCapabilities: Object.freeze(knownCapabilities),
    roles: Object.freeze(roles),
    principalRoleAssignments: Object.freeze([
      Object.freeze({
        principalId: identityId,
        roleIds: Object.freeze(assignedRoleIds),
      }),
    ]),
  });
}

export async function loadWorkspaceRuntime(appId) {
  const appPackage = new URL(`../apps/${appId}/package.json`, import.meta.url);
  const requireFromApp = createRequire(appPackage);
  const importFromApp = async (specifier) => {
    const resolved = requireFromApp.resolve(specifier);
    return import(pathToFileURL(resolved).href);
  };
  const [database, identity, betterAuth, rootAdmin, provisioning] =
    await Promise.all([
      importFromApp("@appbasis/database/node-runtime"),
      importFromApp("@appbasis/identity"),
      importFromApp("@appbasis/identity/better-auth"),
      importFromApp("@appbasis/identity/root-admin"),
      importFromApp("@appbasis/permissions/provisioning"),
    ]);
  return Object.freeze({
    createPostgresDatabase: database.createPostgresDatabase,
    BetterAuthIdentityBackend: identity.BetterAuthIdentityBackend,
    createIdentityRuntime: identity.createIdentityRuntime,
    createBetterAuthRuntime: betterAuth.createBetterAuthRuntime,
    createInitialTechnicalAdmin: rootAdmin.createInitialTechnicalAdmin,
    provisionPostgresPermissions: provisioning.provisionPostgresPermissions,
  });
}

async function inspectPreviewUserProvisioningState(client) {
  const [users, operations] = await Promise.all([
    client.unsafe(
      `SELECT id, username, role, banned
       FROM "user"
       WHERE username = $1`,
      [GENERATED_PREVIEW_USER_USERNAME],
    ),
    client.unsafe(
      `SELECT identity_id, completed_at
       FROM appbasis_identity_operation
       WHERE operation_key = $1`,
      [`provision:${GENERATED_PREVIEW_USER_USERNAME}`],
    ),
  ]);
  if (users.length > 1 || operations.length > 1) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview user provisioning state is ambiguous.",
    );
  }

  const user = users[0] ?? null;
  let hasIdentityState = false;
  if (user !== null) {
    const stateRows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM appbasis_identity_security_state
         WHERE identity_id = $1
       ) AS present`,
      [user.id],
    );
    hasIdentityState = stateRows[0]?.present === true;
  }

  return classifyPreviewUserProvisioningState({
    user,
    operation: operations[0] ?? null,
    hasIdentityState,
  });
}

export function classifyPreviewUserProvisioningState({
  user,
  operation,
  hasIdentityState,
}) {
  if (user === null) {
    if (hasIdentityState) {
      throw new GeneratedPreviewAccessBootstrapStateError(
        "Generated preview identity state exists without its Better Auth user.",
      );
    }
    if (operation === null) {
      return Object.freeze({
        status: "new",
        identityId: null,
        requiresCredentialProbe: false,
      });
    }
    if (operation.identity_id === null && operation.completed_at === null) {
      return Object.freeze({
        status: "recover",
        identityId: null,
        requiresCredentialProbe: false,
      });
    }
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview provisioning operation conflicts with the missing user.",
    );
  }

  if (
    typeof user.id !== "string" ||
    user.id.length === 0 ||
    user.username !== GENERATED_PREVIEW_USER_USERNAME ||
    user.role !== "user" ||
    user.banned === true
  ) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Existing generated preview user has an invalid Better Auth state.",
    );
  }
  if (operation === null) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Existing generated preview user has no trusted provisioning operation.",
    );
  }

  if (
    operation.identity_id === null &&
    operation.completed_at === null &&
    !hasIdentityState
  ) {
    return Object.freeze({
      status: "recover",
      identityId: user.id,
      requiresCredentialProbe: true,
    });
  }
  if (
    operation.identity_id === user.id &&
    operation.completed_at !== null &&
    hasIdentityState
  ) {
    return Object.freeze({
      status: "ready",
      identityId: user.id,
      requiresCredentialProbe: false,
    });
  }

  throw new GeneratedPreviewAccessBootstrapStateError(
    "Existing generated preview user does not match the trusted provisioning state.",
  );
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
  await dependencies.createRootAdmin(rootAdminOptions(config));
}

export function classifyTechnicalRootAdminState(users) {
  if (!Array.isArray(users)) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview technical administrator state is invalid.",
    );
  }
  const allowedUsernames = new Set([
    GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
    GENERATED_PREVIEW_USER_USERNAME,
  ]);
  if (
    users.some(
      (user) =>
        typeof user?.username !== "string" ||
        !allowedUsernames.has(user.username),
    )
  ) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview access bootstrap found an unexpected Better Auth user.",
    );
  }

  const root = users.find(
    (user) => user.username === GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
  );
  if (root === undefined) {
    if (users.length === 0) return "create";
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview technical administrator is missing from a non-empty user set.",
    );
  }
  if (root.banned === true) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview technical administrator is disabled.",
    );
  }
  if (hasAdminRole(root.role)) return "ready";
  if (users.length === 1 && root.role === "user") return "recover";
  throw new GeneratedPreviewAccessBootstrapStateError(
    "Generated preview technical administrator state is not recoverable.",
  );
}

function rootAdminOptions(config) {
  return {
    connectionString: config.connectionString,
    secret: config.secret,
    baseURL: config.baseURL,
    username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
    displayName: GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME,
    password: config.rootAdminPassword,
  };
}

async function requireTechnicalRootAdmin(client, identityId) {
  const rows = await client.unsafe(
    `SELECT u.username, u.role, u.banned,
            EXISTS (
              SELECT 1
              FROM appbasis_identity_security_state s
              WHERE s.identity_id = u.id
            ) AS has_appbasis_identity
     FROM "user" u
     WHERE u.id = $1
     LIMIT 1`,
    [identityId],
  );
  const row = rows[0];
  if (
    row?.username !== GENERATED_PREVIEW_ROOT_ADMIN_USERNAME ||
    row.banned === true ||
    row.has_appbasis_identity === true ||
    !hasAdminRole(row.role)
  ) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview technical administrator authentication resolved an invalid account.",
    );
  }
}

function hasAdminRole(role) {
  return (
    typeof role === "string" &&
    role
      .split(",")
      .map((value) => value.trim())
      .includes("admin")
  );
}

export function requiredPreviewDatabaseUrl(value, expectedDatabase) {
  const normalized = requiredTrimmed(value, "APPBASIS_DATABASE_URL");
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "APPBASIS_DATABASE_URL must be a PostgreSQL URL.",
    );
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    database.length === 0 ||
    database.includes("/") ||
    database !== expectedDatabase
  ) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "APPBASIS_DATABASE_URL must select the exact generated preview database.",
    );
  }
  return normalized;
}

export function requiredGeneratedPreviewOrigin(value, workerName) {
  const normalized = requiredTrimmed(
    value,
    "APPBASIS_GENERATED_PREVIEW_URL",
  );
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "APPBASIS_GENERATED_PREVIEW_URL must be a canonical HTTPS workers.dev origin.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.length === 0 ||
    !url.hostname.startsWith(`${workerName}.`) ||
    !url.hostname.endsWith(".workers.dev") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "APPBASIS_GENERATED_PREVIEW_URL must be the selected generated preview workers.dev origin.",
    );
  }
  return url.origin;
}

function requiredSecret(value) {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value !== value.trim()
  ) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "APPBASIS_BETTER_AUTH_SECRET must contain at least 32 characters without surrounding whitespace.",
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
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      `${field} must contain ${MINIMUM_PASSWORD_LENGTH}-${MAXIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
  return value;
}

function requiredTrimmed(value, field) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length === 0) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      `${field} is required.`,
    );
  }
  return normalized;
}

async function main() {
  const result = await bootstrapGeneratedPreviewAccess();
  console.log(
    `Generated preview access bootstrap PASS for ${result.appId}; login user ${result.username} is ready.`,
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    if (
      error instanceof GeneratedPreviewAccessBootstrapConfigurationError ||
      error instanceof GeneratedPreviewAccessBootstrapStateError
    ) {
      console.error(error.message);
    } else {
      console.error("Generated preview access bootstrap failed.");
    }
    process.exitCode = 1;
  }
}
