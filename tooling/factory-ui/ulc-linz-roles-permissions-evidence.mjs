import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import {
  isCanonicalUlcLinzM5PermissionProvisioningBundle,
  ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
} from "../ulc-linz-m5-permission-provisioning.mjs";
import {
  isCanonicalUlcLinzM5RoleDataScopePolicy,
  ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
} from "../ulc-linz-m5-role-data-scope.mjs";
import { ULC_LINZ_M5_TARGET_POLICY } from "../ulc-linz-m5-target-policy.mjs";

const EMPTY_EVIDENCE = Object.freeze({});
const VERIFIED_EVIDENCE = Object.freeze({ rolesAndPermissions: true });

export const ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY = Object.freeze({
  appId: "ulc-linz",
  roleDataScopePolicyId: "ulc-linz-role-data-scope-v0.1",
  roleDataScopeDigest:
    "dbddcae212992e7a8327feb273292a96608933927091ef8ca4afeb476cea3b66",
  permissionProvisioningDigest:
    "d4ece95910ef06f13d06da09aa5d973f2876a44924bce26c221567d19bb7ee86",
  platformOwners: Object.freeze([
    Object.freeze({
      id: "identity",
      root: "packages/identity",
      schemaVersion: 2,
      migrations: Object.freeze([
        "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
        "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
      ]),
    }),
    Object.freeze({
      id: "permissions",
      root: "packages/permissions",
      schemaVersion: 4,
      migrations: Object.freeze([
        "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
        "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
        "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
        "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
      ]),
    }),
  ]),
  acceptanceTests: Object.freeze([
    Object.freeze({
      path: "apps/ulc-linz/test/authorization.test.ts",
      gitBlobSha: "a8769333a03f6659c3a9d370dbbb2c633ce47454",
    }),
    Object.freeze({
      path: "tooling/ulc-linz-m5-principal-permission-mapping.test.mjs",
      gitBlobSha: "75ab72c876d6e82197421f6f52ebda24dcf768c8",
    }),
    Object.freeze({
      path: "tooling/ulc-linz-m5-permission-provisioning.test.mjs",
      gitBlobSha: "546b3034cf00b6670767a63fbf8b234714dfdd9e",
    }),
    Object.freeze({
      path: "tooling/ulc-linz-m5-principal-access-orchestration.test.mjs",
      gitBlobSha: "3dcb970be3c6c47dd25e331832479aef283505b4",
    }),
    Object.freeze({
      path: "packages/permissions/test/principal-access-administration.postgres.e2e.ts",
      gitBlobSha: "c1a9c7514ad9800458faf1931d61f6ef78b11b90",
    }),
    Object.freeze({
      path: "packages/permissions/test/principal-role-safety.postgres.e2e.ts",
      gitBlobSha: "b87eeba7c71d62376ca2b3722627ff2dd7eb7830",
    }),
  ]),
});

export async function deriveUlcLinzRolesAndPermissionsEvidence(
  repositoryRoot,
  definition,
) {
  if (definition?.appId !== ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.appId) {
    return EMPTY_EVIDENCE;
  }

  try {
    if (!hasRequiredPlatformServices(definition)) return EMPTY_EVIDENCE;
    if (!hasExpectedTargetPolicyBinding()) return EMPTY_EVIDENCE;
    if (!hasApprovedPermissionProvisioning()) return EMPTY_EVIDENCE;

    const expectedDatabaseManifest = createGeneratedDatabaseManifest(definition);
    if (expectedDatabaseManifest === null) return EMPTY_EVIDENCE;

    const root = resolve(repositoryRoot);
    const [runtimePolicy, databaseManifest, acceptanceTestsValid] = await Promise.all([
      readJsonObject(
        join(root, "apps", definition.appId, "worker", "role-data-scope.json"),
      ),
      readJsonObject(
        join(root, "apps", definition.appId, "appbasis.database.json"),
      ),
      verifyAcceptanceTests(root),
    ]);

    if (
      runtimePolicy === undefined ||
      !isCanonicalUlcLinzM5RoleDataScopePolicy(runtimePolicy) ||
      canonicalDigest(runtimePolicy) !==
        ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.roleDataScopeDigest
    ) {
      return EMPTY_EVIDENCE;
    }

    if (
      databaseManifest === undefined ||
      !isDeepStrictEqual(databaseManifest, expectedDatabaseManifest) ||
      !hasPinnedPlatformOwners(databaseManifest) ||
      !acceptanceTestsValid
    ) {
      return EMPTY_EVIDENCE;
    }

    return VERIFIED_EVIDENCE;
  } catch {
    return EMPTY_EVIDENCE;
  }
}

function hasRequiredPlatformServices(definition) {
  return (
    Array.isArray(definition.platformServices) &&
    definition.platformServices.includes("identity") &&
    definition.platformServices.includes("permissions")
  );
}

function hasExpectedTargetPolicyBinding() {
  return (
    ULC_LINZ_M5_TARGET_POLICY.appId ===
      ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.appId &&
    ULC_LINZ_M5_TARGET_POLICY.roleDataScopePolicyId ===
      ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.roleDataScopePolicyId &&
    ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.id ===
      ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.roleDataScopePolicyId
  );
}

function hasApprovedPermissionProvisioning() {
  return (
    isCanonicalUlcLinzM5PermissionProvisioningBundle(
      ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
    ) &&
    canonicalDigest(ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE) ===
      ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.permissionProvisioningDigest
  );
}

function hasPinnedPlatformOwners(databaseManifest) {
  if (!Array.isArray(databaseManifest.owners)) return false;

  return ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.platformOwners.every(
    (expectedOwner) => {
      const actualOwner = databaseManifest.owners.find(
        (candidate) => candidate?.id === expectedOwner.id,
      );
      return isDeepStrictEqual(actualOwner, expectedOwner);
    },
  );
}

async function verifyAcceptanceTests(repositoryRoot) {
  const results = await Promise.all(
    ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.acceptanceTests.map(
      async ({ path, gitBlobSha: expectedSha }) => {
        let raw;
        try {
          raw = await readFile(join(repositoryRoot, path), "utf8");
        } catch {
          return false;
        }
        return gitBlobSha(normalizeLineEndings(raw)) === expectedSha;
      },
    ),
  );
  return results.every(Boolean);
}

async function readJsonObject(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }

  return isPlainObject(value) ? value : undefined;
}

function gitBlobSha(content) {
  const size = Buffer.byteLength(content, "utf8");
  return createHash("sha1")
    .update(`blob ${size}\0`, "utf8")
    .update(content, "utf8")
    .digest("hex");
}

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n");
}

function canonicalDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
