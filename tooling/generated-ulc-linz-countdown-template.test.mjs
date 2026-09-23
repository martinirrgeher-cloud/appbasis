import assert from "node:assert/strict";
import test from "node:test";

import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

function content(template, path) {
  const entry = template.files.find((candidate) => candidate.path === path);
  assert.notEqual(entry, undefined, `Missing generated file: ${path}`);
  return entry.content;
}

test("ULC countdown generator emits the protected access vertical slice", () => {
  const template = createIdentityRuntimeTemplate({
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: ["countdown"],
    platformServices: ["identity", "permissions"],
  });

  const app = content(template, "worker/app.ts");
  const worker = content(template, "worker/index.ts");
  const postgres = content(template, "worker/postgres.ts");

  assert.match(app, /\/api\/modules\/countdown\/access/);
  assert.match(app, /assertUlcLinzCountdownAccess/);
  assert.match(app, /countdownMemberships: UlcLinzCountdownMembershipResolver/);
  assert.match(worker, /countdownMemberships: runtime\.countdownMemberships/);
  assert.match(postgres, /PostgresUlcLinzCountdownMembershipResolver/);
  assert.match(
    content(template, "worker/countdown-access.ts"),
    /COUNTDOWN_CAPABILITIES/,
  );
  assert.match(
    content(template, "worker/countdown-membership-postgres.ts"),
    /WHERE identity_id = \$1/,
  );
});

test("non-ULC countdown consumers keep the generic identity+permissions runtime", () => {
  const template = createIdentityRuntimeTemplate({
    appId: "countdown-test",
    displayName: "Countdown Test",
    modules: ["countdown"],
    platformServices: ["identity", "permissions"],
  });

  assert.equal(
    template.files.some((entry) => entry.path === "worker/countdown-access.ts"),
    false,
  );
  assert.doesNotMatch(content(template, "worker/app.ts"), /\/api\/modules\/countdown\/access/);
});
