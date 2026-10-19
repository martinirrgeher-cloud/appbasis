import {
  assertTrainingPlanCreationInvariant,
  compareTrainingPlanSnapshots,
  type TrainingPlanBlockRevision,
  type TrainingPlanCreateResult,
  type TrainingPlanExerciseRevision,
  type TrainingPlanItemRevision,
  type TrainingPlanLifecycleRepository,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanDeletionReplayResult,
  type TrainingPlanRevisionAppendResult,
  type TrainingPlanSnapshot,
  type TrainingPlanSubjectDeletionMarker,
  type TrainingPlanSubjectDeletionResult,
} from "./repository";

export type TrainingPlanSqlParameter =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export interface TrainingPlanPostgresQueryClient {
  unsafe(
    query: string,
    parameters?: TrainingPlanSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface TrainingPlanPostgresClient
  extends TrainingPlanPostgresQueryClient {
  begin<T>(
    callback: (transaction: TrainingPlanPostgresQueryClient) => Promise<T>,
  ): Promise<T>;
}

export class PostgresTrainingPlanRepository
  implements TrainingPlanRepository, TrainingPlanLifecycleRepository
{
  readonly #client: TrainingPlanPostgresClient;

  constructor(client: TrainingPlanPostgresClient) {
    this.#client = client;
  }

  async listCurrentBySubjectsDateRange(
    organizationId: string,
    subjectIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    if (subjectIds.length === 0) return Object.freeze([]);
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readCurrentPlans(
        transaction,
        organizationId,
        `AND plan.subject_id = ANY($2::text[])
         AND plan.plan_date >= $3::date
         AND plan.plan_date <= $4::date`,
        [subjectIds, fromDate, toDate],
      );
    });
  }

  async listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readCurrentPlans(
        transaction,
        organizationId,
        `AND plan.subject_id = $2
         AND plan.plan_date >= $3::date
         AND plan.plan_date <= $4::date`,
        [subjectId, fromDate, toDate],
      );
    });
  }

  async findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const plans = await readCurrentPlans(
        transaction,
        organizationId,
        "AND plan.id = $2",
        [planId],
      );
      return plans[0];
    });
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const plans = await readCurrentPlans(
        transaction,
        organizationId,
        `AND plan.subject_id = $2
         AND plan.plan_date = $3::date`,
        [subjectId, planDate],
      );
      return plans[0];
    });
  }

  async create(plan: TrainingPlanSnapshot): Promise<TrainingPlanCreateResult> {
    assertTrainingPlanCreationInvariant(plan);
    return this.#client.begin(async (transaction) => {
      await lockSubjectLifecycleScope(
        transaction,
        plan.organizationId,
        plan.subjectId,
      );
      if (
        await hasSubjectDeletionMarker(
          transaction,
          plan.organizationId,
          plan.subjectId,
        )
      ) {
        return Object.freeze({ status: "subject-deleted" as const });
      }
      const rows = await transaction.unsafe(
        `INSERT INTO appbasis_training_plan (
           id, organization_id, subject_id, plan_date,
           current_revision, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4::date, $5, $6::timestamptz, $7::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          plan.id,
          plan.organizationId,
          plan.subjectId,
          plan.planDate,
          plan.currentRevision,
          plan.createdAt,
          plan.updatedAt,
        ],
      );
      if (rows.length === 0) {
        const occupied = await transaction.unsafe(
          `SELECT id, current_revision
           FROM appbasis_training_plan
           WHERE organization_id = $1
             AND subject_id = $2
             AND plan_date = $3::date`,
          [plan.organizationId, plan.subjectId, plan.planDate],
        );
        if (occupied.length > 1) {
          throw new Error("Training plan target lookup returned multiple rows.");
        }
        if (occupied.length === 1) {
          return Object.freeze({
            status: "target-occupied" as const,
            planId: requiredString(occupied[0]!.id, "occupied plan id"),
            currentRevision: requiredInteger(
              occupied[0]!.current_revision,
              "occupied current revision",
            ),
          });
        }
        return Object.freeze({ status: "id-conflict" as const });
      }
      if (rows.length !== 1) {
        throw new Error("Training plan insert returned multiple rows.");
      }

      await insertRevision(transaction, plan.revision);
      return Object.freeze({
        status: "created" as const,
        plan: clonePlan(plan),
      });
    });
  }

  async appendRevision(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    revision: TrainingPlanRevision,
  ): Promise<TrainingPlanRevisionAppendResult> {
    return this.#client.begin(async (transaction) => {
      const subjectRows = await transaction.unsafe(
        `SELECT subject_id
         FROM appbasis_training_plan
         WHERE organization_id = $1
           AND id = $2`,
        [organizationId, planId],
      );
      if (subjectRows.length === 0) {
        return Object.freeze({ status: "not-found" as const });
      }
      if (subjectRows.length !== 1) {
        throw new Error("Training plan subject lookup returned multiple rows.");
      }
      const lockedSubjectId = requiredString(
        subjectRows[0]!.subject_id,
        "subject id",
      );
      await lockSubjectLifecycleScope(
        transaction,
        organizationId,
        lockedSubjectId,
      );
      if (
        await hasSubjectDeletionMarker(
          transaction,
          organizationId,
          lockedSubjectId,
        )
      ) {
        return Object.freeze({ status: "not-found" as const });
      }

      const rows = await transaction.unsafe(
        `SELECT subject_id,
                to_char(plan_date, 'YYYY-MM-DD') AS plan_date,
                current_revision,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM appbasis_training_plan
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, planId],
      );
      if (rows.length === 0) {
        return Object.freeze({ status: "not-found" as const });
      }
      if (rows.length !== 1) {
        throw new Error("Training plan lock returned multiple rows.");
      }

      const row = rows[0]!;
      if (requiredString(row.subject_id, "subject id") !== lockedSubjectId) {
        throw new Error("Training plan subject changed during lifecycle locking.");
      }
      const currentRevision = requiredInteger(
        row.current_revision,
        "current revision",
      );
      if (currentRevision !== expectedRevision) {
        return Object.freeze({
          status: "conflict" as const,
          currentRevision,
        });
      }
      if (
        revision.organizationId !== organizationId ||
        revision.planId !== planId ||
        revision.revision !== expectedRevision + 1
      ) {
        throw new Error(
          "Training plan next revision escaped the locked plan scope.",
        );
      }

      await insertRevision(transaction, revision);
      const updated = await transaction.unsafe(
        `UPDATE appbasis_training_plan
         SET current_revision = $3,
             updated_at = $4::timestamptz
         WHERE organization_id = $1
           AND id = $2
           AND current_revision = $5
         RETURNING id`,
        [
          organizationId,
          planId,
          revision.revision,
          revision.createdAt,
          expectedRevision,
        ],
      );
      if (updated.length !== 1) {
        throw new Error("Training plan current revision update was not atomic.");
      }

      return Object.freeze({
        status: "updated" as const,
        plan: Object.freeze({
          id: planId,
          organizationId,
          subjectId: requiredString(row.subject_id, "subject id"),
          planDate: requiredDateString(row.plan_date, "plan date"),
          currentRevision: revision.revision,
          createdAt: normalizedTimestamp(
            requiredString(row.created_at, "created timestamp"),
          ),
          updatedAt: revision.createdAt,
          revision: cloneRevision(revision),
        }),
      });
    });
  }

  async listRevisions(
    organizationId: string,
    planId: string,
  ): Promise<readonly TrainingPlanRevision[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const rows = await transaction.unsafe(
        `SELECT organization_id, plan_id, revision, note,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS revision_created_at
         FROM appbasis_training_plan_revision
         WHERE organization_id = $1
           AND plan_id = $2
         ORDER BY revision DESC`,
        [organizationId, planId],
      );
      const refs = rows.map((row) => ({
        planId: requiredString(row.plan_id, "revision plan id"),
        revision: requiredInteger(row.revision, "revision number"),
      }));
      const items = await readRevisionItems(transaction, organizationId, refs);
      return Object.freeze(
        rows.map((row) =>
          revisionFromRow(
            row,
            organizationId,
            planId,
            requiredInteger(row.revision, "revision number"),
            items.get(
              revisionKey(
                planId,
                requiredInteger(row.revision, "revision number"),
              ),
            ) ?? Object.freeze([]),
          ),
        ),
      );
    });
  }

  async findRevision(
    organizationId: string,
    planId: string,
    revision: number,
  ): Promise<TrainingPlanRevision | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const rows = await transaction.unsafe(
        `SELECT organization_id, plan_id, revision, note,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS revision_created_at
         FROM appbasis_training_plan_revision
         WHERE organization_id = $1
           AND plan_id = $2
           AND revision = $3`,
        [organizationId, planId, revision],
      );
      if (rows.length === 0) return undefined;
      if (rows.length !== 1) {
        throw new Error("Training plan revision lookup returned multiple rows.");
      }
      const items = await readRevisionItems(transaction, organizationId, [
        { planId, revision },
      ]);
      return revisionFromRow(
        rows[0]!,
        organizationId,
        planId,
        revision,
        items.get(revisionKey(planId, revision)) ?? Object.freeze([]),
      );
    });
  }

  async deleteSubjectData(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingPlanSubjectDeletionResult> {
    return this.#client.begin(async (transaction) => {
      await lockSubjectLifecycleScope(
        transaction,
        organizationId,
        subjectId,
      );
      const completed = requiredLifecycleDate(completedAt);
      await transaction.unsafe(
        `INSERT INTO appbasis_training_plan_subject_deletion (
           organization_id, subject_id, completed_at, purge_after
         )
         VALUES (
           $1, $2, $3::timestamptz,
           $3::timestamptz + interval '840 hours'
         )
         ON CONFLICT (organization_id, subject_id) DO NOTHING`,
        [organizationId, subjectId, completed.toISOString()],
      );
      return deleteSubjectPlans(transaction, organizationId, subjectId);
    });
  }

  async listCurrentDeletionMarkers(
    now: Date,
  ): Promise<readonly TrainingPlanSubjectDeletionMarker[]> {
    const current = requiredLifecycleDate(now);
    const rows = await this.#client.unsafe(
      `SELECT organization_id,
              subject_id,
              completed_at,
              purge_after
       FROM appbasis_training_plan_subject_deletion
       WHERE purge_after >= $1::timestamptz
       ORDER BY organization_id ASC, subject_id ASC`,
      [current.toISOString()],
    );
    return Object.freeze(rows.map(deletionMarkerFromRow));
  }

  async reconcileDeletionMarker(
    marker: TrainingPlanSubjectDeletionMarker,
  ): Promise<TrainingPlanDeletionReplayResult> {
    const normalized = requiredDeletionMarker(marker);
    return this.#client.begin(async (transaction) => {
      await lockSubjectLifecycleScope(
        transaction,
        normalized.organizationId,
        normalized.subjectId,
      );
      const existing = await transaction.unsafe(
        `SELECT completed_at, purge_after
         FROM appbasis_training_plan_subject_deletion
         WHERE organization_id = $1
           AND subject_id = $2
         FOR UPDATE`,
        [normalized.organizationId, normalized.subjectId],
      );
      if (existing.length > 1) {
        throw new Error("Training plan deletion marker lookup returned multiple rows.");
      }
      let markerInserted = false;
      if (existing.length === 0) {
        const inserted = await transaction.unsafe(
          `INSERT INTO appbasis_training_plan_subject_deletion (
             organization_id, subject_id, completed_at, purge_after
           )
           VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
           RETURNING subject_id`,
          [
            normalized.organizationId,
            normalized.subjectId,
            normalized.completedAt.toISOString(),
            normalized.purgeAfter.toISOString(),
          ],
        );
        if (inserted.length !== 1) {
          throw new Error("Training plan deletion marker replay insert failed.");
        }
        markerInserted = true;
      } else {
        const row = existing[0]!;
        if (
          requiredStoredDate(row.completed_at).getTime() !==
            normalized.completedAt.getTime() ||
          requiredStoredDate(row.purge_after).getTime() !==
            normalized.purgeAfter.getTime()
        ) {
          throw new Error(
            "Training plan deletion marker conflicts with existing state.",
          );
        }
      }

      const deleted = await deleteSubjectPlans(
        transaction,
        normalized.organizationId,
        normalized.subjectId,
      );
      return Object.freeze({ markerInserted, ...deleted });
    });
  }

  async purgeExpiredDeletionMarkers(now: Date): Promise<number> {
    const current = requiredLifecycleDate(now);
    const rows = await this.#client.unsafe(
      `DELETE FROM appbasis_training_plan_subject_deletion
       WHERE purge_after < $1::timestamptz
       RETURNING subject_id`,
      [current.toISOString()],
    );
    return rows.length;
  }

}

