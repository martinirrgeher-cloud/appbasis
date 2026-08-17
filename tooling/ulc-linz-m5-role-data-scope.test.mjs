import assert from "node:assert/strict";
import test from "node:test";

import {
  isCanonicalUlcLinzM5RoleDataScopePolicy,
  ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY,
} from "./ulc-linz-m5-role-data-scope.mjs";

test("pins ULC source roles and individual permission mapping", () => {
  const policy = ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(policy), true);
  assert.equal(policy.id, "ulc-linz-role-data-scope-v0.1");
  assert.deepEqual(policy.sourceSnapshot, {
    repository: "martinirrgeher-cloud/ulc-linz",
    commit: "682ed5d37e7206f7fa521e5dab40f840cc303f0b",
  });
  assert.deepEqual(policy.sourceRoles, ["admin", "trainer", "athlete", "parent"]);
  assert.deepEqual(policy.runtimeRoleIds, {
    admin: "ulc-linz:admin",
    trainer: "ulc-linz:trainer",
    athlete: "ulc-linz:athlete",
    parent: "ulc-linz:parent",
  });
  assert.deepEqual(policy.adminAuthorization, {
    sourceRole: "admin",
    runtimeRoleId: "ulc-linz:admin",
    mode: "own-organization-admin",
    moduleAccess: "all-known-modules-view-edit",
    individualModulePermissionsRequired: false,
    memberAdministration: "own-organization",
    auditVisibility: "own-organization",
    crossOrganization: "deny",
    unknownModule: "deny",
  });
  assert.deepEqual(policy.permissionTemplates.kindertrainer, {
    sourceRole: "trainer",
    semantics: "defaults-only",
    view: ["kindertraining", "u12", "u14", "countdown"],
    edit: ["kindertraining", "u12", "u14", "countdown"],
  });
  assert.deepEqual(policy.permissionTemplates.leistungstrainer, {
    sourceRole: "trainer",
    semantics: "defaults-only",
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
  assert.deepEqual(policy.permissionTemplates.athlete, {
    sourceRole: "athlete",
    semantics: "defaults-only",
    view: [
      "performance_registration",
      "training_overview",
      "training_documentation",
      "countdown",
    ],
    edit: ["performance_registration", "training_documentation", "countdown"],
  });
  assert.deepEqual(policy.permissionTemplates.parent, {
    sourceRole: "parent",
    semantics: "defaults-only",
    view: ["kindertraining", "u12", "u14"],
    edit: [],
  });
  assert.deepEqual(policy.principalPermissionMapping, {
    sourceField: "permissions",
    sourceShape: "module-canView-canEdit",
    targetMechanism: "principal-grants-revokes",
    capabilityNamespace: "ulc-linz:module",
    viewAction: "view",
    editAction: "edit",
    editImpliesView: true,
    unknownModule: "deny",
  });

  const runtimeRoleIds = Object.values(policy.runtimeRoleIds);
  assert.equal(new Set(runtimeRoleIds).size, runtimeRoleIds.length);
  assert.equal(policy.adminAuthorization.runtimeRoleId, policy.runtimeRoleIds.admin);
  assert.equal(policy.permissionTemplates.kindertrainer.sourceRole, "trainer");
  assert.equal(policy.permissionTemplates.leistungstrainer.sourceRole, "trainer");
  assert.equal(policy.permissionTemplates.kindertrainer.semantics, "defaults-only");
  assert.equal(policy.permissionTemplates.leistungstrainer.semantics, "defaults-only");

  assert.deepEqual(policy.dataScopes, {
    organizationBoundary: "same-organization-only",
    inactiveMembership: "deny",
    unknownCapability: "deny",
    auditVisibility: "admin-only",
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
  assert.equal(Object.isFrozen(policy.permissionTemplates.leistungstrainer.view), true);
  assert.equal(Object.isFrozen(policy.dataScopes.parentLink), true);
});

test("rejects weakened admin authorization", () => {
  const candidate = clonePolicy();
  candidate.adminAuthorization.moduleAccess = "principal-permissions-only";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);

  const crossOrganization = clonePolicy();
  crossOrganization.adminAuthorization.crossOrganization = "allow";
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(crossOrganization), false);

  const mismatchedRole = clonePolicy();
  mismatchedRole.adminAuthorization.runtimeRoleId = mismatchedRole.runtimeRoleIds.trainer;
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(mismatchedRole), false);
});

test("rejects broadened parent template permissions", () => {
  const candidate = clonePolicy();
  candidate.permissionTemplates.parent.edit.push("kindertraining");

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects colliding runtime role identities", () => {
  const candidate = clonePolicy();
  candidate.runtimeRoleIds.parent = candidate.runtimeRoleIds.athlete;

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects treating trainer templates as runtime roles", () => {
  const candidate = clonePolicy();
  candidate.permissionTemplates.kindertrainer.semantics = "runtime-role";

  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(candidate), false);
});

test("rejects weakened individual permission mapping", () => {
  const candidate = clonePolicy();
  candidate.principalPermissionMapping.targetMechanism = "merged-role-capabilities";

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
  withExtra.permissionTemplates.parent.extra = "unexpected";
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
  delete withMissingEntry.permissionTemplates.parent.view[0];
  assert.equal(isCanonicalUlcLinzM5RoleDataScopePolicy(withMissingEntry), false);
});

function clonePolicy() {
  return JSON.parse(JSON.stringify(ULC_LINZ_M5_ROLE_DATA_SCOPE_POLICY));
}
