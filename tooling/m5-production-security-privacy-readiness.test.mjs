import assert from "node:assert/strict";
import test from "node:test";

import {
  M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA,
  evaluateM5ProductionSecurityPrivacyReadiness,
  isKnownM5ProductionSecurityPrivacyCriterion,
} from "./m5-production-security-privacy-readiness.mjs";

function allSatisfiedChecks() {
  return Object.fromEntries(
    M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.map(({ id }) => [
      id,
      { status: "satisfied", evidenceRefs: [`evidence:${id}`] },
    ]),
  );
}

test("M5 stays fail-closed when no evidence is supplied", () => {
  const result = evaluateM5ProductionSecurityPrivacyReadiness();

  assert.equal(result.productionReady, false);
  assert.equal(result.missingCriteria.length, M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.length);
  assert.deepEqual(
    result.missingCriteria,
    M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.map(({ id }) => id),
  );
});

test("M5 becomes production ready only when every mandatory criterion has satisfied evidence", () => {
  const result = evaluateM5ProductionSecurityPrivacyReadiness({
    checks: allSatisfiedChecks(),
  });

  assert.equal(result.productionReady, true);
  assert.deepEqual(result.missingCriteria, []);
  assert.ok(result.criteria.every(({ satisfied }) => satisfied));
});

test("one missing mandatory criterion keeps production ready false", () => {
  const checks = allSatisfiedChecks();
  delete checks["data-export"];

  const result = evaluateM5ProductionSecurityPrivacyReadiness({ checks });

  assert.equal(result.productionReady, false);
  assert.deepEqual(result.missingCriteria, ["data-export"]);
});

test("unknown or non-satisfied statuses never bypass the gate", () => {
  for (const status of ["pending", "not-applicable", "waived", true, null]) {
    const checks = allSatisfiedChecks();
    checks.encryption = {
      status,
      evidenceRefs: ["evidence:encryption"],
    };

    const result = evaluateM5ProductionSecurityPrivacyReadiness({ checks });
    assert.equal(result.productionReady, false);
    assert.ok(result.missingCriteria.includes("encryption"));
  }
});

test("satisfied status without traceable evidence stays fail-closed", () => {
  for (const evidenceRefs of [undefined, [], [""], [" padded "], ["line\nbreak"]]) {
    const checks = allSatisfiedChecks();
    checks.dpa = { status: "satisfied", evidenceRefs };

    const result = evaluateM5ProductionSecurityPrivacyReadiness({ checks });
    assert.equal(result.productionReady, false);
    assert.ok(result.missingCriteria.includes("dpa"));
  }
});

test("malformed top-level input is treated as missing evidence instead of ready", () => {
  for (const input of [null, [], "ready", { checks: [] }, { checks: "ready" }]) {
    const result = evaluateM5ProductionSecurityPrivacyReadiness(input);
    assert.equal(result.productionReady, false);
    assert.equal(result.missingCriteria.length, M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.length);
  }
});

test("extra non-contract checks cannot affect readiness", () => {
  const checks = allSatisfiedChecks();
  checks["skip-security"] = {
    status: "satisfied",
    evidenceRefs: ["evidence:skip-security"],
  };

  const result = evaluateM5ProductionSecurityPrivacyReadiness({ checks });
  assert.equal(result.productionReady, true);
  assert.equal(result.criteria.length, M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA.length);
});

test("criterion lookup exposes only the fixed M5 contract", () => {
  assert.equal(isKnownM5ProductionSecurityPrivacyCriterion("data-region"), true);
  assert.equal(isKnownM5ProductionSecurityPrivacyCriterion("skip-security"), false);
  assert.equal(isKnownM5ProductionSecurityPrivacyCriterion(null), false);
});

test("result and contract structures are immutable", () => {
  const result = evaluateM5ProductionSecurityPrivacyReadiness({
    checks: allSatisfiedChecks(),
  });

  assert.equal(Object.isFrozen(M5_PRODUCTION_SECURITY_PRIVACY_CRITERIA), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.criteria), true);
  assert.equal(Object.isFrozen(result.criteria[0]), true);
  assert.equal(Object.isFrozen(result.criteria[0].evidenceRefs), true);
  assert.equal(Object.isFrozen(result.missingCriteria), true);
});