async function hasSubjectDeletionMarker(
  transaction: TrainingPlanPostgresQueryClient,
  organizationId: string,
  subjectId: string,
): Promise<boolean> {
  const rows = await transaction.unsafe(
    `SELECT 1 AS present
     FROM appbasis_training_plan_subject_deletion
     WHERE organization_id = $1
       AND subject_id = $2`,
    [organizationId, subjectId],
  );
  if (rows.length > 1) {
    throw new Error("Training plan deletion marker lookup returned multiple rows.");
  }
  return rows.length === 1;
}

async function deleteSubjectPlans(
  transaction: TrainingPlanPostgresQueryClient,
  organizationId: string,
  subjectId: string,
): Promise<TrainingPlanSubjectDeletionResult> {
  const plans = await transaction.unsafe(
    `SELECT id
     FROM appbasis_training_plan
     WHERE organization_id = $1
       AND subject_id = $2
     ORDER BY id ASC
     FOR UPDATE`,
    [organizationId, subjectId],
  );
  if (plans.length === 0) {
    return Object.freeze({
      deletedPlans: 0,
      deletedRevisions: 0,
      deletedItems: 0,
    });
  }

  const planIds = plans.map((row) => requiredString(row.id, "plan id"));
  const targets = JSON.stringify(planIds);
  const deletedItems = await transaction.unsafe(
    `WITH target AS (
       SELECT value AS plan_id
       FROM jsonb_array_elements_text($2::jsonb)
     )
     DELETE FROM appbasis_training_plan_revision_item AS item
     USING target
     WHERE item.organization_id = $1
       AND item.plan_id = target.plan_id
     RETURNING item.plan_id`,
    [organizationId, targets],
  );
  const deletedRevisions = await transaction.unsafe(
    `WITH target AS (
       SELECT value AS plan_id
       FROM jsonb_array_elements_text($2::jsonb)
     )
     DELETE FROM appbasis_training_plan_revision AS revision
     USING target
     WHERE revision.organization_id = $1
       AND revision.plan_id = target.plan_id
     RETURNING revision.plan_id`,
    [organizationId, targets],
  );
  const deletedPlans = await transaction.unsafe(
    `WITH target AS (
       SELECT value AS plan_id
       FROM jsonb_array_elements_text($2::jsonb)
     )
     DELETE FROM appbasis_training_plan AS plan
     USING target
     WHERE plan.organization_id = $1
       AND plan.id = target.plan_id
       AND plan.subject_id = $3
     RETURNING plan.id`,
    [organizationId, targets, subjectId],
  );

  if (deletedPlans.length !== planIds.length) {
    throw new Error("Training plan subject deletion lost its locked plan scope.");
  }
  return Object.freeze({
    deletedPlans: deletedPlans.length,
    deletedRevisions: deletedRevisions.length,
    deletedItems: deletedItems.length,
  });
}

