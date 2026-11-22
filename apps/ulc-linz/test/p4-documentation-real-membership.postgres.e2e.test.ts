import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { PostgresPermissionStore } from "@appbasis/permissions";
import {
  PostgresTrainingDocumentationRepository,
  TrainingDocumentationService,
} from "@appbasis/training-documentation";

import {
  createUlcLinzTrainingDocumentationAccessService,
} from "../worker/training-documentation-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";
import {
  assertUlcLiveTrainingDocumentationActor,
  UlcTrainingDocumentationActorWriteBlockedError,
} from "../worker/training-documentation-write-actor";

/**
 * Genuine SQL membership, role, capability, revoke and subject-scope decisions
 * for the ACTUAL training-documentation worker access service.
 *
 * No fake SQL resolver; no production Worker/Neon; no actual member credentials;
 * does not prove browser login, provider DPA, erasure or runtime HTTP admission.
 */
const baseUrl = process.env.DATABASE_URL;
const describeLocal = baseUrl ? describe : describe.skip;
if (baseUrl) {
  const url = new URL(baseUrl);
  if (
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.port !== "5432" ||
    url.username !== "postgres" ||
    url.pathname !== "/appbasis_identity_e2e"
  ) {
    throw new Error("P4 documentation authorization rehearsal accepts only the disposable CI PostgreSQL.");
  }
}

