import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalUlcLinzM5PermissionProvisioningBundle,
  ULC_LINZ_M5_KNOWN_CAPABILITIES,
  ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
} from "./ulc-linz-m5-permission-provisioning.mjs";
import { ULC_LINZ_M5_MANAGED_MODULE_KEYS } from "./ulc-linz-m5-principal-permission-mapping.mjs";
import { ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY } from "./ulc-linz-m5-role-data-scope.mjs";

test("defines the complete ULC capability catalog for the existing provisioning bundle", () => {
  const bundle = ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE;

  assert.equal(isCanonicalUlcLinzM5PermissionProvisioningBundle(bundle), true);
  assert.equal(ULC_LINZ_M5_KNOWN_CAPABILITIES.length, 28);
  assert.equal(new Set(ULC_LINZ_M5_KNOWN_CAPABILITIES).size, 28);
  for (const moduleKey of ULC_LINZ_M5_MANAGED_MODULE_KEYS) {
    assert.ok(
      ULC_LINZ_M5_KNOWN_CAPABILITIES.includes(
        `ulc-linz:module:${moduleKey}:view`,
      ),
    );
    assert.ok(
      ULC_LINZ_M5_KNOWN_CAPABILITIES.includes(
        `ulc-linz:module:${moduleKey}:edit`,
      ),
    );
  }

  assert.deepEqual(
    bundle.roles.map((role) => role.roleId),
    [
      ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin,
      ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.trainer,
      ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.athlete,
      ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.parent,
    ],
  );
  assert.deepEqual(bundle.roles[0].capabilities, ULC_LINZ_M5_KNOWN_CAPABILITIES);
  assert.deepEqual(bundle.roles[1].capabilities, []);
  assert.deepEqual(bundle.roles[2].capabilities, []);
  assert.deepEqual(bundle.roles[3].capabilities, []);
  assert.deepEqual(bundle.principalRoleAssignments, []);
});

test("keeps admin role-derived and non-admin module rights principal-specific", () => {
  const bundle = ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE;
  const admin = bundle.roles.find(
    (role) => role.roleId === ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin,
  );
  assert.ok(admin);
  assert.deepEqual(admin.capabilities, bundle.knownCapabilities);
  assert.ok(admin.capabilities.includes("ulc-linz:module:user_management:view"));
  assert.ok(admin.capabilities.includes("ulc-linz:module:user_management:edit"));

  for (const sourceRole of ["trainer", "athlete", "parent"]) {
    const roleId = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds[sourceRole];
    const runtimeRole = bundle.roles.find((role) => role.roleId === roleId);
    assert.ok(runtimeRole);
    assert.deepEqual(runtimeRole.capabilities, []);
  }
});

test("rejects provisioning drift that would broaden a non-admin role", () => {
  const candidate = JSON.parse(
    JSON.stringify(ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE),
  );
  candidate.roles[1].capabilities.push("ulc-linz:module:athletes:view");

  assert.equal(isCanonicalUlcLinzM5PermissionProvisioningBundle(candidate), false);
});

test("rejects catalog drift, extra fields and principal assignments", () => {
  const changedCapability = cloneBundle();
  changedCapability.knownCapabilities[0] = "ulc-linz:module:unknown:view";
  assert.equal(
    isCanonicalUlcLinzM5PermissionProvisioningBundle(changedCapability),
    false,
  );

  const extraField = cloneBundle();
  extraField.extra = true;
  assert.equal(isCanonicalUlcLinzM5PermissionProvisioningBundle(extraField), false);

  const assignment = cloneBundle();
  assignment.principalRoleAssignments.push({
    principalId: "invented-principal",
    roleIds: [ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY.runtimeRoleIds.admin],
  });
  assert.equal(isCanonicalUlcLinzM5PermissionProvisioningBundle(assignment), false);
});

function cloneBundle() {
  return JSON.parse(JSON.stringify(ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE));
}