function deletionMarkerFromRow(
  row: Record<string, unknown>,
): TrainingPlanSubjectDeletionMarker {
  return requiredDeletionMarker({
    organizationId: requiredString(row.organization_id, "deletion organization id"),
    subjectId: requiredString(row.subject_id, "deletion subject id"),
    completedAt: requiredStoredDate(row.completed_at),
    purgeAfter: requiredStoredDate(row.purge_after),
  });
}

function requiredDeletionMarker(
  marker: TrainingPlanSubjectDeletionMarker,
): TrainingPlanSubjectDeletionMarker {
  const organizationId = requiredString(
    marker.organizationId,
    "deletion organization id",
  );
  const subjectId = requiredString(marker.subjectId, "deletion subject id");
  const completedAt = requiredLifecycleDate(marker.completedAt);
  const purgeAfter = requiredLifecycleDate(marker.purgeAfter);
  if (
    purgeAfter.getTime() - completedAt.getTime() !==
    35 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("Training plan deletion marker retention is invalid.");
  }
  return Object.freeze({
    organizationId,
    subjectId,
    completedAt,
    purgeAfter,
  });
}

function requiredLifecycleDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Training plan lifecycle clock is invalid.");
  }
  return new Date(value.getTime());
}

function requiredStoredDate(value: unknown): Date {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "string"
        ? new Date(value)
        : null;
  if (date === null || !Number.isFinite(date.getTime())) {
    throw new Error("Training plan lifecycle timestamp is invalid.");
  }
  return date;
}

