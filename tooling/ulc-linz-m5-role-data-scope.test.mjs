import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalUlcLinzM5RoleDataScopePolicy,
  ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
} from "./ulc-linz-m5-role-data-scope.mjs";

test("pins the current ULC Linz source roles and distinct runtime roles", () => {
  const policy = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(policy), true);
  assert.equal(policy.id, "ulc-linz-role-data-scope-v0.1");
  assert.deepEqual(policy.sourceSnapshot, {
    repository: "martinirrgeher-cloud/ulc-linz",
    commit: "682ed5d37e7206f7fa521e5dab40f840cc303f0b",
  });
  assert.deepEqual(policy.sourceRoles, ["admin", "trainer", "athlete", "parent"]);
  assert.deepEqual(policy.runtimeRoles.admin, {
    sourceRole: "admin",
    roleId: "ulc-linz:admin",
    mode: "own-organization-admin",
  });
  assert.deepEqual(policy.runtimeRoles.kindertrainer, {
    sourceRole: "trainer",
    roleId: "ulc-linz:kindertrainer",
    view: ["kindertraining", "u12", "u14", "countdown"],
    edit: ["kindertraining", "u12", "u14", "countdown"],
  });
  assert.deepEqual(policy.runtimeRoles.leistungstrainer, {
    sourceRole: "trainer",
    roleId: "ulc-linz:leistungstrainer",
    view: [
      "performance_registration",
      "training_planning",
      "training_overview",
      "training_documentation",
      "exercise_catalog",
      "training_blocks",
      "athletes",
      "countdown",
    ],
    edit: [
      "performance_registration",
      "training_planning",
      "training_documentation",
      "exercise_catalog",
      "training_blocks",
      "athletes",
      "countdown",
    ],
  });
  assert.deepEqual(policy.runtimeRoles.athlete, {
    sourceRole: "athlete",
    roleId: "ulc-linz:athlete",
    view: [
      "performance_registration",
      "training_overview",
      "training_documentation",
      "countdown",
    ],
    edit: ["performance_registration", "training_documentation", "countdown"],
  });
  assert.deepEqual(policy.runtimeRoles.parent, {
    sourceRole: "parent",
    roleId: "ulc-linz:parent",
    view: ["kindertraining", "u12", "u14"],
    edit: [],
  });

  const runtimeRoleIds = Object.values(policy.runtimeRoles).map(
    (runtimeRole) => runtimeRole.roleId,
  );
  assert.equal(new Set(runtimeRoleIds).size, runtimeRoleIds.length);
  assert.notEqual(
    policy.runtimeRoles.kindertrainer.roleId,
    policy.runtimeRoles.leistungstrainer.roleId,
  );
  assert.equal(policy.runtimeRoles.kindertrainer.sourceRole, "trainer");
  assert.equal(policy.runtimeRoles.leistungstrainer.sourceRole, "trainer");

  assert.deepEqual(policy.dataScopes, {
    organizationBoundary: "same-organization-only",
    inactiveMembership: "deny",
    unknownCapability: "deny",
    auditVisibility: "admin-only",
    canEditImpliesView: true,
    lastActiveAdmin: "protected",
    athleteLink: {
      sourceRole: "athlete",
      relationType: "self",
      cardinality: "one",
      explicitLinksOnly: true,
    },
    parentLink: {
      sourceRole: "parent",
      relationType: "managed",
      cardinality: "many",
      explicitLinksOnly: true,
    },
  });
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.runtimeRoles.leistungstrainer.view), true);
  assert.equal(Object.isFrozen(policy.dataScopes.parentLink), true);
});

test("rejects broadened parent permissions", () => {
  const candidate = clonePolicy();
  candidate.runtimeRoles.parent.edit.push("kindertraining");

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects colliding trainer runtime role identities", () => {
  const candidate = clonePolicy();
  candidate.runtimeRoles.leistungstrainer.roleId =
    candidate.runtimeRoles.kindertrainer.roleId;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects weakened organization isolation", () => {
  const candidate = clonePolicy();
  candidate.dataScopes.organizationBoundary = "membership-or-global";

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects changed self and managed athlete link semantics", () => {
  const candidate = clonePolicy();
  candidate.dataScopes.parentLink.explicitLinksOnly = false;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects policy values with extra fields or stale provenance changes", () => {
  const withExtra = clonePolicy();
  withExtra.runtimeRoles.parent.extra = "unexpected";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(withExtra), false);

  const changedSource = clonePolicy();
  changedSource.sourceSnapshot.commit = "0000000000000000000000000000000000000000";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(changedSource), false);
});

test("rejects arrays with extra own properties or missing entries", () => {
  const withExtraArrayProperty = clonePolicy();
  withExtraArrayProperty.sourceRoles.extra = "unexpected";
  assert.equal(
    isCanonicalUlcLinzM5RoleDataScopePolicy(withExtraArrayProperty),
    false,
  );

  const withMissingEntry = clonePolicy();
  delete withMissingEntry.runtimeRoles.parent.view[0];
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(withMissingEntry), false);
});

function clonePolicy() {
  return JSON.parse(JSON.stringify(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY));
}