describeLocal("P4 documentation real membership and capability SQL authorization", () => {
  const rootAdmin = baseUrl ? createPostgresDatabase(baseUrl) : null;
  const name = "ulc_p4_documentation_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const localUrl = baseUrl ? new URL(baseUrl) : null;
  if (localUrl) localUrl.pathname = "/" + name;
  type Database = ReturnType<typeof createPostgresDatabase>;
  let testDb: Database | null = null;
  let created = false;
  let counter = 0;

  function db(): Database {
    if (!testDb) throw new Error("Disposable documentation authorization PostgreSQL unavailable.");
    return testDb;
  }

  function current(identityId: string): UlcLinzCurrentIdentity {
    const date = new Date("2026-11-21T06:00:00.000Z");
    return {
      identity: {
        identityId,
        username: "p4." + identityId,
        displayName: "Synthetic P4 Role",
        contactEmail: null,
        personId: null,
        mustChangePassword: false,
        createdAt: date,
        updatedAt: date,
        passwordChangedAt: date,
        disabledAt: null,
        accountStatus: "active",
      },
      sessionToken: "appbasis.session=synthetic-p4-" + identityId,
      access: "full",
    };
  }

  function access() {
    const sql = db().client;
    const scopes = new PostgresUlcLinzScopePersistence(sql);
    return createUlcLinzTrainingDocumentationAccessService({
      sql,
      permissions: new PostgresPermissionStore(sql),
      memberships: scopes,
      subjectScopes: scopes,
    });
  }

  type Role = "trainer" | "functionary" | "athlete" | "parent";
  async function member(role: Role, org = "synthetic-p4-org") {
    const id = "p4-documentation-" + String(++counter);
    const subject = id + "-subject";
    await db().client.unsafe(
      `INSERT INTO ulc_linz_membership
        (identity_id, organization_id, subject_id, source_role)
       VALUES ($1,$2,$3,$4)`,
      [id, org, subject, role],
    );
    await db().client.unsafe(
      "INSERT INTO appbasis_permission_principal(principal_id) VALUES ($1)", [id],
    );
    await db().client.unsafe(
      `INSERT INTO appbasis_permission_principal_role(principal_id,role_id)
       VALUES ($1,$2)`, [id, "ulc-linz:" + role],
    );
    return { id, subject, org };
  }

  beforeAll(async () => {
    if (!rootAdmin || !localUrl) throw new Error("Missing disposable local database.");
    const exists = await rootAdmin.client.unsafe(
      "SELECT 1 AS present FROM pg_database WHERE datname=$1", [name],
    );
    if (exists.length) throw new Error("Refusing to reuse an existing P4 test database.");
    await rootAdmin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    testDb = createPostgresDatabase(localUrl.toString());

    const manifest = JSON.parse(await readFile(
      new URL("../appbasis.database.json", import.meta.url), "utf8",
    )) as { owners: readonly { migrations: readonly string[] }[] };
    const files = manifest.owners.flatMap(x => x.migrations);
    if (files.length !== 47 || new Set(files).size !== 47) {
      throw new Error("P4 requires the exact current 47-migration manifest.");
    }
    for (const file of files) {
      const body = await readFile(new URL("../../../" + file, import.meta.url), "utf8");
      for (const sql of body.split("--> statement-breakpoint")) {
        if (sql.trim()) await db().client.unsafe(sql);
      }
    }
    const tables = await db().client.unsafe(
      "SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'",
    );
    if (tables[0]?.count !== 69) throw new Error("P4 requires 69 real PostgreSQL tables.");

    for (const role of ["trainer", "functionary", "athlete", "parent"]) {
      await db().client.unsafe(
        "INSERT INTO appbasis_permission_role(role_id) VALUES ($1)", ["ulc-linz:" + role],
      );
    }
    const view = "ulc-linz:module:training_documentation:view";
    const edit = "ulc-linz:module:training_documentation:edit";
    for (const capability of [view, edit]) {
      await db().client.unsafe(
        "INSERT INTO appbasis_permission_capability(capability_id) VALUES ($1)",
        [capability],
      );
    }
    for (const role of ["trainer", "athlete"]) {
      for (const capability of [view, edit]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_permission_role_capability(role_id,capability_id)
           VALUES ($1,$2)`, ["ulc-linz:" + role, capability],
        );
      }
    }
    for (const role of ["functionary", "parent"]) {
      await db().client.unsafe(
        `INSERT INTO appbasis_permission_role_capability(role_id,capability_id)
         VALUES ($1,$2)`, ["ulc-linz:" + role, view],
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (testDb) { await testDb.client.end(); testDb = null; }
    if (rootAdmin) {
      try {
        if (created) await rootAdmin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      } finally {
        await rootAdmin.client.end();
      }
    }
  }, 120_000);

  it("allows trainer to view and edit using actual membership and PostgreSQL roles", async () => {
    const person = await member("trainer");
    await expect(access().assertViewAccess(current(person.id))).resolves.toMatchObject({
      organizationId: person.org, actorPrincipalId: person.id, subjectId: null, canEdit: true,
    });
    await expect(access().assertEditAccess(current(person.id))).resolves.toMatchObject({
      organizationId: person.org, actorPrincipalId: person.id, subjectId: null, canEdit: true,
    });
  });

  it("allows functionary to view but denies editing without capability", async () => {
    const person = await member("functionary");
    await expect(access().assertViewAccess(current(person.id))).resolves.toMatchObject({
      organizationId: person.org, subjectId: null, canEdit: false,
    });
    await expect(access().assertEditAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("revokes actual trainer edit access while preserving only view", async () => {
    const person = await member("trainer");
    await db().client.unsafe(
      `INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id)
       VALUES ($1,'ulc-linz:module:training_documentation:edit')`,
      [person.id],
    );
    await expect(access().assertEditAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(access().assertViewAccess(current(person.id))).resolves.toMatchObject({
      canEdit: false,
    });
  });

  it("rejects inactive membership even with valid capability and principal role", async () => {
    const person = await member("trainer");
    await db().client.unsafe(
      `UPDATE ulc_linz_membership SET active=false, ended_at=now()
       WHERE identity_id=$1`, [person.id],
    );
    await expect(access().assertEditAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("enforces the real membership lifecycle CHECK and denies correctly ended accounts", async () => {
    const person = await member("trainer");
    // The persisted table already prevents the inconsistent state. Never
    // bypass its constraint merely to exercise a hypothetical stale row.
    await expect(db().client.unsafe(
      `UPDATE ulc_linz_membership SET ended_at=now()
       WHERE identity_id=$1 AND active=true`, [person.id],
    )).rejects.toThrow(/ulc_linz_membership_lifecycle_state_check/);

    // The failed statement is atomic; an otherwise active account remains
    // usable until a legitimate lifecycle transition deactivates it.
    const active = await new PostgresUlcLinzScopePersistence(db().client)
      .resolveMembership({ identityId: person.id, organizationId: person.org });
    expect(active?.active).toBe(true);

    await db().client.unsafe(
      `UPDATE ulc_linz_membership SET active=false, ended_at=now()
       WHERE identity_id=$1`, [person.id],
    );
    const ended = await new PostgresUlcLinzScopePersistence(db().client)
      .resolveMembership({ identityId: person.id, organizationId: person.org });
    expect(ended?.active).toBe(false);
    await expect(access().assertViewAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(access().assertEditAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("rejects SQL role drift from canonical source membership", async () => {
    const person = await member("trainer");
    await db().client.unsafe(
      `UPDATE appbasis_permission_principal_role
       SET role_id='ulc-linz:functionary' WHERE principal_id=$1`, [person.id],
    );
    await expect(access().assertViewAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("requires explicit matching self-subject scope for athlete access", async () => {
    const person = await member("athlete", "synthetic-p4-athlete-org");
    await expect(access().assertViewAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await db().client.unsafe(
      `INSERT INTO ulc_linz_subject_scope
       (identity_id,organization_id,subject_id,relation_type)
       VALUES ($1,$2,$3,'self')`,
      [person.id, person.org, "different-subject"],
    );
    await expect(access().assertEditAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await db().client.unsafe(
      `INSERT INTO ulc_linz_subject_scope
       (identity_id,organization_id,subject_id,relation_type)
       VALUES ($1,$2,$3,'self')`,
      [person.id, person.org, person.subject],
    );
    await expect(access().assertEditAccess(current(person.id))).resolves.toMatchObject({
      subjectId: person.subject, organizationId: person.org, canEdit: true,
    });
  });

  it("denies organization-wide parent access even if SQL grants the view capability", async () => {
    const person = await member("parent");
    await expect(access().assertViewAccess(current(person.id)))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("rechecks a real trainer's SQL role and blocks a later direct revoke in the same write transaction", async () => {
    const person = await member("trainer");
    const scope = {
      organizationId: person.org,
      subjectId: "synthetic-p4-target",
      authenticatedIdentityId: person.id,
    };
    await expect(db().client.begin(async transaction =>
      assertUlcLiveTrainingDocumentationActor(transaction, scope),
    )).resolves.toBeUndefined();

    await db().client.unsafe(
      `INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id)
       VALUES ($1,'ulc-linz:module:training_documentation:edit')`, [person.id],
    );
    await expect(db().client.begin(async transaction =>
      assertUlcLiveTrainingDocumentationActor(transaction, scope),
    )).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
  });

  it("blocks an in-flight canonical role mutation while the SQL actor write holds its principal lock", async () => {
    const person = await member("trainer");
    await db().client.begin(async transaction => {
      await assertUlcLiveTrainingDocumentationActor(transaction, {
        organizationId: person.org,
        subjectId: "synthetic-p4-target",
        authenticatedIdentityId: person.id,
      });
      await expect(db().client.begin(async concurrent => {
        await concurrent.unsafe("SET LOCAL lock_timeout = '120ms'");
        await concurrent.unsafe(
          "SELECT principal_id FROM appbasis_permission_principal " +
          "WHERE principal_id=$1 FOR UPDATE",
          [person.id],
        );
      })).rejects.toThrow(/lock timeout/i);
    });
  });

  it("admits only the athlete's own subject with a persisted self-scope row", async () => {
    const person = await member("athlete");
    const scope = {
      organizationId: person.org,
      subjectId: person.subject,
      authenticatedIdentityId: person.id,
    };
    await expect(db().client.begin(async transaction =>
      assertUlcLiveTrainingDocumentationActor(transaction, scope),
    )).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    await db().client.unsafe(
      `INSERT INTO ulc_linz_subject_scope
       (identity_id,organization_id,subject_id,relation_type)
       VALUES ($1,$2,$3,'self')`, [person.id, person.org, person.subject],
    );
    await expect(db().client.begin(async transaction =>
      assertUlcLiveTrainingDocumentationActor(transaction, scope),
    )).resolves.toBeUndefined();
    await expect(db().client.begin(async transaction =>
      assertUlcLiveTrainingDocumentationActor(transaction, {
        ...scope, subjectId: "foreign-subject",
      }),
    )).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
  });

  it("atomically rejects a revoked trainer's next real document revision without saving data", async () => {
    const person = await member("trainer");
    const docs = new TrainingDocumentationService({
      repository: new PostgresTrainingDocumentationRepository(db().client, {
        writeGuard: assertUlcLiveTrainingDocumentationActor,
      }),
      createId: () => "p03-atomic-document-" + randomUUID(),
      now: () => new Date("2026-11-21T10:00:00.000Z"),
    });

    const doc = await docs.create(person.org, {
      subjectId: "p03-atomic-athlete",
      sessionDate: "2026-11-21",
      sourcePlanId: "p03-verified-source",
      sourcePlanRevision: 1,
    }, person.id);
    expect(doc).toMatchObject({ currentRevision: 1, status: "draft" });

    await db().client.unsafe(
      `INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id)
       VALUES ($1,'ulc-linz:module:training_documentation:edit')`,
      [person.id],
    );
    await expect(docs.update(person.org, doc.id, 1, {
      note: "Must not persist after revoke",
    }, person.id)).rejects.toBeInstanceOf(
      UlcTrainingDocumentationActorWriteBlockedError,
    );
    const revisions = await db().client.unsafe(
      `SELECT COUNT(*)::int AS count
       FROM appbasis_training_documentation_revision
       WHERE organization_id=$1 AND documentation_id=$2`,
      [person.org, doc.id],
    );
    expect(revisions).toEqual([{ count: 1 }]);
    expect((await docs.findCurrent(person.org, doc.id))?.currentRevision).toBe(1);
  });

  it("rejects a real document INSERT without trusted HTTP actor, leaving no root", async () => {
    const docs = new TrainingDocumentationService({
      repository: new PostgresTrainingDocumentationRepository(db().client, {
        writeGuard: assertUlcLiveTrainingDocumentationActor,
      }),
      createId: () => "p03-no-http-actor-" + randomUUID(),
    });
    const totalBefore = await db().client.unsafe(
      "SELECT COUNT(*)::int AS count FROM appbasis_training_documentation",
    );
    await expect(docs.create("synthetic-p4-org", {
      subjectId: "p03-denied-subject",
      sessionDate: "2026-11-21",
      sourcePlanId: "p03-denied-source",
      sourcePlanRevision: 1,
    })).rejects.toBeInstanceOf(UlcTrainingDocumentationActorWriteBlockedError);
    const totalAfter = await db().client.unsafe(
      "SELECT COUNT(*)::int AS count FROM appbasis_training_documentation",
    );
    expect(totalAfter).toEqual(totalBefore);
  });

  it("keeps test-created documentation explicitly revision-scoped", async () => {
    const counts = await db().client.unsafe(
      `SELECT (SELECT COUNT(*)::int FROM appbasis_training_documentation) AS roots,
              (SELECT COUNT(*)::int FROM appbasis_training_documentation_revision) AS revisions`,
    );
    expect(counts).toEqual([{ roots: 1, revisions: 1 }]);
  });
});