async function lockSubjectLifecycleScope(
  transaction: TrainingPlanPostgresQueryClient,
  organizationId: string,
  subjectId: string,
): Promise<void> {
  await transaction.unsafe(
    "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0::bigint))",
    [JSON.stringify([organizationId, subjectId])],
  );
}

async function readCurrentPlans(
  client: TrainingPlanPostgresQueryClient,
  organizationId: string,
  condition: string,
  parameters: TrainingPlanSqlParameter[],
): Promise<readonly TrainingPlanSnapshot[]> {
  const rows = await client.unsafe(
    `SELECT plan.id,
            plan.organization_id,
            plan.subject_id,
            to_char(plan.plan_date, 'YYYY-MM-DD') AS plan_date,
            plan.current_revision,
            to_char(plan.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(plan.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
            revision.note AS revision_note,
            to_char(revision.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS revision_created_at
     FROM appbasis_training_plan AS plan
     INNER JOIN appbasis_training_plan_revision AS revision
       ON revision.organization_id = plan.organization_id
      AND revision.plan_id = plan.id
      AND revision.revision = plan.current_revision
     WHERE plan.organization_id = $1
       ${condition}
     ORDER BY plan.plan_date ASC, plan.id ASC`,
    [organizationId, ...parameters],
  );

  const refs = rows.map((row) => ({
    planId: requiredString(row.id, "plan id"),
    revision: requiredInteger(row.current_revision, "current revision"),
  }));
  const itemMap = await readRevisionItems(client, organizationId, refs);
  return Object.freeze(
    rows
      .map((row) => {
        const planId = requiredString(row.id, "plan id");
        const revision = requiredInteger(
          row.current_revision,
          "current revision",
        );
        return Object.freeze({
          id: planId,
          organizationId: scopedOrganization(
            row.organization_id,
            organizationId,
          ),
          subjectId: requiredString(row.subject_id, "subject id"),
          planDate: requiredDateString(row.plan_date, "plan date"),
          currentRevision: revision,
          createdAt: normalizedTimestamp(
            requiredString(row.created_at, "created timestamp"),
          ),
          updatedAt: normalizedTimestamp(
            requiredString(row.updated_at, "updated timestamp"),
          ),
          revision: Object.freeze({
            organizationId,
            planId,
            revision,
            note: optionalString(row.revision_note, "revision note"),
            items:
              itemMap.get(revisionKey(planId, revision)) ??
              Object.freeze([]),
            createdAt: normalizedTimestamp(
              requiredString(
                row.revision_created_at,
                "revision created timestamp",
              ),
            ),
          }),
        });
      })
      .sort(compareTrainingPlanSnapshots),
  );
}

