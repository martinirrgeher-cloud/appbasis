import assert from "node:assert/strict";
import test from "node:test";

import {
  hasCanonicalConstraintDefinition,
  isAbsentUlcPreviewIdentityAuditShape,
  isCanonicalUlcPreviewIdentityAuditShape,
  readUlcPreviewIdentityAuditShape,
} from "./ulc-linz-d4-preview-identity-audit-shape.mjs";
import {
  CANONICAL_PG_CHECK,
  canonicalIdentityColumns,
  canonicalIdentityConstraints,
  canonicalIdentityDiscriminator,
} from "./ulc-linz-d4-preview-identity-audit-test-fixture.mjs";

test("accepts only the canonical null-or-fully-audited identity v3 predicate", () => {
  assert.equal(hasCanonicalConstraintDefinition(CANONICAL_PG_CHECK), true);
  const betweenVariant = CANONICAL_PG_CHECK
    .replace("(char_length(provisioning_owner) >= 1)\n    AND (char_length(provisioning_owner) <= 120)", "(char_length(provisioning_owner) BETWEEN 1 AND 120)")
    .replace("(char_length(actor_principal_id) >= 1)\n    AND (char_length(actor_principal_id) <= 200)", "(char_length(actor_principal_id) BETWEEN 1 AND 200)")
    .replace("(char_length(reason) >= 1)\n    AND (char_length(reason) <= 500)", "(char_length(reason) BETWEEN 1 AND 500)");
  assert.equal(hasCanonicalConstraintDefinition(betweenVariant), true);
});

test("rejects ineffective or differently grouped checks that merely mention expected columns", () => {
  for (const drifted of [
    "CHECK (kind IS NOT NULL AND provisioning_owner IS NOT NULL AND actor_principal_id IS NOT NULL AND reason IS NOT NULL)",
    CANONICAL_PG_CHECK.replace("reason IS NULL", "reason IS NOT NULL"),
    CANONICAL_PG_CHECK.replace("reason IS NOT NULL", "reason IS NULL"),
    CANONICAL_PG_CHECK.replace("char_length(reason) <= 500", "char_length(reason) <= 501"),
    CANONICAL_PG_CHECK.replace("AND (reason IS NOT NULL)", "OR (reason IS NOT NULL)"),
    CANONICAL_PG_CHECK.replace("reason IS NULL))", "reason IS NULL OR TRUE))"),
    CANONICAL_PG_CHECK.replace("AND (reason IS NOT NULL)", "AND (reason IS NOT NULL OR TRUE)"),
    "CHECK (TRUE /* kind provisioning_owner actor_principal_id reason */)",
  ]) {
    assert.equal(hasCanonicalConstraintDefinition(drifted), false, drifted);
  }
});

test("rejects wrong column type/default/nullability and unvalidated constraints", () => {
  const canonical = {
    discriminator: canonicalIdentityDiscriminator(),
    discriminatorCount: 1,
    columns: canonicalIdentityColumns(),
    constraints: canonicalIdentityConstraints(),
  };
  assert.equal(isCanonicalUlcPreviewIdentityAuditShape(canonical), true);
  for (const changes of [
    { data_type: "character varying(200)" },
    { not_null: true },
    { has_default: true },
    { generated: "s" },
    { identity: "a" },
  ]) {
    const modified = canonical.columns.map((column, index) =>
      index === 0 ? { ...column, ...changes } : column,
    );
    assert.equal(isCanonicalUlcPreviewIdentityAuditShape({
      columns: modified,
      constraints: canonical.constraints,
    }), false);
  }
  for (const changes of [
    { data_type: "character varying(20)" },
    { not_null: false },
    { has_default: true },
    { generated: "s" },
    { identity: "a" },
  ]) {
    assert.equal(isCanonicalUlcPreviewIdentityAuditShape({
      ...canonical,
      discriminator: { ...canonical.discriminator, ...changes },
    }), false);
  }
  assert.equal(isCanonicalUlcPreviewIdentityAuditShape({
    ...canonical,
    discriminatorCount: 0,
    discriminator: null,
  }), false);
  assert.equal(isCanonicalUlcPreviewIdentityAuditShape({
    columns: canonical.columns,
    constraints: [{ definition: CANONICAL_PG_CHECK, validated: false }],
  }), false);
  assert.equal(isCanonicalUlcPreviewIdentityAuditShape({
    columns: [canonical.columns[0], canonical.columns[0], canonical.columns[2]],
    constraints: canonical.constraints,
  }), false);
});

test("reads shared catalog metadata without touching application rows", async () => {
  const queries = [];
  const client = {
    async unsafe(sql) {
      queries.push(sql);
      if (sql.includes("FROM pg_catalog.pg_attribute")) {
        return [canonicalIdentityDiscriminator(), ...canonicalIdentityColumns()];
      }
      if (sql.includes("FROM pg_catalog.pg_constraint")) return canonicalIdentityConstraints();
      throw new Error("unexpected catalog query");
    },
  };
  const shape = await readUlcPreviewIdentityAuditShape(client);
  assert.equal(isCanonicalUlcPreviewIdentityAuditShape(shape), true);
  assert.equal(isAbsentUlcPreviewIdentityAuditShape(shape), false);
  assert.equal(isAbsentUlcPreviewIdentityAuditShape({
    discriminator: canonicalIdentityDiscriminator(),
    discriminatorCount: 1,
    columns: [],
    constraints: [],
  }), true);
  assert.equal(isAbsentUlcPreviewIdentityAuditShape({
    discriminator: { ...canonicalIdentityDiscriminator(), not_null: false },
    discriminatorCount: 1,
    columns: [],
    constraints: [],
  }), false);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => /^SELECT /i.test(sql)));
});
