import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseUlcLinzM5RestoreDatabaseUrl,
  resetAndVerifyUlcLinzM5IsolatedRestoreTarget,
  verifyUlcLinzM5IsolatedRestoreTargetEmpty,
} from "./ulc-linz-m5-restore-target.mjs";

const SOURCE = "postgresql://ulc_linz_application:secret@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const RESTORE = "postgresql://neondb_owner:secret@ep-restore.us-east-2.aws.neon.tech/neondb?sslmode=require";
const IDENTITY_QUERY = "SELECT current_database() AS current_database, current_user AS current_user";
const GUARDED_RESET_ENV = Object.freeze({
  GITHUB_ACTIONS: "true",
  GITHUB_WORKFLOW: "M5 ULC Production Evidence",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  NEON_API_KEY: "test-neon-api-key",
  NEON_ORG_ID: "org-test",
  APPBASIS_M5_NEON_SOURCE_PROJECT_ID: "project-production",
  APPBASIS_M5_NEON_SOURCE_BRANCH_ID: "br-production",
  APPBASIS_M5_NEON_SOURCE_ENDPOINT_ID: "ep-crimson-boat-b1aqfjwf",
  APPBASIS_M5_NEON_RESTORE_PROJECT_ID: "project-restore",
  APPBASIS_M5_NEON_RESTORE_BRANCH_ID: "br-restore",
  APPBASIS_M5_NEON_RESTORE_ENDPOINT_ID: "ep-restore",
});

Object.assign(process.env, GUARDED_RESET_ENV);

const originalFetch = globalThis.fetch;
let providerProofMode = "isolated";
globalThis.fetch = async (input) => {
  const url = input instanceof URL ? input : new URL(String(input));
  if (url.pathname === "/api/v2/projects") {
    return jsonResponse({ projects: [{ id: "project-production" }, { id: "project-restore" }] });
  }
  if (url.pathname === "/api/v2/projects/project-production/endpoints") {
    return jsonResponse({ endpoints: [{
      id: "ep-crimson-boat-b1aqfjwf",
      host: new URL(SOURCE).hostname,
      project_id: "project-production",
      branch_id: "br-production",
      type: "read_write",
    }] });
  }
  if (url.pathname === "/api/v2/projects/project-restore/endpoints") {
    return jsonResponse({ endpoints: [{
      id: "ep-restore",
      host: new URL(RESTORE).hostname,
      project_id: providerProofMode === "production-branch" ? "project-production" : "project-restore",
      branch_id: providerProofMode === "production-branch" ? "br-production" : "br-restore",
      type: "read_write",
    }] });
  }
  throw new Error(`Unexpected provider test URL: ${url}`);
};

test.after(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body) {
  return { ok: true, async json() { return body; } };
}

function state(overrides = {}) {
  return {
    public_schema_count: 1,
    extra_schema_count: 0,
    public_relation_count: 0,
    public_routine_count: 0,
    public_type_count: 0,
    ...overrides,
  };
}

function identity(overrides = {}) {
  return { current_database: "neondb", current_user: "neondb_owner", ...overrides };
}

function databaseWith({ states = [state()], identityRows = [identity()], onStatement } = {}) {
  let stateIndex = 0;
  const client = {
    async unsafe(query) {
      if (query === IDENTITY_QUERY) return identityRows;
      if (query.includes("pg_catalog.pg_namespace")) {
        const value = states[Math.min(stateIndex, states.length - 1)];
        stateIndex += 1;
        return [value];
      }
      onStatement?.(query);
      return [];
    },
    async begin(callback) {
      await callback({
        async unsafe(query) {
          if (query === IDENTITY_QUERY) return identityRows;
          onStatement?.(query);
          return [];
        },
      });
    },
    async end() {},
  };
  return { client };
}

test("direct CLI rejects destructive reset mode before database access", () => {
  const target = fileURLToPath(new URL("./ulc-linz-m5-restore-target.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [target, "reset-and-verify"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ULC_LINZ_PRODUCTION_DATABASE_URL: SOURCE,
      APPBASIS_M4_RESTORE_DATABASE_URL: RESTORE,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destructive reset is available only through the guarded M4\/M5 workflow path/);
});

test("imported destructive reset primitive requires guarded workflow context before provider or database access", async () => {
  const previous = process.env.GITHUB_WORKFLOW;
  delete process.env.GITHUB_WORKFLOW;
  let connects = 0;
  try {
    await assert.rejects(
      () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
        sourceUrl: SOURCE,
        restoreUrl: RESTORE,
        createDatabase: () => { connects += 1; return databaseWith(); },
      }),
      /requires the exact guarded production-evidence workflow context/,
    );
    assert.equal(connects, 0);
  } finally {
    process.env.GITHUB_WORKFLOW = previous;
  }
});

