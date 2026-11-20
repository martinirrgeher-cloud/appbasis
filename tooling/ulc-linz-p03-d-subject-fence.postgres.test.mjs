import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

/**
 * P03-D: disposable local PostgreSQL test of a candidate app-owned write
 * fence. Existing runtime and production/Preview schema remain untouched.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const BASE = [
  "../apps/ulc-linz/migrations/0004_ulc_linz_training_sessions.sql",
  "../apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
  "../apps/ulc-linz/migrations/0010_ulc_linz_registration_notes.sql",
];
const CANDIDATE =
  "../apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql";
const ORG = "p03-d-org";
const OTHER = "p03-d-other-org";
const TARGET = "p03-d-athlete";
const NEIGHBOR = "p03-d-neighbor";

if (DATABASE_URL) {
  const target = new URL(DATABASE_URL);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(target.hostname) ||
    target.username !== "postgres" ||
    target.port !== "5432" ||
    target.pathname !== "/appbasis_identity_e2e"
  ) throw new Error("P03-D requires only the local disposable PostgreSQL-18 CI service.");
}
function statements(sql) {
  return sql.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean);
}

test("P03-D: app-owned subject fence rejects stale writes and preserves neighbors with transactional rollback", {
  skip: !DATABASE_URL,
  timeout: 145_000,
}, async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseName = "ulc_p03_d_" + suffix;
  const roleName = "ulc_p03_d_app_" + suffix;
  const url = new URL(DATABASE_URL);
  url.pathname = "/" + databaseName;
  const admin = createPostgresDatabase(DATABASE_URL);
  let database = null;
  let createdDb = false;
  let createdRole = false;
  try {
    const version = await admin.client.unsafe("SHOW server_version_num");
    assert.ok(Number(version[0]?.server_version_num) >= 180000);
    await admin.client.unsafe("CREATE DATABASE " + databaseName);
    createdDb = true;
    database = createPostgresDatabase(url.toString());

    for (const path of BASE) {
      const sql = await readFile(new URL(path, import.meta.url), "utf8");
      for (const statement of statements(sql)) await database.client.unsafe(statement);
    }
    for (const [org, sessionId] of [
      [ORG, "session-owned"],
      [OTHER, "session-foreign"],
    ]) {
      await database.client.unsafe(
        "INSERT INTO ulc_linz_training_session " +
        "(id, organization_id, module_id, group_id, session_date) " +
        "VALUES ($1, $2, 'u12', 'group-p03', '2026-10-12')",
        [sessionId, org]
      );
    }
    const rows = [
      { org: ORG, session: "session-owned", subject: TARGET, suffix: "owned" },
      { org: ORG, session: "session-owned", subject: NEIGHBOR, suffix: "neighbor" },
      { org: OTHER, session: "session-foreign", subject: TARGET, suffix: "foreign" },
    ];
    for (const item of rows) {
      await database.client.unsafe(
        "INSERT INTO ulc_linz_training_attendance " +
        "(organization_id, session_id, athlete_id, status) " +
        "VALUES ($1,$2,$3,'present')",
        [item.org, item.session, item.subject]
      );
      await database.client.unsafe(
        "INSERT INTO ulc_linz_training_registration " +
        "(organization_id, session_id, athlete_id, intention, updated_by_identity_id) " +
        "VALUES ($1,$2,$3,'attending','synthetic-trainer')",
        [item.org, item.session, item.subject]
      );
      await database.client.unsafe(
        "INSERT INTO ulc_linz_training_registration_change " +
        "(id, organization_id, session_id, athlete_id, intention, revision, actor_identity_id) " +
        "VALUES ($1,$2,$3,$4,'attending',1,'synthetic-trainer')",
        ["change-" + item.suffix, item.org, item.session, item.subject]
      );
    }

    const candidate = statements(await readFile(
      new URL(CANDIDATE, import.meta.url), "utf8"
    ));
    assert.equal(candidate.length, 6);
    await assert.rejects(database.client.begin(async tx => {
      for (const statement of candidate) await tx.unsafe(statement);
      throw new Error("SYNTHETIC_P03_D_MIGRATION_ABORT");
    }), /SYNTHETIC_P03_D_MIGRATION_ABORT/);
    const rolledBack = await database.client.unsafe(
      "SELECT to_regclass('public.ulc_linz_training_subject_deletion') AS relation"
    );
    assert.equal(rolledBack[0]?.relation, null);

    await database.client.begin(async tx => {
      for (const statement of candidate) await tx.unsafe(statement);
    });
    const installed = await database.client.unsafe(
      "SELECT count(*)::int AS triggers FROM pg_catalog.pg_trigger " +
      "WHERE tgname LIKE 'ulc_linz_training_%_subject_fence' AND NOT tgisinternal"
    );
    assert.equal(Number(installed[0]?.triggers), 3);

    const counts = async (organizationId, subjectId) => {
      const x = await database.client.unsafe(
        "SELECT " +
        "(SELECT count(*)::int FROM ulc_linz_training_attendance " +
        " WHERE organization_id=$1 AND athlete_id=$2) AS attendance, " +
        "(SELECT count(*)::int FROM ulc_linz_training_registration " +
        " WHERE organization_id=$1 AND athlete_id=$2) AS registration, " +
        "(SELECT count(*)::int FROM ulc_linz_training_registration_change " +
        " WHERE organization_id=$1 AND athlete_id=$2) AS history",
        [organizationId, subjectId]
      );
      return x[0];
    };
    assert.deepEqual(await counts(ORG, TARGET),
      { attendance: 1, registration: 1, history: 1 });

    const erase = async (injectFault) => database.client.begin(async tx => {
      // The future authorized deletion coordinator must acquire this exact
      // key before the marker and ALL three app-owned row deletions.
      await tx.unsafe(
        "SELECT pg_advisory_xact_lock(" +
        "hashtextextended($1::text || chr(31) || $2::text, 0))",
        [ORG, TARGET]
      );
      await tx.unsafe(
        "INSERT INTO ulc_linz_training_subject_deletion " +
        "(organization_id, athlete_id, completed_at, purge_after) " +
        "VALUES ($1,$2,'2026-01-01T07:00:00Z','2026-02-05T07:00:00Z')",
        [ORG, TARGET]
      );
      await tx.unsafe(
        "DELETE FROM ulc_linz_training_registration_change " +
        "WHERE organization_id=$1 AND athlete_id=$2", [ORG, TARGET]
      );
      await tx.unsafe(
        "DELETE FROM ulc_linz_training_registration " +
        "WHERE organization_id=$1 AND athlete_id=$2", [ORG, TARGET]
      );
      if (injectFault) throw new Error("SYNTHETIC_P03_D_ERASURE_ABORT");
      await tx.unsafe(
        "DELETE FROM ulc_linz_training_attendance " +
        "WHERE organization_id=$1 AND athlete_id=$2", [ORG, TARGET]
      );
    });

    await assert.rejects(erase(true), /SYNTHETIC_P03_D_ERASURE_ABORT/);
    assert.deepEqual(await counts(ORG, TARGET),
      { attendance: 1, registration: 1, history: 1 });
    const markerAfterRollback = await database.client.unsafe(
      "SELECT count(*)::int AS count FROM ulc_linz_training_subject_deletion"
    );
    assert.equal(Number(markerAfterRollback[0]?.count), 0);
    await erase(false);
    assert.deepEqual(await counts(ORG, TARGET),
      { attendance: 0, registration: 0, history: 0 });
    assert.deepEqual(await counts(ORG, NEIGHBOR),
      { attendance: 1, registration: 1, history: 1 });
    assert.deepEqual(await counts(OTHER, TARGET),
      { attendance: 1, registration: 1, history: 1 });

    // The deletion marker is already expired by the time of this test. It
    // STILL prevents stale direct SQL and stale trainer/self-registration.
    for (const sql of [
      "INSERT INTO ulc_linz_training_attendance " +
        "(organization_id,session_id,athlete_id,status) " +
        "VALUES ('p03-d-org','session-owned','p03-d-athlete','present')",
      "INSERT INTO ulc_linz_training_registration " +
        "(organization_id,session_id,athlete_id,intention,updated_by_identity_id) " +
        "VALUES ('p03-d-org','session-owned','p03-d-athlete','attending','stale-writer')",
      "INSERT INTO ulc_linz_training_registration_change " +
        "(id,organization_id,session_id,athlete_id,intention,revision,actor_identity_id) " +
        "VALUES ('stale-change','p03-d-org','session-owned','p03-d-athlete'," +
        "'attending',2,'stale-writer')",
    ]) {
      await assert.rejects(database.client.unsafe(sql), /deletion marker/i);
    }

    // Even if a row exists for a neighboring subject, its owner cannot be
    // silently switched to the erased target or to another organization.
    await assert.rejects(database.client.unsafe(
      "UPDATE ulc_linz_training_registration SET athlete_id=$1 " +
      "WHERE organization_id=$2 AND athlete_id=$3",
      [TARGET, ORG, NEIGHBOR]
    ), /ownership is immutable/i);
    await database.client.unsafe(
      "UPDATE ulc_linz_training_registration SET intention='maybe' " +
      "WHERE organization_id=$1 AND athlete_id=$2",
      [ORG, NEIGHBOR]
    );
    assert.deepEqual(await counts(ORG, NEIGHBOR),
      { attendance: 1, registration: 1, history: 1 });

    await admin.client.unsafe("CREATE ROLE " + roleName + " NOLOGIN");
    createdRole = true;
    await database.client.unsafe("GRANT USAGE ON SCHEMA public TO " + roleName);
    for (const table of [
      "ulc_linz_training_attendance",
      "ulc_linz_training_registration",
      "ulc_linz_training_registration_change",
    ]) {
      await database.client.unsafe(
        "GRANT SELECT,INSERT,UPDATE ON " + table + " TO " + roleName
      );
    }
    const rights = await database.client.unsafe(
      "SELECT " +
      "has_table_privilege($1,'ulc_linz_training_subject_deletion','INSERT') AS may_insert_marker, " +
      "has_table_privilege($1,'ulc_linz_training_subject_deletion','UPDATE') AS may_update_marker, " +
      "has_table_privilege($1,'ulc_linz_training_subject_deletion','DELETE') AS may_delete_marker",
      [roleName]
    );
    assert.deepEqual(rights[0], {
      may_insert_marker: false, may_update_marker: false, may_delete_marker: false,
    });
    await assert.rejects(database.client.begin(async tx => {
      await tx.unsafe("SET LOCAL ROLE " + roleName);
      await tx.unsafe(
        "INSERT INTO ulc_linz_training_subject_deletion " +
        "(organization_id,athlete_id,completed_at,purge_after) " +
        "VALUES ('p03-d-org','forged','2026-01-01T07:00:00Z','2026-02-05T07:00:00Z')"
      );
    }), /permission denied/i);
    await assert.rejects(database.client.begin(async tx => {
      await tx.unsafe("SET LOCAL ROLE " + roleName);
      await tx.unsafe(
        "INSERT INTO ulc_linz_training_attendance " +
        "(organization_id,session_id,athlete_id,status) " +
        "VALUES ('p03-d-org','session-owned','p03-d-athlete','present')"
      );
    }), /deletion marker/i);
    assert.deepEqual(await counts(ORG, TARGET),
      { attendance: 0, registration: 0, history: 0 });
  } finally {
    if (database) await database.client.end().catch(() => {});
    if (createdDb) {
      await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
    }
    if (createdRole) await admin.client.unsafe("DROP ROLE " + roleName);
    await admin.client.end().catch(() => {});
  }
});
