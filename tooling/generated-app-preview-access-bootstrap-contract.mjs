import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

const defaultRepositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;

export const GENERATED_PREVIEW_ROOT_ADMIN_USERNAME = "appbasis.preview.root";
export const GENERATED_PREVIEW_USER_USERNAME = "preview.admin";
export const GENERATED_PREVIEW_ROOT_ADMIN_DISPLAY_NAME =
  "AppBasis Generated Preview Technical Admin";
export const APP_MEMBER_ROLE = "app:member";
export const TASKS_MANAGER_ROLE = "tasks:manager";

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
  repositoryRoot = defaultRepositoryRoot,
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

export function buildGeneratedPreviewPermissionBundle({
  modules,
  identityId,
  appUseCapability,
  taskManageCapability,
}) {
  if (!Array.isArray(modules)) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "Generated preview modules must be an array.",
    );
  }
  if (
    typeof identityId !== "string" ||
    identityId.length === 0 ||
    typeof appUseCapability !== "string" ||
    appUseCapability.length === 0 ||
    typeof taskManageCapability !== "string" ||
    taskManageCapability.length === 0
  ) {
    throw new GeneratedPreviewAccessBootstrapConfigurationError(
      "Generated preview permission inputs are invalid.",
    );
  }

  const knownCapabilities = [appUseCapability];
  const roles = [
    Object.freeze({
      roleId: APP_MEMBER_ROLE,
      capabilities: Object.freeze([appUseCapability]),
    }),
  ];
  const assignedRoleIds = [APP_MEMBER_ROLE];

  for (const moduleId of modules) {
    if (moduleId === "tasks") {
      knownCapabilities.push(taskManageCapability);
      roles.push(
        Object.freeze({
          roleId: TASKS_MANAGER_ROLE,
          capabilities: Object.freeze([taskManageCapability]),
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

export function assertPreviewPrincipalPermissionsReadyForProvisioning(
  principal,
  expectedRoleIds,
) {
  if (principal === null) return;

  assertCanonicalPrincipalPermissionShape(principal, expectedRoleIds, true);
}

export function assertExactPreviewPrincipalPermissions(
  principal,
  expectedRoleIds,
) {
  if (principal === null) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview principal is missing after permission provisioning.",
    );
  }

  assertCanonicalPrincipalPermissionShape(principal, expectedRoleIds, false);
}

function assertCanonicalPrincipalPermissionShape(
  principal,
  expectedRoleIds,
  allowSubset,
) {
  if (
    typeof principal?.principalId !== "string" ||
    !Array.isArray(principal.roleIds) ||
    !Array.isArray(principal.grants) ||
    !Array.isArray(principal.revokes) ||
    !Array.isArray(expectedRoleIds) ||
    expectedRoleIds.some((roleId) => typeof roleId !== "string" || roleId.length === 0)
  ) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview principal permission state is invalid.",
    );
  }

  if (principal.grants.length !== 0 || principal.revokes.length !== 0) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview principal has unexpected direct permission overrides.",
    );
  }

  const roleIds = [...principal.roleIds];
  const expected = new Set(expectedRoleIds);
  const uniqueRoles = new Set(roleIds);
  const matchesExpectedRoles =
    uniqueRoles.size === roleIds.length &&
    roleIds.every((roleId) => expected.has(roleId)) &&
    (allowSubset || roleIds.length === expected.size);
  if (!matchesExpectedRoles) {
    throw new GeneratedPreviewAccessBootstrapStateError(
      "Generated preview principal has unexpected role assignments.",
    );
  }
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

function hasAdminRole(role) {
  return (
    typeof role === "string" &&
    role
      .split(",")
      .map((value) => value.trim())
      .includes("admin")
  );
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