async function readRevisionItems(
  client: TrainingPlanPostgresQueryClient,
  organizationId: string,
  refs: readonly { readonly planId: string; readonly revision: number }[],
): Promise<ReadonlyMap<string, readonly TrainingPlanItemRevision[]>> {
  if (refs.length === 0) return new Map();

  const rows = await client.unsafe(
    `WITH target AS (
       SELECT plan_id, revision
       FROM jsonb_to_recordset($2::jsonb) AS payload(
         plan_id text,
         revision integer
       )
     )
     SELECT item.organization_id,
            item.plan_id,
            item.revision,
            item.item_id,
            item.item_kind,
            item.parent_block_item_id,
            item.sort_order,
            item.name,
            item.source_block_id,
            item.source_block_revision,
            item.source_exercise_id,
            item.duration_minutes,
            item.note,
            item.sets_value,
            item.repetitions_value,
            item.amount_value,
            item.unit_value,
            item.comment
     FROM appbasis_training_plan_revision_item AS item
     INNER JOIN target
       ON target.plan_id = item.plan_id
      AND target.revision = item.revision
     WHERE item.organization_id = $1
     ORDER BY item.plan_id ASC,
              item.revision ASC,
              item.sort_order ASC,
              item.item_id ASC`,
    [
      organizationId,
      JSON.stringify(
        refs.map((ref) => ({
          plan_id: ref.planId,
          revision: ref.revision,
        })),
      ),
    ],
  );

  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    scopedOrganization(row.organization_id, organizationId);
    const planId = requiredString(row.plan_id, "item plan id");
    const revision = requiredInteger(row.revision, "item revision");
    const key = revisionKey(planId, revision);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }

  const result = new Map<string, readonly TrainingPlanItemRevision[]>();
  for (const ref of refs) {
    const key = revisionKey(ref.planId, ref.revision);
    result.set(key, assembleItems(grouped.get(key) ?? []));
  }
  return result;
}

