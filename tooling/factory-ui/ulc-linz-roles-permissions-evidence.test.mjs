import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGeneratedDatabaseManifest } from "../generated-database-manifest.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "../ulc-linz-m5-role-data-scope.mjs";
import {
  deriveUlcLinzRolesAndPermissionsEvidence,
  ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY,
} from "./ulc-linz-roles-permissions-evidence.mjs";

const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

async function createFixture({ rolePolicy, databaseManifest } = {}) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-ulc-m5-b-evidence-"));
  await mkdir(join(root, "apps", "ulc-linz", "worker"), { recursive: true });
  await writeFile(
    join(root, "apps", "ulc-linz", "worker", "role-data-scope.json"),
    `${JSON.stringify(
      rolePolicy ?? ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "apps", "ulc-linz", "appbasis.database.json"),
    `${JSON.stringify(
      databaseManifest ?? createGeneratedDatabaseManifest(VALID_ULC_DEFINITION),
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("emits app-specific M5-B evidence only for the approved ULC role and persistence contracts", async () => {
  const root = await createFixture();
  try {
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      { rolesAndPermissions: true },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps M5-B open for another app or without both required platform services", async () => {
  assert.deepEqual(
    await deriveUlcLinzRolesAndPermissionsEvidence("/not-read", {
      ...VALID_ULC_DEFINITION,
      appId: "reference",
    }),
    {},
  );

  const root = await createFixture();
  try {
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(root, {
        ...VALID_ULC_DEFINITION,
        platformServices: ["identity"],
      }),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when the app-owned role and data-scope policy drifts", async () => {
  const rolePolicy = clone(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY);
  rolePolicy.dataScopes.organizationBoundary = "membership-or-global";
  const root = await createFixture({ rolePolicy });

  try {
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when approved role policy provenance or content changes", async () => {
  const rolePolicy = clone(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY);
  rolePolicy.sourceSnapshot.commit = "0000000000000000000000000000000000000000";
  const root = await createFixture({ rolePolicy });

  try {
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when the real database manifest drifts from the generator contract", async () => {
  const databaseManifest = clone(
    createGeneratedDatabaseManifest(VALID_ULC_DEFINITION),
  );
  databaseManifest.owners.find((owner) => owner.id === "permissions").schemaVersion = 3;
  const root = await createFixture({ databaseManifest });

  try {
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when the pinned permissions ownership contract changes even if an alternate manifest is supplied", async () => {
  const databaseManifest = clone(
    createGeneratedDatabaseManifest(VALID_ULC_DEFINITION),
  );
  const permissions = databaseManifest.owners.find(
    (owner) => owner.id === "permissions",
  );
  permissions.migrations = permissions.migrations.slice(0, -1);
  const root = await createFixture({ databaseManifest });

  try {
    assert.equal(
      ULC_LINZ_ROLES_PERMISSIONS_EVIDENCE_POLICY.platformOwners.find(
        (owner) => owner.id === "permissions",
      ).schemaVersion,
      4,
    );
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed on missing or malformed repository evidence", async () => {
  const root = await createFixture();
  try {
    await writeFile(
      join(root, "apps", "ulc-linz", "appbasis.database.json"),
      "{not-json}\n",
      "utf8",
    );
    assert.deepEqual(
      await deriveUlcLinzRolesAndPermissionsEvidence(
        root,
        VALID_ULC_DEFINITION,
      ),
      {},
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
