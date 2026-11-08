import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  applyRepositoryMigrationPlan,
  loadRepositoryMigrationPlan,
} from "./database-migration-executor.mjs";
import { readUlcLinzRestoreFingerprint } from "./ulc-linz-m5-restore-fingerprint.mjs";

// CI-only synthetic rehearsal. Never accept preview, production or a remote DB.
const postgresImage =
  "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function requireG04SyntheticCiDatabase(value, environment = process.env) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("G-04 recovery fixture requires an explicit local CI database.");
  }
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true" ||
      parsed.protocol !== "postgres:" ||
      parsed.hostname !== "localhost" || parsed.port !== "5432" ||
      parsed.pathname !== "/appbasis_identity_e2e" ||
      parsed.username !== "postgres" || !parsed.password ||
      parsed.search !== "" || parsed.hash !== "") {
    throw new Error("G-04 recovery fixture refuses non-CI or non-local test databases.");
  }
  return parsed.toString();
}

function databaseUrlFor(baseUrl, databaseName) {
  const value = new URL(baseUrl);
  value.pathname = "/" + databaseName;
  return value.toString();
}

function identifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("Invalid synthetic database identifier.");
  }
  return '"' + value + '"';
}

async function runPostgresContainer({ url, work, command }) {
  const args = [
    "run", "--rm", "--network", "host",
    "--env", "DATABASE_URL",
    "--volume", work + ":/evidence",
    postgresImage, "sh", "-ceu", command,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.on("data", () => {}); // Do not expose connection strings.
    child.once("error", () =>
      reject(new Error("G-04 PostgreSQL 18 client container could not start.")));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("G-04 fixture pg_dump/pg_restore failed (exit " +
        String(code) + ")."));
    });
  });
}

// Schema/row-count fingerprints deliberately do not cover privileges.
async function readProtectedSecurityAcl(client) {
  const rows = await client.unsafe(`
    SELECT
      procedure.prosecdef AS security_definer,
      EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
        )) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS public_execute,
      EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
        )) AS acl
        JOIN pg_catalog.pg_roles AS role ON role.oid = acl.grantee
        WHERE role.rolname = 'ulc_linz_security_event_cleanup'
          AND acl.privilege_type = 'EXECUTE'
      ) AS cleanup_execute,
      EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          log.relacl, pg_catalog.acldefault('r', log.relowner)
        )) AS acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'SELECT'
      ) AS public_log_select,
      EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(
          log.relacl, pg_catalog.acldefault('r', log.relowner)
        )) AS acl
        JOIN pg_catalog.pg_roles AS role ON role.oid = acl.grantee
        WHERE role.rolname = 'ulc_linz_security_event_read'
          AND acl.privilege_type = 'SELECT'
      ) AS audit_read_select
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_class AS log ON log.relname = 'ulc_linz_security_event_log'
    JOIN pg_catalog.pg_namespace AS log_namespace ON log_namespace.oid = log.relnamespace
    WHERE namespace.nspname = 'public'
      AND log_namespace.nspname = 'public'
      AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
  `);
  assert.equal(rows.length, 1, "Expected precisely one protected security function.");
  return { ...rows[0] };
}

async function dropIsolatedDatabase(admin, name) {
  await admin.client.unsafe(
    "DROP DATABASE IF EXISTS " + identifier(name) + " WITH (FORCE)",
  );
}

test("G-04.2f fails closed for preview, production, remote, or non-CI endpoints", () => {
  const accepted = "postgres://postgres:postgres@localhost:5432/appbasis_identity_e2e";
  assert.equal(requireG04SyntheticCiDatabase(accepted, {
    CI: "true", GITHUB_ACTIONS: "true",
  }), accepted);
  for (const [candidate, flags] of [
    [undefined, {}],
    [accepted, { CI: "true" }],
    [accepted.replace("localhost", "preview.db.example"), {
      CI: "true", GITHUB_ACTIONS: "true",
    }],
    [accepted.replace("appbasis_identity_e2e", "appbasis_ulc_linz_preview"), {
      CI: "true", GITHUB_ACTIONS: "true",
    }],
    [accepted.replace("appbasis_identity_e2e", "production"), {
      CI: "true", GITHUB_ACTIONS: "true",
    }],
    [accepted + "?sslmode=require", { CI: "true", GITHUB_ACTIONS: "true" }],
  ]) {
    assert.throws(() => requireG04SyntheticCiDatabase(candidate, flags),
      /G-04 recovery fixture/);
  }
});