function assembleItems(
  rows: readonly Record<string, unknown>[],
): readonly TrainingPlanItemRevision[] {
  type MutableBlock = Omit<TrainingPlanBlockRevision, "exercises"> & {
    exercises: TrainingPlanExerciseRevision[];
  };

  const topLevel: (TrainingPlanExerciseRevision | MutableBlock)[] = [];
  const blocks = new Map<string, MutableBlock>();
  const exerciseRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    const kind = requiredString(row.item_kind, "item kind");
    if (kind === "block") {
      const sourceBlockId = optionalString(
        row.source_block_id,
        "source block id",
      );
      const sourceBlockRevision = optionalInteger(
        row.source_block_revision,
        "source block revision",
      );
      if ((sourceBlockId === null) !== (sourceBlockRevision === null)) {
        throw new Error("Training plan block provenance has an invalid shape.");
      }
      if (optionalString(row.parent_block_item_id, "block parent") !== null) {
        throw new Error("Training plan block unexpectedly has a parent.");
      }
      const block: MutableBlock = {
        kind: "block",
        itemId: requiredString(row.item_id, "block item id"),
        sourceBlockId,
        sourceBlockRevision,
        name: requiredString(row.name, "block name"),
        durationMinutes: optionalInteger(
          row.duration_minutes,
          "block duration",
        ),
        note: optionalString(row.note, "block note"),
        exercises: [],
        sortOrder: requiredInteger(row.sort_order, "block sort order"),
      };
      if (blocks.has(block.itemId)) {
        throw new Error("Training plan contains a duplicate block item id.");
      }
      blocks.set(block.itemId, block);
      topLevel.push(block);
      continue;
    }
    if (kind === "exercise") {
      exerciseRows.push(row);
      continue;
    }
    throw new Error("Training plan item kind has an invalid shape.");
  }

  for (const row of exerciseRows) {
    const exercise = exerciseFromRow(row);
    const parentId = optionalString(
      row.parent_block_item_id,
      "exercise parent",
    );
    if (parentId === null) {
      topLevel.push(exercise);
      continue;
    }
    const block = blocks.get(parentId);
    if (block === undefined) {
      throw new Error("Training plan exercise parent block is missing.");
    }
    block.exercises.push(exercise);
  }

  return Object.freeze(
    topLevel
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.itemId.localeCompare(right.itemId),
      )
      .map((item) =>
        item.kind === "exercise"
          ? Object.freeze({ ...item })
          : Object.freeze({
              ...item,
              exercises: Object.freeze(
                item.exercises
                  .sort(
                    (left, right) =>
                      left.sortOrder - right.sortOrder ||
                      left.itemId.localeCompare(right.itemId),
                  )
                  .map((exercise) => Object.freeze({ ...exercise })),
              ),
            }),
      ),
  );
}

