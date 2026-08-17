import assert from "node:assert/strict";
import test from "node:test";

import {
  mapUlcLinzManagedPermissionsToPrincipalOverrides,
  replaceUlcLinzPrincipalPermissions,
  ULC_LINZ_M5_MANAGED_MODULE_KEYS,
} from "./ulc-linz-m5-principal-permission-mapping.mjs";

const capability = (moduleKey, action) =>
  `ulc-linz:module:${moduleKey}:${action}`;

test("maps sparse ULC replace-all rights to a complete grant/revoke state", () => {
  const result = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole: "trainer",
    permissions: [
      { moduleKey: "athletes", canView: true, canEdit: true },
      {
        moduleKey: "training_overview",
        canView: true,
        canEdit: false,
      },
    ],
  });

  assert.deepEqual(result.grants, [
    capability("athletes", "edit"),
    capability("athletes", "view"),
    capability("training_overview", "view"),
  ]);
  assert.equal(result.revokes.length, ULC_LINZ_M5_MANAGED_MODULE_KEYS.length * 2 - 3);
  assert.ok(result.revokes.includes(capability("training_overview", "edit")));
  assert.ok(result.revokes.includes(capability("kindertraining", "view")));
  assert.ok(result.revokes.includes(capability("kindertraining", "edit")));
  assert.ok(result.revokes.includes(capability("user_management", "view")));
  assert.ok(result.revokes.includes(capability("user_management", "edit")));
  assert.equal(new Set([...result.grants, ...result.revokes]).size, 28);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.grants), true);
  assert.equal(Object.isFrozen(result.revokes), true);
});

test("treats canEdit as canView and replaces explicit false values with revokes", () => {
  const result = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole: "athlete",
    permissions: [
      {
        moduleKey: "training_documentation",
        canView: false,
        canEdit: true,
      },
      { moduleKey: "countdown", canView: false, canEdit: false },
    ],
  });

  assert.ok(result.grants.includes(capability("training_documentation", "view")));
  assert.ok(result.grants.includes(capability("training_documentation", "edit")));
  assert.ok(result.revokes.includes(capability("countdown", "view")));
  assert.ok(result.revokes.includes(capability("countdown", "edit")));
});

test("clears direct overrides for admin because admin permissions are role-derived", () => {
  const result = mapUlcLinzManagedPermissionsToPrincipalOverrides({
    sourceRole: "admin",
    permissions: [
      { moduleKey: "athletes", canView: false, canEdit: false },
      { moduleKey: "user_management", canView: true, canEdit: true },
    ],
  });

  assert.deepEqual(result, { grants: [], revokes: [] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.grants), true);
  assert.equal(Object.isFrozen(result.revokes), true);
});

test("rejects user-management grants, unknown modules and duplicates for non-admin roles", () => {
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "parent",
        permissions: [
          { moduleKey: "user_management", canView: true, canEdit: false },
        ],
      }),
    /user_management is admin-only/,
  );
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "trainer",
        permissions: [
          { moduleKey: "future_module", canView: true, canEdit: false },
        ],
      }),
    /Unknown ULC Linz module/,
  );
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "trainer",
        permissions: [
          { moduleKey: "athletes", canView: true, canEdit: false },
          { moduleKey: "athletes", canView: false, canEdit: true },
        ],
      }),
    /Duplicate ULC Linz module permission/,
  );
});

test("rejects malformed permission shapes instead of coercing them for non-admin roles", () => {
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "trainer",
        permissions: [
          { moduleKey: "athletes", canView: 1, canEdit: false },
        ],
      }),
    /must use boolean flags/,
  );
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "trainer",
        permissions: [
          {
            moduleKey: "athletes",
            canView: true,
            canEdit: false,
            extra: true,
          },
        ],
      }),
    /contain exactly moduleKey, canView and canEdit/,
  );
  assert.throws(
    () =>
      mapUlcLinzManagedPermissionsToPrincipalOverrides({
        sourceRole: "admin",
        permissions: null,
      }),
    /must be an array/,
  );
});

test("uses the AppBasis principal administration write contract as the consumer boundary", async () => {
  const calls = [];
  const administration = {
    async replacePrincipalPermissions(...args) {
      calls.push(args);
      return args[1];
    },
  };
  const auditContext = {
    actorPrincipalId: "admin-principal",
    reason: "ULC Rechte ersetzen",
  };
  const constraints = {
    expectedGrants: [],
    expectedRevokes: [],
  };

  const result = await replaceUlcLinzPrincipalPermissions({
    administration,
    principalId: "member-principal",
    sourceRole: "parent",
    permissions: [
      { moduleKey: "kindertraining", canView: true, canEdit: false },
    ],
    auditContext,
    constraints,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "member-principal");
  assert.equal(calls[0][2], auditContext);
  assert.equal(calls[0][3], constraints);
  assert.deepEqual(result, calls[0][1]);
  assert.ok(result.grants.includes(capability("kindertraining", "view")));
  assert.ok(result.revokes.includes(capability("kindertraining", "edit")));
});

test("admin promotion clears stale direct grants and revokes through the same write contract", async () => {
  const calls = [];
  const administration = {
    async replacePrincipalPermissions(...args) {
      calls.push(args);
      return args[1];
    },
  };
  const staleGrant = capability("athletes", "view");
  const staleRevoke = capability("user_management", "view");
  const constraints = {
    expectedGrants: [staleGrant],
    expectedRevokes: [staleRevoke],
  };

  const result = await replaceUlcLinzPrincipalPermissions({
    administration,
    principalId: "promoted-principal",
    sourceRole: "admin",
    permissions: [
      { moduleKey: "athletes", canView: false, canEdit: false },
    ],
    auditContext: {
      actorPrincipalId: "admin-principal",
      reason: "ULC Admin-Promotion",
    },
    constraints,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { grants: [], revokes: [] });
  assert.equal(calls[0][3], constraints);
  assert.deepEqual(result, { grants: [], revokes: [] });
});
