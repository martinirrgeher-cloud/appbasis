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
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import { provisionPostgresPermissions } from "@appbasis/permissions/provisioning";
import { TASK_CAPABILITIES } from "@appbasis/tasks";

import {
  GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME,
  GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
  GENERATED_PREVIEW_USER_USERNAME,
  GeneratedPreviewAccessBootstrapConfigurationError,
  GeneratedPreviewAccessBootstrapStateError,
  TASKS_MANAGER_ROLE,
  assertExactPreviewPrincipalPermissions,
  assertPreviewPrincipalPermissionsReadyForProvisioning,
  buildGeneratedPreviewPermissionBundle,
  classifyPreviewUserProvisioningState,
  classifyTechnicalRootAdminState,
  readGeneratedPreviewAccessBootstrapEnvironment,
} from "../../../tooling/generated-app-preview-access-bootstrap-contract.mjs";

export async function bootstrapGeneratedPreviewAccess(
  env = process.env,
  dependencies = {},
) {
  const config = await readGeneratedPreviewAccessBootstrapEnvironment(env);
  const createDatabase =
    dependencies.createPostgresDatabase ?? createPostgresDatabase;
  const createRootAdmin =
    dependencies.createInitialTechnicalAdmin ?? createInitialTechnicalAdmin;
  const createAuth =
    dependencies.createBetterAuthRuntime ?? createBetterAuthRuntime;
  const createRuntime =
    dependencies.createIdentityRuntime ?? createIdentityRuntime;
  const createBackend =
    dependencies.createIdentityBackend ??
    ((options) => new BetterAuthIdentityBackend(options));
  const provisionPermissions =
    dependencies.provisionPostgresPermissions ?? provisionPostgresPermissions;
  const createPermissionStore =
    dependencies.createPermissionStore ??
    ((client) => new PostgresPermissionStore(client));

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

    if (
      state.accountStatus !== "active" ||
      (previewProvisioningState.identityId !== null &&
        state.identityId !== previewProvisioningState.identityId)
    ) {
      throw new GeneratedPreviewAccessBootstrapStateError(
        "Generated preview user resolved an invalid active identity state.",
      );
    }

    const taskManageCapability = capabilityId(TASK_CAPABILITIES.manage);
    const previewPrincipalId = principalId(state.identityId);
    const bundle = buildGeneratedPreviewPermissionBundle({
      modules: config.contract.definition.modules,
      identityId: previewPrincipalId,
      taskManageCapability,
    });
    const permissionStore = createPermissionStore(connection.client);
    const before = await permissionStore.findPrincipal(previewPrincipalId);
    assertPreviewPrincipalPermissionsReadyForProvisioning(
      before,
      TASKS_MANAGER_ROLE,
    );

    await provisionPermissions(connection.client, bundle);

    const after = await permissionStore.findPrincipal(previewPrincipalId);
    assertExactPreviewPrincipalPermissions(after, TASKS_MANAGER_ROLE);
    const taskAccess = await permissionStore.evaluatePermission({
      principalId: previewPrincipalId,
      capability: taskManageCapability,
    });
    if (taskAccess !== true) {
      throw new GeneratedPreviewAccessBootstrapStateError(
        "Generated preview principal cannot manage the generated tasks module after provisioning.",
      );
    }

    return Object.freeze({
      appId: config.contract.definition.appId,
      username: state.username,
      mustChangePassword: state.mustChangePassword,
      roleIds: Object.freeze([...after.roleIds]),
    });
  } finally {
    if (backend !== null && rootSession !== null) {
      await backend.endSession(rootSession.sessionToken);
    }
    await connection.client.end();
  }
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

async function main() {
  const result = await bootstrapGeneratedPreviewAccess();
  console.log(
    `Generated preview access bootstrap PASS for ${result.appId}; login user ${result.username} is ready.`,
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
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