function exerciseFromRow(
  row: Record<string, unknown>,
): TrainingPlanExerciseRevision {
  if (
    row.source_block_id !== null &&
    row.source_block_id !== undefined
  ) {
    throw new Error("Training plan exercise unexpectedly has block provenance.");
  }
  return Object.freeze({
    kind: "exercise",
    itemId: requiredString(row.item_id, "exercise item id"),
    sourceExerciseId: optionalString(
      row.source_exercise_id,
      "source exercise id",
    ),
    name: requiredString(row.name, "exercise name"),
    sets: optionalString(row.sets_value, "exercise sets"),
    repetitions: optionalString(
      row.repetitions_value,
      "exercise repetitions",
    ),
    amount: optionalString(row.amount_value, "exercise amount"),
    unit: optionalString(row.unit_value, "exercise unit"),
    comment: optionalString(row.comment, "exercise comment"),
    sortOrder: requiredInteger(row.sort_order, "exercise sort order"),
  });
}

async function insertRevision(
  transaction: TrainingPlanPostgresQueryClient,
  revision: TrainingPlanRevision,
): Promise<void> {
  const rows = await transaction.unsafe(
    `INSERT INTO appbasis_training_plan_revision (
       organization_id, plan_id, revision, note, created_at
     )
     VALUES ($1, $2, $3, $4, $5::timestamptz)
     RETURNING revision`,
    [
      revision.organizationId,
      revision.planId,
      revision.revision,
      revision.note,
      revision.createdAt,
    ],
  );
  if (rows.length !== 1) {
    throw new Error("Training plan revision insert failed.");
  }

  const payload = revision.items.flatMap((item) => {
    if (item.kind === "exercise") {
      return [itemPayload(revision, item, null)];
    }
    return [
      blockPayload(revision, item),
      ...item.exercises.map((exercise) =>
        itemPayload(revision, exercise, item.itemId),
      ),
    ];
  });
  if (payload.length === 0) return;

  await transaction.unsafe(
    `INSERT INTO appbasis_training_plan_revision_item (
       organization_id, plan_id, revision, item_id, item_kind,
       parent_block_item_id, sort_order, name,
       source_block_id, source_block_revision, source_exercise_id,
       duration_minutes, note, sets_value, repetitions_value,
       amount_value, unit_value, comment
     )
     SELECT payload.organization_id,
            payload.plan_id,
            payload.revision,
            payload.item_id,
            payload.item_kind,
            payload.parent_block_item_id,
            payload.sort_order,
            payload.name,
            payload.source_block_id,
            payload.source_block_revision,
            payload.source_exercise_id,
            payload.duration_minutes,
            payload.note,
            payload.sets_value,
            payload.repetitions_value,
            payload.amount_value,
            payload.unit_value,
            payload.comment
     FROM jsonb_to_recordset($1::jsonb) AS payload(
       organization_id text,
       plan_id text,
       revision integer,
       item_id text,
       item_kind text,
       parent_block_item_id text,
       sort_order integer,
       name text,
       source_block_id text,
       source_block_revision integer,
       source_exercise_id text,
       duration_minutes integer,
       note text,
       sets_value text,
       repetitions_value text,
       amount_value text,
       unit_value text,
       comment text
     )`,
    [JSON.stringify(payload)],
  );
}