test("destructive reset requires fresh provider proof that restore is not the production branch", async () => {
  providerProofMode = "production-branch";
  let connects = 0;
  try {
    await assert.rejects(
      () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
        sourceUrl: SOURCE,
        restoreUrl: RESTORE,
        createDatabase: () => { connects += 1; return databaseWith(); },
      }),
      /different Neon branch from production/,
    );
    assert.equal(connects, 0);
  } finally {
    providerProofMode = "isolated";
  }
});

test("destructive reset still requires matching persisted attestation as a secondary guard", async () => {
  const previousBranch = process.env.APPBASIS_M5_NEON_RESTORE_BRANCH_ID;
  const previousProject = process.env.APPBASIS_M5_NEON_RESTORE_PROJECT_ID;
  process.env.APPBASIS_M5_NEON_RESTORE_BRANCH_ID = process.env.APPBASIS_M5_NEON_SOURCE_BRANCH_ID;
  process.env.APPBASIS_M5_NEON_RESTORE_PROJECT_ID = process.env.APPBASIS_M5_NEON_SOURCE_PROJECT_ID;
  let connects = 0;
  try {
    await assert.rejects(
      () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
        sourceUrl: SOURCE,
        restoreUrl: RESTORE,
        createDatabase: () => { connects += 1; return databaseWith(); },
      }),
      /resolves restore to the production branch/,
    );
    assert.equal(connects, 0);
  } finally {
    process.env.APPBASIS_M5_NEON_RESTORE_BRANCH_ID = previousBranch;
    process.env.APPBASIS_M5_NEON_RESTORE_PROJECT_ID = previousProject;
  }
});

test("accepts canonical production source and empty isolated restore target with matching effective identity", async () => {
  const result = await verifyUlcLinzM5IsolatedRestoreTargetEmpty({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: () => databaseWith(),
  });
  assert.deepEqual(result, { status: "restore-target-empty", appId: "ulc-linz" });
});

test("rejects source identity drift and equivalent production restore endpoints before connecting", async () => {
  const invalidSources = [
    SOURCE.replace("ulc_linz_application", "neondb_owner"),
    SOURCE.replace("/neondb?", "/appbasis_m3_preview?"),
    SOURCE.replace("ep-crimson-boat-b1aqfjwf.c-5", "ep-other-project.c-5"),
    SOURCE.replace("eu-central-1", "us-east-2"),
    `${SOURCE}&database=other`,
  ];
  for (const sourceUrl of invalidSources) {
    await assert.rejects(
      () => verifyUlcLinzM5IsolatedRestoreTargetEmpty({ sourceUrl, restoreUrl: RESTORE, createDatabase: () => databaseWith() }),
      /production application principal|canonical ULC production Neon origin|override connection identity/,
    );
  }

  let connects = 0;
  await assert.rejects(
    () => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE,
      restoreUrl: SOURCE.replace("ulc_linz_application", "neondb_owner"),
      createDatabase: () => { connects += 1; return databaseWith(); },
    }),
  );
  assert.equal(connects, 0);
});

test("rejects the full connection-string identity override surface before connecting", async () => {
  const unsafe = [
    `${RESTORE}&database=other`, `${RESTORE}&dbname=other`, `${RESTORE}&host=ep-other.us-east-2.aws.neon.tech`,
    `${RESTORE}&hostname=other`, `${RESTORE}&port=5433`, `${RESTORE}&user=other`, `${RESTORE}&username=other`,
    `${RESTORE}&password=other`, `${RESTORE}&service=other`, `${RESTORE}&servicefile=other`,
    `${RESTORE}&target_session_attrs=read-write`, `${RESTORE}&%64atabase=other`, `${RESTORE}&sslmode=require`,
    `${RESTORE}&options=-csearch_path%3Dpublic`,
  ];
  for (const restoreUrl of unsafe) {
    let connects = 0;
    await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE, restoreUrl, createDatabase: () => { connects += 1; return databaseWith(); },
    }));
    assert.equal(connects, 0, restoreUrl);
  }
});

test("allows only non-identity channel_binding alongside one strong sslmode", () => {
  const parsed = parseUlcLinzM5RestoreDatabaseUrl(`${RESTORE}&channel_binding=require`);
  assert.equal(parsed.searchParams.get("channel_binding"), "require");
  assert.throws(() => parseUlcLinzM5RestoreDatabaseUrl(`${RESTORE}&channel_binding=unexpected`), /unsupported channel_binding/);
  assert.throws(() => parseUlcLinzM5RestoreDatabaseUrl(`${RESTORE}&channel_binding=require&channel_binding=prefer`), /duplicate or unsupported/);
});

