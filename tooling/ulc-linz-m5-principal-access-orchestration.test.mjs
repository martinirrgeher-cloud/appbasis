import assert from "node:assert/strict";
import test from "node:test";

import { ULC_LINZ_M5_KNOWN_CAPABILITIES } from "./ulc-linz-m5-permission-provisioning.mjs";
import { replaceUlcLinzPrincipalAccess } from "./ulc-linz-m5-principal-access-orchestration.mjs";

const auditContext = Object.freeze({
  actorPrincipalId: "principal-admin",
  reason: "ULC Zugriff ersetzen",
});

test("maps a non-admin ULC member into one atomic AppBasis access replacement", async () => {
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
  assert.deepEqual(call.constraints.requiredRemainingRoleIds, [
    "ulc-linz:admin",
  ]);
  assert.deepEqual(result, { ok: true });
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