function blockPayload(
  revision: TrainingPlanRevision,
  block: TrainingPlanBlockRevision,
): Record<string, string | number | null> {
  return {
    organization_id: revision.organizationId,
    plan_id: revision.planId,
    revision: revision.revision,
    item_id: block.itemId,
    item_kind: "block",
    parent_block_item_id: null,
    sort_order: block.sortOrder,
    name: block.name,
    source_block_id: block.sourceBlockId,
    source_block_revision: block.sourceBlockRevision,
    source_exercise_id: null,
    duration_minutes: block.durationMinutes,
    note: block.note,
    sets_value: null,
    repetitions_value: null,
    amount_value: null,
    unit_value: null,
    comment: null,
  };
}

function itemPayload(
  revision: TrainingPlanRevision,
  exercise: TrainingPlanExerciseRevision,
  parentBlockItemId: string | null,
): Record<string, string | number | null> {
  return {
    organization_id: revision.organizationId,
    plan_id: revision.planId,
    revision: revision.revision,
    item_id: exercise.itemId,
    item_kind: "exercise",
    parent_block_item_id: parentBlockItemId,
    sort_order: exercise.sortOrder,
    name: exercise.name,
    source_block_id: null,
    source_block_revision: null,
    source_exercise_id: exercise.sourceExerciseId,
    duration_minutes: null,
    note: null,
    sets_value: exercise.sets,
    repetitions_value: exercise.repetitions,
    amount_value: exercise.amount,
    unit_value: exercise.unit,
    comment: exercise.comment,
  };
}

function revisionFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  planId: string,
  revision: number,
  items: readonly TrainingPlanItemRevision[],
): TrainingPlanRevision {
  const rowPlanId = requiredString(row.plan_id, "revision plan id");
  if (rowPlanId !== planId) {
    throw new Error("Training plan revision escaped its plan scope.");
  }
  scopedOrganization(row.organization_id, expectedOrganizationId);
  return Object.freeze({
    organizationId: expectedOrganizationId,
    planId,
    revision,
    note: optionalString(row.note, "revision note"),
    items: cloneItems(items),
    createdAt: normalizedTimestamp(
      requiredString(row.revision_created_at, "revision timestamp"),
    ),
  });
}

function clonePlan(plan: TrainingPlanSnapshot): TrainingPlanSnapshot {
  return Object.freeze({ ...plan, revision: cloneRevision(plan.revision) });
}

function cloneRevision(revision: TrainingPlanRevision): TrainingPlanRevision {
  return Object.freeze({
    ...revision,
    items: cloneItems(revision.items),
  });
}

function cloneItems(
  items: readonly TrainingPlanItemRevision[],
): readonly TrainingPlanItemRevision[] {
  return Object.freeze(
    items.map((item) =>
      item.kind === "exercise"
        ? Object.freeze({ ...item })
        : Object.freeze({
            ...item,
            exercises: Object.freeze(
              item.exercises.map((exercise) =>
                Object.freeze({ ...exercise }),
              ),
            ),
          }),
    ),
  );
}

function revisionKey(planId: string, revision: number): string {
  return planId + "\u0000" + String(revision);
}

function scopedOrganization(value: unknown, expected: string): string {
  const actual = requiredString(value, "organization id");
  if (actual !== expected) {
    throw new Error("Training plan row escaped organization scope.");
  }
  return actual;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Training plan ${label} has an invalid shape.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Training plan ${label} has an invalid shape.`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Training plan ${label} has an invalid shape.`);
  }
  return value;
}

function optionalInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return requiredInteger(value, label);
}

function requiredDateString(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) {
    throw new Error(`Training plan ${label} has an invalid shape.`);
  }
  return date;
}

function normalizedTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Training plan timestamp has an invalid shape.");
  }
  return parsed.toISOString();
}