test("G-04.2f restores an actual v16 synthetic dump into a distinct empty PostgreSQL 18 database", {
  timeout: 180_000,
}, async () => {
  const baseUrl = requireG04SyntheticCiDatabase(process.env.DATABASE_URL);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const sourceName = "g04_fixture_src_" + suffix;
  const restoreName = "g04_fixture_restore_" + suffix;
  assert.notEqual(sourceName, restoreName);
  const work = await mkdtemp(join(tmpdir(), "appbasis-g04-fixture-"));
  const dumpPath = join(work, "v16-fixture.pgdump");
  const admin = createPostgresDatabase(baseUrl);
  let source = null;
  let restored = null;
  let sourceCreated = false;
  let restoreCreated = false;

  try {
    await admin.client.unsafe("CREATE DATABASE " + identifier(sourceName));
    sourceCreated = true;
    await admin.client.unsafe("CREATE DATABASE " + identifier(restoreName));
    restoreCreated = true;
    const sourceUrl = databaseUrlFor(baseUrl, sourceName);
    const restoreUrl = databaseUrlFor(baseUrl, restoreName);
    const plan = await loadRepositoryMigrationPlan({
      repositoryRoot,
      manifestPath: join(repositoryRoot, "apps", "ulc-linz", "appbasis.database.json"),
      expectedApplication: "ulc-linz",
      expectedOwners: {
        identity: "packages/identity",
        permissions: "packages/permissions",
        athletes: "modules/athletes",
        "exercise-catalog": "modules/exercise-catalog",
        "training-blocks": "modules/training-blocks",
        "training-documentation": "modules/training-documentation",
        "training-plans": "modules/training-plans",
        "ulc-linz-lifecycle": "apps/ulc-linz",
      },
    });
    const manifest = JSON.parse(await readFile(join(repositoryRoot,
      "apps/ulc-linz/appbasis.database.json"), "utf8"));
    const owner = manifest.owners.find((entry) => entry.id === "ulc-linz-lifecycle");
    assert.equal(owner.schemaVersion, 16);
    assert.equal(owner.migrations.length, 16);
    assert.equal(owner.migrations.some((migration) => migration.includes("0016_")), false);
    await applyRepositoryMigrationPlan({
      connectionString: sourceUrl,
      expectedDatabase: sourceName,
      plan,
      createDatabase: createPostgresDatabase,
    });
    source = createPostgresDatabase(sourceUrl);
    const emptyTarget = createPostgresDatabase(restoreUrl);
    try {
      const tables = await emptyTarget.client.unsafe(
        "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'",
      );
      assert.equal(tables[0].count, 0, "Restore target must be empty.");
    } finally {
      await emptyTarget.client.end();
    }
    const notInstalled = await source.client.unsafe(
      "SELECT to_regclass('public.ulc_linz_registration_calendar_rule') AS rule, " +
      "to_regclass('public.ulc_linz_registration_calendar_exception') AS exception",
    );
    assert.equal(notInstalled[0].rule, null);
    assert.equal(notInstalled[0].exception, null);

    // Clearly synthetic data; no athlete, contact, identity, or user information.
    await source.client.unsafe(
      "CREATE TABLE public.g04_recovery_fixture (" +
      "id text PRIMARY KEY, group_key text NOT NULL, session_date date NOT NULL, " +
      "revision integer NOT NULL CHECK (revision > 0))",
    );
    await source.client.unsafe(
      "INSERT INTO public.g04_recovery_fixture VALUES " +
      "('fixture-1','demo-U12','2026-11-09',1)," +
      "('fixture-2','demo-U14','2026-11-11',3)",
    );
    const selectFixture = "SELECT id, group_key, session_date::text AS training_day, revision " +
      "FROM public.g04_recovery_fixture ORDER BY id";
    const fixtureBefore = (await source.client.unsafe(selectFixture)).map((row) => ({ ...row }));
    assert.equal(fixtureBefore.length, 2);
    const before = await readUlcLinzRestoreFingerprint(sourceUrl);
    const sourceAcl = await readProtectedSecurityAcl(source.client);
    assert.deepEqual(sourceAcl, {
      security_definer: true,
      public_execute: false,
      cleanup_execute: true,
      public_log_select: false,
      audit_read_select: true,
    }, "Canonical v16 must restrict protected security-event access.");


    // pg_dump uses a consistent source snapshot. This is a fixture rehearsal,
    // not backup evidence for the real appbasis_ulc_linz_preview database.
    await runPostgresContainer({
      url: sourceUrl, work,
      command: 'pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file=/evidence/v16-fixture.pgdump',
    });
    assert.ok((await stat(dumpPath)).size > 0);
    const sha256 = createHash("sha256").update(await readFile(dumpPath)).digest("hex");
    assert.match(sha256, /^[0-9a-f]{64}$/);
    await runPostgresContainer({
      url: restoreUrl, work,
      command: 'pg_restore --single-transaction --no-owner --exit-on-error --dbname="$DATABASE_URL" /evidence/v16-fixture.pgdump',
    });

    restored = createPostgresDatabase(restoreUrl);
    const fixtureAfter = (await restored.client.unsafe(selectFixture)).map((row) => ({ ...row }));
    assert.deepEqual(fixtureAfter, fixtureBefore);
    const after = await readUlcLinzRestoreFingerprint(restoreUrl);
    assert.deepEqual(after, before);
    const restoreAcl = await readProtectedSecurityAcl(restored.client);
    assert.deepEqual(restoreAcl, sourceAcl,
      "The isolated restore must preserve explicit ACL grants and revocations.");

    const restoredState = await restored.client.unsafe(
      "SELECT to_regclass('public.ulc_linz_registration_calendar_rule') AS rule, " +
      "to_regclass('public.ulc_linz_registration_calendar_exception') AS exception",
    );
    assert.equal(restoredState[0].rule, null);
    assert.equal(restoredState[0].exception, null);
  } finally {
    await restored?.client.end().catch(() => {});
    await source?.client.end().catch(() => {});
    if (restoreCreated) await dropIsolatedDatabase(admin, restoreName);
    if (sourceCreated) await dropIsolatedDatabase(admin, sourceName);
    await admin.client.end().catch(() => {});
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
});
