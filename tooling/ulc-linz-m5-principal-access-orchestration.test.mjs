import assert from "node:assert/strict";
import test from "node:test";

import { ULC_LINZ_M5_KNOWN_CAPABILITIES } from "./ulc-linz-m5-permission-provisioning.mjs";
import { replaceUlcLinzPrincipalAccess } from "./ulc-linz-m5-principal-access-orchestration.mjs";

const auditContext = Object.freeze({
  actorPrincipalId: "principal-admin",
  reason: "ULC Zugriff ersetzen",
});

test("maps a non-admin ULC member without inventing an admin-demotion guard", async () => {
  const calls = [];
  const result = await replaceUlcLinzPrincipalAccess({
    administration: fakeAdministration(calls),
    principalId: "principal-trainer",
    sourceRole: "trainer",
    permissions: [
      { moduleKey: "kindertraining", canView: true, canEdit: true },
    ],
    auditContext,
    constraints: {
      expectedRoleIds: ["ulc-linz:athlete"],
      expectedGrants: [],
      expectedRevokes: ULC_LINZ_M5_KNOWN_CAPABILITIES,
    },
  });

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.deepEqual(call.roleIds, ["ulc-linz:trainer"]);
  assert.deepEqual(call.overrides.grants, [
    "ulc-linz:module:kindertraining:edit",
    "ulc-linz:module:kindertraining:view",
  ]);
  assert.equal(call.overrides.revokes.length, 26);
  assert.equal(
    call.overrides.revokes.includes("ulc-linz:module:user_management:view"),
    true,
  );
  assert.deepEqual(call.auditContext, auditContext);
  assert.deepEqual(call.constraints.expectedRoleIds, ["ulc-linz:athlete"]);
  assert.deepEqual(call.constraints.expectedGrants, []);
  assert.deepEqual(
    call.constraints.expectedRevokes,
    ULC_LINZ_M5_KNOWN_CAPABILITIES,
  );
  assert.deepEqual(
    call.constraints.requiredRemainingCapabilities,
    ULC_LINZ_M5_KNOWN_CAPABILITIES,
  );
  assert.deepEqual(call.constraints.requiredRemainingRoleIds, []);
  assert.equal(
    Object.hasOwn(call.constraints, "resolveRequiredRoleHolderPrincipalScope"),
    false,
  );
  assert.deepEqual(result, { ok: true });
});

test("carries the active same-organization principal scope into an actual admin demotion", async () => {
  const calls = [];
  const resolveActiveOrganizationPrincipalScope = async () => [
    "principal-admin-target",
    "principal-admin-remaining",
  ];

  await replaceUlcLinzPrincipalAccess({
    administration: fakeAdministration(calls),
    principalId: "principal-admin-target",
    sourceRole: "trainer",
    permissions: [],
    auditContext,
    constraints: {
      expectedRoleIds: ["ulc-linz:admin"],
      expectedGrants: [],
      expectedRevokes: [],
      resolveActiveOrganizationPrincipalScope,
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].constraints.requiredRemainingRoleIds, [
    "ulc-linz:admin",
  ]);
  assert.equal(
    calls[0].constraints.resolveRequiredRoleHolderPrincipalScope,
    resolveActiveOrganizationPrincipalScope,
  );
});

test("fails closed when an actual admin demotion lacks active same-organization scope", async () => {
  await assert.rejects(
    () =>
      replaceUlcLinzPrincipalAccess({
        administration: fakeAdministration([]),
        principalId: "principal-admin-target",
        sourceRole: "trainer",
        permissions: [],
        auditContext,
        constraints: {
          expectedRoleIds: ["ulc-linz:admin"],
          expectedGrants: [],
          expectedRevokes: [],
        },
      }),
    /requires a transactional resolver for active principals in the target organization/,
  );
});

test("fails closed for a non-admin target when the previous role snapshot is missing", async () => {
  await assert.rejects(
    () =>
      replaceUlcLinzPrincipalAccess({
        administration: fakeAdministration([]),
        principalId: "principal-trainer",
        sourceRole: "trainer",
        permissions: [],
        auditContext,
      }),
    /requires expectedRoleIds so an admin demotion cannot bypass/,
  );
});

test("promotes an admin with empty direct overrides without requiring another holder", async () => {
  const calls = [];
  await replaceUlcLinzPrincipalAccess({
    administration: fakeAdministration(calls),
    principalId: "principal-admin-target",
    sourceRole: "admin",
    permissions: [],
    auditContext,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].roleIds, ["ulc-linz:admin"]);
  assert.deepEqual(calls[0].overrides, { grants: [], revokes: [] });
  assert.deepEqual(calls[0].constraints.requiredRemainingCapabilities, []);
  assert.deepEqual(calls[0].constraints.requiredRemainingRoleIds, []);
  assert.equal(
    Object.hasOwn(calls[0].constraints, "resolveRequiredRoleHolderPrincipalScope"),
    false,
  );
});

test("fails closed for unsupported roles and missing atomic administration", async () => {
  await assert.rejects(
    () =>
      replaceUlcLinzPrincipalAccess({
        administration: fakeAdministration([]),
        principalId: "principal-unknown",
        sourceRole: "owner",
        permissions: [],
        auditContext,
      }),
    /Unsupported ULC Linz source role owner/,
  );

  await assert.rejects(
    () =>
      replaceUlcLinzPrincipalAccess({
        administration: {},
        principalId: "principal-trainer",
        sourceRole: "trainer",
        permissions: [],
        auditContext,
      }),
    /requires the AppBasis principal access administration contract/,
  );
});

function fakeAdministration(calls) {
  return {
    async replacePrincipalAccess(
      principalId,
      roleIds,
      overrides,
      suppliedAuditContext,
      constraints,
    ) {
      calls.push({
        principalId,
        roleIds,
        overrides,
        auditContext: suppliedAuditContext,
        constraints,
      });
      return { ok: true };
    },
  };
}
