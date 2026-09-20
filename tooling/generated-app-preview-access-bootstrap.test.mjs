import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_ADMIN_ROLE,
  GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
  GENERATED_PREVIEW_USER_USERNAME,
  buildGeneratedPreviewPermissionBundle,
  classifyPreviewUserProvisioningState,
  classifyTechnicalRootAdminState,
  requiredGeneratedPreviewOrigin,
  requiredPreviewDatabaseUrl,
} from "./generated-app-preview-access-bootstrap-contract.mjs";

test("generated preview access bootstrap provisions the tasks manager role for the initial preview user", () => {
  const bundle = buildGeneratedPreviewPermissionBundle({
    modules: ["tasks"],
    identityId: "identity-preview-admin",
    appUseCapability: "app:use",
    appManageCapability: "app:manage",
    taskManageCapability: "tasks:manage",
  });

  assert.deepEqual(bundle.knownCapabilities, ["app:use", "app:manage", "tasks:manage"]);
  assert.deepEqual(bundle.roles, [
    {
      roleId: APP_ADMIN_ROLE,
      capabilities: ["app:use", "app:manage"],
    },
    {
      roleId: "tasks:manager",
      capabilities: ["tasks:manage"],
    },
  ]);
  assert.deepEqual(bundle.principalRoleAssignments, [
    {
      principalId: "identity-preview-admin",
      roleIds: [APP_ADMIN_ROLE, "tasks:manager"],
    },
  ]);
});

test("generated preview access bootstrap fails closed for modules without a permission mapping", () => {
  assert.throws(
    () =>
      buildGeneratedPreviewPermissionBundle({
        modules: ["unknown-module"],
        identityId: "identity-preview-admin",
        appUseCapability: "app:use",
        appManageCapability: "app:manage",
        taskManageCapability: "tasks:manage",
      }),
    /does not support module unknown-module/,
  );
});

test("generated preview database selection must match the exact derived preview database", () => {
  assert.equal(
    requiredPreviewDatabaseUrl(
      "postgresql://user:password@db.example.test/appbasis_unterrichtsverwaltung_preview?sslmode=require",
      "appbasis_unterrichtsverwaltung_preview",
    ),
    "postgresql://user:password@db.example.test/appbasis_unterrichtsverwaltung_preview?sslmode=require",
  );
  assert.throws(
    () =>
      requiredPreviewDatabaseUrl(
        "postgresql://user:password@db.example.test/appbasis_other_preview",
        "appbasis_unterrichtsverwaltung_preview",
      ),
    /exact generated preview database/,
  );
});

test("generated preview origin must be the selected workers.dev worker", () => {
  assert.equal(
    requiredGeneratedPreviewOrigin(
      "https://appbasis-unterrichtsverwaltung.example-account.workers.dev",
      "appbasis-unterrichtsverwaltung",
    ),
    "https://appbasis-unterrichtsverwaltung.example-account.workers.dev",
  );
  assert.throws(
    () =>
      requiredGeneratedPreviewOrigin(
        "https://appbasis-other.example-account.workers.dev",
        "appbasis-unterrichtsverwaltung",
      ),
    /selected generated preview workers.dev origin/,
  );
});

test("technical root bootstrap state is repeatable only for the expected root and preview user set", () => {
  assert.equal(classifyTechnicalRootAdminState([]), "create");
  assert.equal(
    classifyTechnicalRootAdminState([
      {
        username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
        role: "user",
        banned: false,
      },
    ]),
    "recover",
  );
  assert.equal(
    classifyTechnicalRootAdminState([
      {
        username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
        role: "admin",
        banned: false,
      },
      {
        username: GENERATED_PREVIEW_USER_USERNAME,
        role: "user",
        banned: false,
      },
    ]),
    "ready",
  );
  assert.throws(
    () =>
      classifyTechnicalRootAdminState([
        {
          username: GENERATED_PREVIEW_ROOT_ADMIN_USERNAME,
          role: "admin",
          banned: false,
        },
        {
          username: "unexpected.user",
          role: "user",
          banned: false,
        },
      ]),
    /unexpected Better Auth user/,
  );
  assert.throws(
    () =>
      classifyTechnicalRootAdminState([
        {
          username: GENERATED_PREVIEW_USER_USERNAME,
          role: "user",
          banned: false,
        },
      ]),
    /technical administrator is missing/,
  );
});


test("generated preview user state rejects untrusted pre-existing usernames and allows exact recovery", () => {
  assert.deepEqual(
    classifyPreviewUserProvisioningState({
      user: null,
      operation: null,
      hasIdentityState: false,
    }),
    {
      status: "new",
      identityId: null,
      requiresCredentialProbe: false,
    },
  );

  assert.throws(
    () =>
      classifyPreviewUserProvisioningState({
        user: {
          id: "identity-preview-admin",
          username: GENERATED_PREVIEW_USER_USERNAME,
          role: "user",
          banned: false,
        },
        operation: null,
        hasIdentityState: false,
      }),
    /no trusted provisioning operation/,
  );

  assert.deepEqual(
    classifyPreviewUserProvisioningState({
      user: {
        id: "identity-preview-admin",
        username: GENERATED_PREVIEW_USER_USERNAME,
        role: "user",
        banned: false,
      },
      operation: {
        identity_id: null,
        completed_at: null,
      },
      hasIdentityState: false,
    }),
    {
      status: "recover",
      identityId: "identity-preview-admin",
      requiresCredentialProbe: true,
    },
  );

  assert.deepEqual(
    classifyPreviewUserProvisioningState({
      user: {
        id: "identity-preview-admin",
        username: GENERATED_PREVIEW_USER_USERNAME,
        role: "user",
        banned: false,
      },
      operation: {
        identity_id: "identity-preview-admin",
        completed_at: "2026-09-20T00:00:00.000Z",
      },
      hasIdentityState: true,
    }),
    {
      status: "ready",
      identityId: "identity-preview-admin",
      requiresCredentialProbe: false,
    },
  );
});



test("generated preview access keeps a legacy tasks-only principal recoverable while rejecting unrelated roles", async () => {
  const {
    assertExactPreviewPrincipalPermissions,
    assertPreviewPrincipalPermissionsReadyForProvisioning,
  } = await import("./generated-app-preview-access-bootstrap-contract.mjs");
  const expectedRoles = [APP_ADMIN_ROLE, "tasks:manager"];
  const legacy = {
    principalId: "identity-preview-admin",
    roleIds: ["tasks:manager"],
    grants: [],
    revokes: [],
  };
  assert.doesNotThrow(() =>
    assertPreviewPrincipalPermissionsReadyForProvisioning(legacy, expectedRoles),
  );
  assert.throws(
    () => assertExactPreviewPrincipalPermissions(legacy, expectedRoles),
    /unexpected role assignments/,
  );
  assert.throws(
    () =>
      assertPreviewPrincipalPermissionsReadyForProvisioning(
        { ...legacy, roleIds: ["unexpected:role"] },
        expectedRoles,
      ),
    /unexpected role assignments/,
  );
});
