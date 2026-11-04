import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingDocumentationRepository,
  reconcileTrainingDocumentationRestoredDatabase,
  TrainingDocumentationConflictError,
  TrainingDocumentationService,
  TrainingDocumentationTargetOccupiedError,
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error(
    "DATABASE_URL is required for training-documentation PostgreSQL E2E tests.",
  );
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_training_documentation_" +
  randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const applicationRole = "appbasis_tdoc_app_" + randomUUID().replaceAll("-", "").slice(0, 12);
const applicationPassword = "tdoc" + randomUUID().replaceAll("-", "");
let applicationRoleCreated = false;

beforeAll(async () => {
  await administrativeConnection.client.unsafe(
    "CREATE DATABASE " + isolatedDatabaseName,
  );
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  const migration = await readFile(
    new URL(
      "../migrations/0000_appbasis_training_documentation_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await requiredConnection().client.unsafe(migration);
  const subjectMigration = await readFile(
    new URL(
      "../migrations/0001_appbasis_training_documentation_subject_deletion.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await requiredConnection().client.unsafe(subjectMigration);

  // Separate migration-owner and normal application principals: a successful
  // owner write must not hide a missing nested-function EXECUTE grant.
  await administrativeConnection.client.unsafe(
    `CREATE ROLE ${applicationRole} LOGIN PASSWORD '${applicationPassword}'`,
  );
  applicationRoleCreated = true;
  await requiredConnection().client.unsafe(
    `GRANT CONNECT ON DATABASE ${isolatedDatabaseName} TO ${applicationRole}`,
  );
  await requiredConnection().client.unsafe(
    `GRANT USAGE ON SCHEMA public TO ${applicationRole}`,
  );
  await requiredConnection().client.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE
       ON appbasis_training_documentation, appbasis_training_documentation_revision
       TO ${applicationRole}`,
  );
});

beforeEach(async () => {
  await requiredConnection().client.unsafe(
    `TRUNCATE TABLE
       appbasis_training_documentation_revision,
       appbasis_training_documentation,
       appbasis_training_documentation_subject_deletion
       CASCADE`,
  );
});

afterAll(async () => {
  if (isolatedConnection !== null) {
    await isolatedConnection.client.end();
    isolatedConnection = null;
  }
  if (isolatedDatabaseCreated) {
    await administrativeConnection.client.unsafe(
      "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
    );
  }
  if (applicationRoleCreated) {
    await administrativeConnection.client.unsafe(
      "DROP ROLE " + applicationRole,
    );
  }
  await administrativeConnection.client.end();
});

describe("training-documentation PostgreSQL repository", () => {
  it("replays a newer deletion over a simulated older restore, including every foreign-owner revision", async () => {
    const organization = "org-offline-doc-restore";
    const removed = "athlete-restore-target";
    const survivor = "athlete-restore-survivor";
    const otherOrg = "org-offline-foreign";
    const createFixtures = async () => {
      const service = serviceFor(requiredConnection(), [
        "doc-restore-root", "doc-restore-survivor", "doc-restore-foreign",
      ]);
      const root = await service.create(organization, {
        subjectId: removed, sessionDate: "2026-10-26",
        sourcePlanId: "plan-root", sourcePlanRevision: 1,
        attendance: [{ participantId: removed, displayName: "Erased A", status: "present" }],
      });
      const other = await service.create(organization, {
        subjectId: survivor, sessionDate: "2026-10-27",
        sourcePlanId: "plan-other", sourcePlanRevision: 1,
        note: "Keep my unrelated note",
        attendance: [
          { participantId: survivor, displayName: "Survivor", status: "present" },
          { participantId: removed, displayName: "Erased B", status: "absent" },
        ],
      });
      await service.update(organization, other.id, 1, {
        attendance: [
          { participantId: removed, displayName: "Erased C", status: "present" },
          { participantId: survivor, displayName: "Survivor", status: "present" },
        ],
      });
      const foreign = await service.create(otherOrg, {
        subjectId: survivor, sessionDate: "2026-10-28",
        sourcePlanId: "plan-foreign", sourcePlanRevision: 1,
        attendance: [{ participantId: removed, displayName: "Foreign", status: "present" }],
      });
      return { root, other, foreign };
    };

    const first = await createFixtures();
    const repository = repositoryFor(requiredConnection());
    const completedAt = new Date(Date.now() - 3_600_000);
    await repository.removeSubjectDataAfterVerifiedDeletion(
      organization, removed, completedAt,
    );
    const now = new Date();
    const authoritative = await repository.listSubjectDeletionMarkers(now);
    expect(authoritative).toHaveLength(1);
    expect(authoritative[0]).toMatchObject({
      organizationId: organization,
      subjectId: removed,
      completedAt,
    });

    // Simulate an isolated restore to a point before the deletion. The
    // authoritative marker snapshot is held separately and stays immutable.
    await requiredConnection().client.unsafe(
      `TRUNCATE TABLE appbasis_training_documentation_revision,
         appbasis_training_documentation,
         appbasis_training_documentation_subject_deletion CASCADE`,
    );
    const old = await createFixtures();
    expect(old.root.id).toBe(first.root.id);
    const source = { async listSubjectDeletionMarkers() { return authoritative; } };
    const result = await reconcileTrainingDocumentationRestoredDatabase(
      source, repository, now,
    );
    expect(result).toEqual({
      requiredDeletionCount: 1,
      insertedMarkerCount: 1,
      deletedDocuments: 1,
      deletedRevisions: 1,
      redactedOtherSubjectRevisions: 2,
    });
    await expect(repository.inspectSubjectPrivacy(organization, removed))
      .resolves.toMatchObject({
        ownedDocuments: 0,
        ownedRevisions: 0,
        otherSubjectDocumentsWithParticipant: 0,
        otherSubjectRevisionsWithParticipant: 0,
      });
    const service = serviceFor(requiredConnection(), []);
    expect(await service.findCurrent(organization, old.root.id)).toBeUndefined();
    const history = await service.listRevisions(organization, old.other.id);
    expect(history).toHaveLength(2);
    expect(history.every((entry) =>
      entry.attendance.length === 1 &&
      entry.attendance[0]?.participantId === survivor &&
      !JSON.stringify(entry).includes("Erased")
    )).toBe(true);
    expect(history[1]?.note).toBe("Keep my unrelated note");
    await expect(service.listRevisions(otherOrg, old.foreign.id))
      .resolves.toMatchObject([{
        attendance: [{ participantId: removed, displayName: "Foreign" }],
      }]);

    await expect(service.create(organization, {
      subjectId: removed, sessionDate: "2026-10-29",
      sourcePlanId: "stale-editor", sourcePlanRevision: 1,
    })).rejects.toThrow(/deletion marker/);
    await expect(service.update(organization, old.other.id, 2, {
      attendance: [{ participantId: removed, displayName: "Erased again", status: "present" }],
    })).rejects.toThrow(/deletion marker/);

    await expect(reconcileTrainingDocumentationRestoredDatabase(
      source, repository, now,
    )).resolves.toEqual({
      requiredDeletionCount: 1,
      insertedMarkerCount: 0,
      deletedDocuments: 0,
      deletedRevisions: 0,
      redactedOtherSubjectRevisions: 0,
    });
    const conflicting = {
      ...authoritative[0]!,
      completedAt: new Date(completedAt.getTime() - 1_000),
      purgeAfter: new Date(completedAt.getTime() - 1_000 + 35 * 24 * 60 * 60 * 1000),
    };
    await expect(repository.reconcileSubjectDeletionMarker(conflicting))
      .rejects.toThrow(/conflicts/);
  });

  it("reads and replays expired but unpurged marker decisions", async () => {
    const repo = repositoryFor(requiredConnection());
    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await requiredConnection().client.unsafe(
      `INSERT INTO appbasis_training_documentation_subject_deletion
       (organization_id, subject_id, completed_at, purge_after)
       VALUES ($1, $2, $3::timestamptz, $3::timestamptz + interval '840 hours')`,
      ["org-expired-restore", "athlete-expired", past.toISOString()],
    );
    const source = await repo.listSubjectDeletionMarkers(new Date());
    expect(source).toHaveLength(1);
    expect(source[0]?.purgeAfter.getTime()).toBeLessThan(Date.now());
    await requiredConnection().client.unsafe(
      "DELETE FROM appbasis_training_documentation_subject_deletion",
    );
    const service = serviceFor(requiredConnection(), ["doc-expired-restored"]);
    const doc = await service.create("org-expired-restore", {
      subjectId: "athlete-expired",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-expired",
      sourcePlanRevision: 1,
    });
    await expect(reconcileTrainingDocumentationRestoredDatabase(
      { async listSubjectDeletionMarkers() { return source; } },
      repo, new Date(),
    )).resolves.toMatchObject({
      requiredDeletionCount: 1, deletedDocuments: 1, deletedRevisions: 1,
    });
    expect(await service.findCurrent("org-expired-restore", doc.id)).toBeUndefined();
  });

  it("revokes PUBLIC EXECUTE for all module-owned deletion guard functions", async () => {
    const rows = await requiredConnection().client.unsafe(
      `SELECT p.proname,
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(
            COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
          ) AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute_revoked
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = p.pronamespace
      WHERE namespace.nspname = 'public'
        AND p.proname IN (
          'appbasis_training_documentation_guard_subject',
          'appbasis_training_documentation_guard_root_insert',
          'appbasis_training_documentation_guard_revision_write'
        ) ORDER BY p.proname`,
    );
    expect(rows.map((row) => ({
      name: row.proname, revoked: row.public_execute_revoked,
    }))).toEqual([
      { name: "appbasis_training_documentation_guard_revision_write", revoked: true },
      { name: "appbasis_training_documentation_guard_root_insert", revoked: true },
      { name: "appbasis_training_documentation_guard_subject", revoked: true },
    ]);
  });


  it("allows normal application writers without direct access to private deletion guards", async () => {
    const url = new URL(isolatedDatabaseUrl);
    url.username = applicationRole;
    url.password = applicationPassword;
    const appConnection = createPostgresDatabase(url.toString());
    try {
      const permissions = await appConnection.client.unsafe(
        `SELECT current_user AS role_name,
           has_function_privilege(
             'public.appbasis_training_documentation_guard_subject(text,text)',
             'EXECUTE'
           ) AS can_execute_guard,
           has_table_privilege(
             'public.appbasis_training_documentation_subject_deletion',
             'SELECT'
           ) AS can_read_marker`,
      );
      expect(permissions[0]).toMatchObject({
        role_name: applicationRole,
        can_execute_guard: false,
        can_read_marker: false,
      });
      await expect(appConnection.client.unsafe(
        "SELECT public.appbasis_training_documentation_guard_subject($1, $2)",
        ["org-runtime", "athlete-app"],
      )).rejects.toThrow(/permission denied/i);

      const service = serviceFor(appConnection, ["doc-normal-application"]);
      const created = await service.create("org-runtime", {
        subjectId: "athlete-app",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-runtime",
        sourcePlanRevision: 1,
        attendance: [
          { participantId: "athlete-app", displayName: "Participant", status: "present" },
        ],
      });
      await expect(service.update("org-runtime", created.id, 1, {
        note: "Application role can still append revisions",
      })).resolves.toMatchObject({ currentRevision: 2 });
    } finally {
      await appConnection.client.end();
    }
  });

  it("rejects direct runtime UPDATE before the privacy erasure's organization lock can deadlock", async () => {
    const organization = "org-direct-update-race";
    const deletedSubject = "athlete-to-erase";
    const saved = await serviceFor(requiredConnection(), ["doc-update-race"]).create(
      organization, {
        subjectId: "other-athlete",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-update-race",
        sourcePlanRevision: 1,
        attendance: [{
          participantId: deletedSubject, displayName: "Removed", status: "present",
        }],
      },
    );
    const url = new URL(isolatedDatabaseUrl);
    url.username = applicationRole;
    url.password = applicationPassword;
    const app = createPostgresDatabase(url.toString());
    try {
      // Simulate the org advisory lock held by an in-flight erasure. The
      // offending direct SQL UPDATE has taken its tuple lock before its
      // BEFORE ROW trigger; it must reject, never wait for this org lock.
      await requiredConnection().client.begin(async (holder) => {
        await holder.unsafe(
          "SELECT pg_advisory_xact_lock(202611031, hashtext($1::text))",
          [organization],
        );
        await expect(app.client.begin(async (writer) => {
          await writer.unsafe("SET LOCAL lock_timeout = '750ms'");
          // Custom GUC by itself is not privileged: the login role must
          // also be the trigger owner, which the application role is not.
          await writer.unsafe(
            "SELECT set_config('appbasis.training_documentation_privileged_revision_update', 'on', true)",
          );
          await writer.unsafe(
            `UPDATE appbasis_training_documentation_revision
               SET attendance_json = '[]'::jsonb
             WHERE organization_id = $1
               AND documentation_id = $2
               AND revision = 1`,
            [organization, saved.id],
          );
        })).rejects.toThrow(/updates require privileged erasure/i);

        await expect(app.client.begin(async (writer) => {
          await writer.unsafe("SET LOCAL lock_timeout = '750ms'");
          await writer.unsafe(
            `UPDATE appbasis_training_documentation
               SET subject_id = subject_id
             WHERE organization_id = $1 AND id = $2`,
            [organization, saved.id],
          );
        })).rejects.toThrow(/root ownership is immutable/i);
      });

      const cleared = await repositoryFor(requiredConnection())
        .removeSubjectDataAfterVerifiedDeletion(
          organization, deletedSubject, new Date(Date.now() - 3_600_000),
        );
      expect(cleared.redactedOtherSubjectRevisions).toBe(1);
      const revisions = await serviceFor(requiredConnection(), [])
        .listRevisions(organization, saved.id);
      expect(revisions[0]?.attendance).toEqual([]);
    } finally {
      await app.client.end();
    }
  }, 15000);

  it("serializes two overlapping cross-participant creates without deadlocking", async () => {
    const left = createPostgresDatabase(isolatedDatabaseUrl);
    const right = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const attendance = [
        { participantId: "athlete-A", displayName: "A", status: "present" as const },
        { participantId: "athlete-B", displayName: "B", status: "present" as const },
      ];
      const [a, b] = await Promise.all([
        serviceFor(left, ["doc-deadlock-A"]).create("org-deadlock", {
          subjectId: "athlete-A",
          sessionDate: "2026-10-26",
          sourcePlanId: "plan-A",
          sourcePlanRevision: 1,
          attendance,
        }),
        serviceFor(right, ["doc-deadlock-B"]).create("org-deadlock", {
          subjectId: "athlete-B",
          sessionDate: "2026-10-26",
          sourcePlanId: "plan-B",
          sourcePlanRevision: 1,
          attendance,
        }),
      ]);
      expect([a.id, b.id]).toEqual(["doc-deadlock-A", "doc-deadlock-B"]);
      const count = await requiredConnection().client.unsafe(
        `SELECT count(*)::int AS total
           FROM appbasis_training_documentation
           WHERE organization_id = 'org-deadlock'`,
      );
      expect(count[0]?.total).toBe(2);
    } finally {
      await left.client.end();
      await right.client.end();
    }
  }, 15000);

  it("atomically deletes owned documentation and redacts matching third-party attendance in every historical revision", async () => {
    const organization = "org-privacy-delete";
    const subject = "subject-privacy-target";
    const victimName = "Sensitive Person To Remove";
    const service = serviceFor(requiredConnection(), [
      "doc-privacy-subject", "doc-privacy-other", "doc-privacy-foreign",
    ]);
    const own = await service.create(organization, {
      subjectId: subject,
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-owned", sourcePlanRevision: 1,
      note: "Private owner's training note",
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    });
    const other = await service.create(organization, {
      subjectId: "different-athlete",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-other", sourcePlanRevision: 1,
      note: "Keep unrelated training note",
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
        { participantId: "different-athlete", displayName: "Person Kept", status: "excused" },
      ],
    });
    await service.update(organization, other.id, 1, {
      note: "Keep newer unrelated note",
      attendance: [
        { participantId: "different-athlete", displayName: "Person Kept", status: "present" },
        { participantId: subject, displayName: victimName, status: "absent" },
      ],
    });
    const foreign = await service.create("other-organization", {
      subjectId: "different-athlete",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-foreign", sourcePlanRevision: 1,
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    });

    const repository = repositoryFor(requiredConnection());
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 1, ownedRevisions: 1,
        otherSubjectDocumentsWithParticipant: 1,
        otherSubjectRevisionsWithParticipant: 2,
      });
    const completedAt = new Date(Date.now() - 3_600_000);
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, completedAt,
    )).resolves.toEqual({
      markerInserted: true,
      deletedDocuments: 1, deletedRevisions: 1,
      redactedOtherSubjectRevisions: 2,
    });
    await expect(service.findCurrent(organization, own.id)).resolves.toBeUndefined();
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 0, ownedRevisions: 0,
        otherSubjectDocumentsWithParticipant: 0,
        otherSubjectRevisionsWithParticipant: 0,
      });
    const historical = await service.listRevisions(organization, other.id);
    expect(historical).toHaveLength(2);
    expect(historical.every((rev) =>
      rev.attendance.length === 1 &&
      rev.attendance[0]?.participantId === "different-athlete" &&
      !JSON.stringify(rev).includes(victimName)
    )).toBe(true);
    expect(historical.map((rev) => rev.note)).toEqual([
      "Keep newer unrelated note", "Keep unrelated training note",
    ]);
    await expect(service.listRevisions("other-organization", foreign.id))
      .resolves.toMatchObject([{
        attendance: [{ participantId: subject, displayName: victimName }],
      }]);
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, completedAt,
    )).resolves.toEqual({
      markerInserted: false,
      deletedDocuments: 0, deletedRevisions: 0,
      redactedOtherSubjectRevisions: 0,
    });
    // The v2 triggers block the previously live editor's stale snapshot.
    await expect(service.create(organization, {
      subjectId: subject, sessionDate: "2026-10-28",
      sourcePlanId: "plan-reborn", sourcePlanRevision: 1,
    })).rejects.toThrow(/deletion marker/i);
    await expect(service.update(organization, other.id, 2, {
      attendance: [
        { participantId: subject, displayName: victimName, status: "present" },
      ],
    })).rejects.toThrow(/deletion marker/i);
    // An unrelated athlete can still update their documentation.
    await expect(service.update(organization, other.id, 2, {
      note: "Other athlete can edit",
    })).resolves.toMatchObject({ currentRevision: 3 });
    await expect(repository.removeSubjectDataAfterVerifiedDeletion(
      organization, subject, new Date(completedAt.getTime() - 1_000),
    )).rejects.toThrow(/conflicts/i);
    await expect(repository.inspectSubjectPrivacy(organization, subject))
      .resolves.toMatchObject({
        ownedDocuments: 0, otherSubjectRevisionsWithParticipant: 0,
      });
  });

  it("rejects missing provenance, expired timestamps and stale direct SQL subject resurrection", async () => {
    const repo = repositoryFor(requiredConnection());
    const now = new Date();
    for (const date of [
      new Date(NaN),
      new Date(now.getTime() + 60_000),
      new Date(now.getTime() - 36 * 24 * 60 * 60 * 1000),
    ]) {
      await expect(repo.removeSubjectDataAfterVerifiedDeletion(
        "org-invalid", "athlete-one", date,
      )).rejects.toThrow();
    }
    await expect(repo.removeSubjectDataAfterVerifiedDeletion(
      "org-invalid", "", now,
    )).rejects.toThrow();
    const service = serviceFor(requiredConnection(), ["doc-writer-barrier"]);
    const saved = await service.create("org-direct", {
      subjectId: "other-athlete", sessionDate: "2026-10-26",
      sourcePlanId: "plan-direct", sourcePlanRevision: 1,
    });
    const removedAt = new Date(Date.now() - 3_600_000);
    await repo.removeSubjectDataAfterVerifiedDeletion(
      "org-direct", "athlete-private", removedAt,
    );
    // Even a direct database revision insert outside the application service
    // cannot reintroduce a deletion-marked participant.
    await expect(requiredConnection().client.unsafe(
      `INSERT INTO appbasis_training_documentation_revision (
          organization_id, documentation_id, revision, status, note,
          items_json, attendance_json, created_at
        ) VALUES ($1, $2, 2, 'draft', NULL, '[]'::jsonb,
          $3::jsonb, now())`,
      ["org-direct", saved.id, JSON.stringify([
        { participantId: "athlete-private", displayName: "Private", status: "present" },
      ])],
    )).rejects.toThrow(/deletion marker/i);
    // Direct SQL cannot reassign root or revision ownership to bypass the
    // subject-scoped marker, even when ordinary service API omits that path.
    await expect(requiredConnection().client.unsafe(
      `UPDATE appbasis_training_documentation
         SET subject_id = $3
         WHERE organization_id = $1 AND id = $2`,
      ["org-direct", saved.id, "athlete-private"],
    )).rejects.toThrow(/ownership is immutable/i);
    await expect(requiredConnection().client.unsafe(
      `UPDATE appbasis_training_documentation_revision
         SET organization_id = $3
         WHERE organization_id = $1 AND documentation_id = $2`,
      ["org-direct", saved.id, "other-org"],
    )).rejects.toThrow(/ownership is immutable/i);
    await expect(service.listRevisions("org-direct", saved.id))
      .resolves.toHaveLength(1);
    await expect(repo.removeSubjectDataAfterVerifiedDeletion(
      "other-org", "athlete-private", removedAt,
    )).resolves.toMatchObject({ markerInserted: true, deletedDocuments: 0 });
  });

  it("persists plan provenance, actual values and completion revisions", async () => {
    const service = serviceFor(requiredConnection(), ["documentation-1"]);

    const created = await service.create("org-1", {
      subjectId: "athlete-1",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      note: "Plan übernommen",
      items: [
        {
          kind: "exercise",
          sourceItemId: "item-1",
          sourceExerciseId: "exercise-1",
          name: "30 m Sprint",
          plannedRepetitions: "6",
          actualRepetitions: "6",
          performed: true,
        },
      ],
      attendance: [
        {
          participantId: "athlete-1",
          displayName: "Anna Beispiel",
          status: "present",
        },
      ],
    });

    expect(created).toMatchObject({
      currentRevision: 1,
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      status: "draft",
    });

    const updated = await service.update("org-1", created.id, 1, {
      note: "Eine Wiederholung weniger",
      items: [
        {
          kind: "exercise",
          sourceItemId: "item-1",
          sourceExerciseId: "exercise-1",
          name: "30 m Sprint",
          plannedRepetitions: "6",
          actualRepetitions: "5",
          performed: true,
        },
      ],
    });
    expect(updated).toMatchObject({
      currentRevision: 2,
      revision: {
        note: "Eine Wiederholung weniger",
        items: [{ actualRepetitions: "5" }],
      },
    });

    const completed = await service.complete("org-1", created.id, 2);
    expect(completed).toMatchObject({
      currentRevision: 3,
      status: "completed",
    });
    expect(completed?.completedAt).toMatch(/^2026-10-26T10:/);

    const current = await service.findCurrent("org-1", created.id);
    expect(current).toMatchObject({
      sourcePlanId: "plan-1",
      sourcePlanRevision: 4,
      currentRevision: 3,
      status: "completed",
      revision: {
        items: [{ plannedRepetitions: "6", actualRepetitions: "5" }],
        attendance: [{ participantId: "athlete-1", status: "present" }],
      },
    });

    const revisions = await service.listRevisions("org-1", created.id);
    expect(revisions.map((entry) => entry.revision)).toEqual([3, 2, 1]);

    const reopened = await service.reopen("org-1", created.id, 3);
    expect(reopened).toMatchObject({
      currentRevision: 4,
      status: "draft",
      completedAt: null,
    });
  });

  it("serializes stale updates and protects one subject/day target", async () => {
    const seed = serviceFor(requiredConnection(), [
      "documentation-race",
      "documentation-target-a",
    ]);
    await seed.create("org-race", {
      subjectId: "athlete-race",
      sessionDate: "2026-10-26",
      sourcePlanId: "plan-race",
      sourcePlanRevision: 1,
    });

    const leftConnection = createPostgresDatabase(isolatedDatabaseUrl);
    const rightConnection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      const left = serviceFor(leftConnection, []);
      const right = serviceFor(rightConnection, []);
      const updates = await Promise.allSettled([
        left.update("org-race", "documentation-race", 1, { note: "Left" }),
        right.update("org-race", "documentation-race", 1, { note: "Right" }),
      ]);
      expect(updates.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
      const rejected = updates.find((entry) => entry.status === "rejected");
      expect(rejected).toMatchObject({ status: "rejected" });
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(TrainingDocumentationConflictError);
      }
    } finally {
      await leftConnection.client.end();
      await rightConnection.client.end();
    }

    const first = await seed.create("org-target", {
      subjectId: "athlete-target",
      sessionDate: "2026-10-27",
      sourcePlanId: "plan-a",
      sourcePlanRevision: 1,
    });
    expect(first.id).toBe("documentation-target-a");

    const duplicateService = serviceFor(requiredConnection(), [
      "documentation-target-b",
    ]);
    await expect(
      duplicateService.create("org-target", {
        subjectId: "athlete-target",
        sessionDate: "2026-10-27",
        sourcePlanId: "plan-b",
        sourcePlanRevision: 1,
      }),
    ).rejects.toBeInstanceOf(TrainingDocumentationTargetOccupiedError);
  });

  it("reads dates and timestamps independently of session formatting", async () => {
    const connection = createPostgresDatabase(isolatedDatabaseUrl);
    try {
      await connection.client.unsafe("SET DateStyle TO 'German, DMY'");
      await connection.client.unsafe("SET TIME ZONE 'Europe/Vienna'");
      const service = serviceFor(connection, ["documentation-format"]);
      const created = await service.create("org-format", {
        subjectId: "athlete-format",
        sessionDate: "2026-10-26",
        sourcePlanId: "plan-format",
        sourcePlanRevision: 1,
      });
      await expect(
        service.findCurrent("org-format", created.id),
      ).resolves.toMatchObject({
        sessionDate: "2026-10-26",
        createdAt: "2026-10-26T10:00:00.000Z",
      });
    } finally {
      await connection.client.end();
    }
  });
});

function repositoryFor(connection: ReturnType<typeof createPostgresDatabase>) {
  return new PostgresTrainingDocumentationRepository({
    unsafe(query, parameters) {
      return connection.client.unsafe(query, parameters);
    },
    begin(callback) {
      return connection.client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  });
}

function serviceFor(
  connection: ReturnType<typeof createPostgresDatabase>,
  ids: readonly string[],
) {
  let idIndex = 0;
  let minute = 0;
  return new TrainingDocumentationService({
    repository: new PostgresTrainingDocumentationRepository({
      unsafe(query, parameters) {
        return connection.client.unsafe(query, parameters);
      },
      begin(callback) {
        return connection.client.begin(async (transaction) =>
          callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }),
        );
      },
    }),
    createId: () => ids[idIndex++] ?? "unused-" + String(idIndex),
    now: () =>
      new Date(
        "2026-10-26T10:" + String(minute++).padStart(2, "0") + ":00.000Z",
      ),
  });
}

function requiredConnection() {
  if (isolatedConnection === null) {
    throw new Error("Training documentation test database is unavailable.");
  }
  return isolatedConnection;
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}