test("rejects alias, authority, encoded-path and endpoint tricks before connecting", async () => {
  const productionHost = new URL(SOURCE).hostname;
  const restoreHost = new URL(RESTORE).hostname;
  const unsafe = [
    RESTORE.replace(restoreHost, "restore.example.test"), RESTORE.replace("ep-restore", "ep-restore-pooler"),
    RESTORE.replace(".neon.tech/", ".neon.tech./"), RESTORE.replace("/neondb?", "/n%65ondb?"),
    RESTORE.replace(".neon.tech/", ".neon.tech:5433/"), RESTORE.replace("neondb_owner", "ulc_linz_application"),
    RESTORE.replace(restoreHost, `${productionHost},${restoreHost}`), RESTORE.replace(restoreHost, `${productionHost}%2C${restoreHost}`),
    `postgresql://neondb_owner:secret@${productionHost},${restoreHost}@${restoreHost}/neondb?sslmode=require`,
    `${RESTORE}#alternate`, RESTORE.replace("/neondb?", "/neo%2Fndb?"), RESTORE.replace("/neondb?", "/neo%5Cndb?"),
    RESTORE.replace("/neondb?", "/neo%00ndb?"),
  ];
  for (const restoreUrl of unsafe) {
    let connects = 0;
    await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE, restoreUrl, createDatabase: () => { connects += 1; return databaseWith(); },
    }));
    assert.equal(connects, 0, restoreUrl);
  }
});

test("fails closed if the effective connected database or principal differs before inspection", async () => {
  for (const identityRows of [[identity({ current_database: "production-shadow" })], [identity({ current_user: "unexpected_owner" })], []]) {
    let inspected = false;
    await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
      sourceUrl: SOURCE,
      restoreUrl: RESTORE,
      createDatabase: () => ({ client: {
        async unsafe(query) { if (query === IDENTITY_QUERY) return identityRows; inspected = true; return [state({ public_relation_count: 1 })]; },
        async begin() { throw new Error("must not begin"); }, async end() {},
      } }),
    }), /reset was refused or failed/);
    assert.equal(inspected, false);
  }
});

test("reset re-verifies effective identity inside the destructive transaction", async () => {
  const statements = [];
  let transactionIdentityChecked = false;
  await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: () => ({ client: {
      async unsafe(query) { if (query === IDENTITY_QUERY) return [identity()]; return [state({ public_relation_count: 1 })]; },
      async begin(callback) { await callback({ async unsafe(query) {
        if (query === IDENTITY_QUERY) { transactionIdentityChecked = true; return [identity({ current_database: "wrong" })]; }
        statements.push(query); return [];
      } }); },
      async end() {},
    } }),
  }), /reset was refused or failed/);
  assert.equal(transactionIdentityChecked, true);
  assert.deepEqual(statements, []);
});

test("reset is idempotent for an already empty isolated target", async () => {
  let beginCalls = 0;
  const database = databaseWith();
  database.client.begin = async () => { beginCalls += 1; };
  const result = await resetAndVerifyUlcLinzM5IsolatedRestoreTarget({ sourceUrl: SOURCE, restoreUrl: RESTORE, createDatabase: () => database });
  assert.deepEqual(result, { status: "restore-target-empty", appId: "ulc-linz", resetApplied: false });
  assert.equal(beginCalls, 0);
});

test("reset atomically replaces only public schema and verifies identity and empty result", async () => {
  const statements = [];
  const result = await resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE,
    restoreUrl: RESTORE,
    createDatabase: () => databaseWith({
      states: [state({ public_relation_count: 12, public_routine_count: 2, public_type_count: 3 }), state()],
      onStatement: (statement) => statements.push(statement),
    }),
  });
  assert.deepEqual(result, { status: "restore-target-empty", appId: "ulc-linz", resetApplied: true });
  assert.deepEqual(statements, [
    "DROP SCHEMA IF EXISTS public CASCADE", "CREATE SCHEMA public", "REVOKE CREATE ON SCHEMA public FROM PUBLIC", "GRANT USAGE ON SCHEMA public TO PUBLIC",
  ]);
});

test("reset refuses unexpected non-public schemas and post-reset drift fail closed", async () => {
  let statements = [];
  await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE, restoreUrl: RESTORE,
    createDatabase: () => databaseWith({ states: [state({ extra_schema_count: 1 })], onStatement: (s) => statements.push(s) }),
  }), /reset was refused or failed/);
  assert.deepEqual(statements, []);

  await assert.rejects(() => resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
    sourceUrl: SOURCE, restoreUrl: RESTORE,
    createDatabase: () => databaseWith({ states: [state({ public_relation_count: 1 }), state({ public_relation_count: 1 })] }),
  }), /reset was refused or failed/);
});
