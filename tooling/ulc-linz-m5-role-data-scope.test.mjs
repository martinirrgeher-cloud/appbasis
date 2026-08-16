import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalUlcLinzM5RoleDataScopePolicy,
  ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
} from "./ulc-linz-m5-role-data-scope.mjs";

test("pins the current ULC Linz roles and organization data scopes", () => {
  const policy = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(policy), true);
  assert.equal(policy.id, "ulc-linz-role-data-scope-v0.1");
  assert.deepEqual(policy.sourceSnapshot, {
    repository: "martinirrgeher-cloud/ulc-linz",
    commit: "682ed5d37e7206f7fa521e5dab40f840cc303f0b",
  });
  assert.deepEqual(policy.roles, ["admin", "trainer", "athlete", "parent"]);
  assert.equal(policy.permissionModel.admin.mode, "own-organization-admin");
  assert.deepEqual(policy.permissionModel.kindertrainer, {
    role: "trainer",
    view: ["kindertraining", "u12", "u14", "countdown"],
    edit: ["kindertraining", "u12", "u14", "countdown"],
  });
  assert.deepEqual(policy.permissionModel.leistungstrainer, {
    role: "trainer",
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
  assert.deepEqual(policy.permissionModel.athlete, {
    role: "athlete",
    view: [
      "performance_registration",
      "training_overview",
      "training_documentation",
      "countdown",
    ],
    edit: ["performance_registration", "training_documentation", "countdown"],
  });
  assert.deepEqual(policy.permissionModel.parent, {
    role: "parent",
    view: ["kindertraining", "u12", "u14"],
    edit: [],
  });
  assert.deepEqual(policy.dataScopes, {
    organizationBoundary: "same-organization-only",
    inactiveMembership: "deny",
    unknownCapability: "deny",
    auditVisibility: "admin-only",
    canEditImpliesView: true,
    lastActiveAdmin: "protected",
    athleteLink: {
      role: "athlete",
      relationType: "self",
      cardinality: "one",
      explicitLinksOnly: true,
    },
    parentLink: {
      role: "parent",
      relationType: "managed",
      cardinality: "many",
      explicitLinksOnly: true,
    },
  });
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.permissionModel.leistungstrainer.view), true);
  assert.equal(Object.isFrozen(policy.dataScopes.parentLink), true);
});

test("rejects broadened parent permissions", () => {
  const candidate = clonePolicy();
  candidate.permissionModel.parent.edit.push("kindertraining");

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
  withExtra.permissionModel.parent.extra = "unexpected";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(withExtra), false);

  const changedSource = clonePolicy();
  changedSource.sourceSnapshot.commit = "0000000000000000000000000000000000000000";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(changedSource), false);
});

test("rejects arrays with extra own properties or missing entries", () => {
  const withExtraArrayProperty = clonePolicy();
  withExtraArrayProperty.roles.extra = "unexpected";
  assert.equal(
    isCanonicalUlcLinzM5RoleDataScopePolicy(withExtraArrayProperty),
    false,
  );

  const withMissingEntry = clonePolicy();
  delete withMissingEntry.permissionModel.parent.view[0];
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(withMissingEntry), false);
});

function clonePolicy() {
  return JSON.parse(JSON.stringify(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY));
}
