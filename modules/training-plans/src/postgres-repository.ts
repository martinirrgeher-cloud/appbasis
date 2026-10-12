import {
  assertTrainingPlanCreationInvariant,
  assertTrainingPlanRevisionInvariant,
  compareTrainingPlanSnapshots,
  type TrainingPlanCreateResult,
  type TrainingPlanListQuery,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanRevisionAppendResult,
  type TrainingPlanRevisionItem,
  type TrainingPlanSnapshot,
} from "./repository";

export type TrainingPlanSqlParameter = string | number | boolean | null;

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

export class PostgresTrainingPlanRepository implements TrainingPlanRepository {
  readonly #client: TrainingPlanPostgresClient;

  constructor(client: TrainingPlanPostgresClient) {
    this.#client = client;
  }

  async listCurrent(
    organizationId: string,
    query: TrainingPlanListQuery = {},
  ): Promise<readonly TrainingPlanSnapshot[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readCurrentPlans(transaction, organizationId, query);
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
        {},
        planId,
      );
      return plans[0];
    });
  }

  async findForSubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const plans = await readCurrentPlans(transaction, organizationId, {
        subjectId,
        fromDate: planDate,
        toDate: planDate,
      });
      if (plans.length > 1) {
        throw new Error(
          "Training plan subject/date lookup returned multiple rows.",
        );
      }
      return plans[0];
    });
  }

  async create(plan: TrainingPlanSnapshot): Promise<TrainingPlanCreateResult> {
    assertTrainingPlanCreationInvariant(plan);
    return this.#client.begin(async (transaction) => {
      const inserted = await transaction.unsafe(
        `INSERT INTO appbasis_training_plan (
           id, organization_id, subject_id, plan_date, current_revision,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4::date, $5, $6::timestamptz, $7::timestamptz)
         ON CONFLICT (organization_id, subject_id, plan_date)
         DO NOTHING
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
      if (inserted.length === 0) {
        const existing = await readCurrentPlans(
          transaction,
          plan.organizationId,
          {
            subjectId: plan.subjectId,
            fromDate: plan.planDate,
            toDate: plan.planDate,
          },
        );
        if (existing.length !== 1 || existing[0] === undefined) {
          throw new Error(
            "Training plan target conflict could not be resolved.",
          );
        }
        return Object.freeze({
          status: "target-exists" as const,
          plan: existing[0],
        });
      }
      if (inserted.length !== 1) {
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
      const rows = await transaction.unsafe(
        `SELECT subject_id, plan_date::text AS plan_date,
                current_revision, created_at::text AS created_at
         FROM appbasis_training_plan
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, planId],
      );
      if (rows.length === 0) {
        return Object.freeze({ status: "not-found" as const });
      }
      if (rows.length !== 1 || rows[0] === undefined) {
        throw new Error("Training plan lock returned multiple rows.");
      }
      const row = rows[0];
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
      assertTrainingPlanRevisionInvariant(revision);

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
        throw new Error(
          "Training plan current revision update was not atomic.",
        );
      }

      return Object.freeze({
        status: "updated" as const,
        plan: Object.freeze({
          id: planId,
          organizationId,
          subjectId: requiredString(row.subject_id, "subject id"),
          planDate: requiredString(row.plan_date, "plan date"),
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
      return readRevisions(transaction, organizationId, planId);
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
      const revisions = await readRevisions(
        transaction,
        organizationId,
        planId,
        revision,
      );
      return revisions[0];
    });
  }
}

async function readCurrentPlans(
  client: TrainingPlanPostgresQueryClient,
  organizationId: string,
  query: TrainingPlanListQuery,
  planId?: string,
): Promise<readonly TrainingPlanSnapshot[]> {
  const parameters: TrainingPlanSqlParameter[] = [organizationId];
  const filters: string[] = [];
  if (planId !== undefined) {
    parameters.push(planId);
    filters.push(`plan.id = $${parameters.length}`);
  }
  if (query.subjectId !== undefined) {
    parameters.push(query.subjectId);
    filters.push(`plan.subject_id = $${parameters.length}`);
  }
  if (query.fromDate !== undefined) {
    parameters.push(query.fromDate);
    filters.push(`plan.plan_date >= $${parameters.length}::date`);
  }
  if (query.toDate !== undefined) {
    parameters.push(query.toDate);
    filters.push(`plan.plan_date <= $${parameters.length}::date`);
  }
  const suffix =
    filters.length === 0 ? "" : " AND " + filters.join(" AND ");

  const rows = await client.unsafe(
    `SELECT plan.id, plan.organization_id, plan.subject_id,
            plan.plan_date::text AS plan_date, plan.current_revision,
            plan.created_at::text AS plan_created_at,
            plan.updated_at::text AS plan_updated_at,
            revision.note,
            revision.created_at::text AS revision_created_at
     FROM appbasis_training_plan AS plan
     INNER JOIN appbasis_training_plan_revision AS revision
       ON revision.organization_id = plan.organization_id
      AND revision.plan_id = plan.id
      AND revision.revision = plan.current_revision
     WHERE plan.organization_id = $1${suffix}
     ORDER BY plan.plan_date ASC, plan.subject_id ASC, plan.id ASC`,
    parameters,
  );
  if (rows.length === 0) return Object.freeze([]);

  const planIds = rows.map((row) => requiredString(row.id, "plan id"));
  const items = await readRevisionItems(
    client,
    organizationId,
    planIds,
    true,
  );
  const plans = rows.map((row) => {
    const id = requiredString(row.id, "plan id");
    const revisionNumber = requiredInteger(
      row.current_revision,
      "current revision",
    );
    return Object.freeze({
      id,
      organizationId: scopedOrganization(
        row.organization_id,
        organizationId,
      ),
      subjectId: requiredString(row.subject_id, "subject id"),
      planDate: requiredString(row.plan_date, "plan date"),
      currentRevision: revisionNumber,
      createdAt: normalizedTimestamp(
        requiredString(row.plan_created_at, "plan created timestamp"),
      ),
      updatedAt: normalizedTimestamp(
        requiredString(row.plan_updated_at, "plan updated timestamp"),
      ),
      revision: Object.freeze({
        organizationId,
        planId: id,
        revision: revisionNumber,
        note: optionalString(row.note, "revision note"),
        items:
          items.get(revisionKey(id, revisionNumber)) ??
          Object.freeze([]),
        createdAt: normalizedTimestamp(
          requiredString(
            row.revision_created_at,
            "revision created timestamp",
          ),
        ),
      }),
    });
  });
  plans.sort(compareTrainingPlanSnapshots);
  return Object.freeze(plans);
}

async function readRevisions(
  client: TrainingPlanPostgresQueryClient,
  organizationId: string,
  planId: string,
  revision?: number,
): Promise<readonly TrainingPlanRevision[]> {
  const parameters: TrainingPlanSqlParameter[] = [organizationId, planId];
  const revisionFilter =
    revision === undefined
      ? ""
      : (() => {
          parameters.push(revision);
          return ` AND revision = $${parameters.length}`;
        })();
  const rows = await client.unsafe(
    `SELECT organization_id, plan_id, revision, note,
            created_at::text AS revision_created_at
     FROM appbasis_training_plan_revision
     WHERE organization_id = $1
       AND plan_id = $2${revisionFilter}
     ORDER BY revision DESC`,
    parameters,
  );
  if (rows.length === 0) return Object.freeze([]);

  const items = await readRevisionItems(
    client,
    organizationId,
    [planId],
    false,
    revision,
  );
  return Object.freeze(
    rows.map((row) => {
      const number = requiredInteger(row.revision, "revision");
      return Object.freeze({
        organizationId: scopedOrganization(
          row.organization_id,
          organizationId,
        ),
        planId: requiredScopedString(row.plan_id, planId, "plan id"),
        revision: number,
        note: optionalString(row.note, "revision note"),
        items:
          items.get(revisionKey(planId, number)) ??
          Object.freeze([]),
        createdAt: normalizedTimestamp(
          requiredString(
            row.revision_created_at,
            "revision created timestamp",
          ),
        ),
      });
    }),
  );
}

async function readRevisionItems(
  client: TrainingPlanPostgresQueryClient,
  organizationId: string,
  planIds: readonly string[],
  currentOnly: boolean,
  revision?: number,
): Promise<ReadonlyMap<string, readonly TrainingPlanRevisionItem[]>> {
  if (planIds.length === 0) return new Map();

  const parameters: TrainingPlanSqlParameter[] = [
    organizationId,
    JSON.stringify(planIds),
  ];
  let revisionFilter = "";
  if (revision !== undefined) {
    parameters.push(revision);
    revisionFilter = ` AND item.revision = $${parameters.length}`;
  }
  const currentJoin = currentOnly
    ? ` INNER JOIN appbasis_training_plan AS current_plan
          ON current_plan.organization_id = item.organization_id
         AND current_plan.id = item.plan_id
         AND current_plan.current_revision = item.revision`
    : "";

  const rows = await client.unsafe(
    `SELECT item.organization_id, item.plan_id, item.revision,
            item.item_id, item.item_kind, item.parent_block_item_id,
            item.sort_order, item.name, item.source_block_id,
            item.source_block_revision, item.source_exercise_id,
            item.duration_minutes, item.note, item.sets_value,
            item.repetitions_value, item.amount_value, item.unit_value,
            item.comment
     FROM appbasis_training_plan_revision_item AS item${currentJoin}
     WHERE item.organization_id = $1
       AND item.plan_id IN (
         SELECT jsonb_array_elements_text($2::jsonb)
       )${revisionFilter}
     ORDER BY item.plan_id ASC, item.revision DESC,
              item.parent_block_item_id NULLS FIRST,
              item.sort_order ASC, item.item_id ASC`,
    parameters,
  );

  const byRevision = new Map<
    string,
    {
      top: Array<TrainingPlanRevisionItem>;
      blocks: Map<string, MutableBlock>;
      children: Array<{
        parentId: string;
        exercise: ReturnType<typeof exerciseFromRow>;
      }>;
    }
  >();

  for (const row of rows) {
    scopedOrganization(row.organization_id, organizationId);
    const planId = requiredString(row.plan_id, "item plan id");
    const revisionNumber = requiredInteger(row.revision, "item revision");
    const key = revisionKey(planId, revisionNumber);
    const bucket =
      byRevision.get(key) ??
      { top: [], blocks: new Map<string, MutableBlock>(), children: [] };
    byRevision.set(key, bucket);

    const kind = requiredItemKind(row.item_kind);
    const parent = optionalString(
      row.parent_block_item_id,
      "parent block item id",
    );
    if (kind === "block") {
      if (parent !== null) {
        throw new Error("Training plan block unexpectedly has a parent.");
      }
      const block = blockFromRow(row);
      bucket.blocks.set(block.itemId, {
        ...block,
        exercises: [],
      });
      bucket.top.push(block);
      continue;
    }

    const exercise = exerciseFromRow(row);
    if (parent === null) bucket.top.push(exercise);
    else bucket.children.push({ parentId: parent, exercise });
  }

  const result = new Map<string, readonly TrainingPlanRevisionItem[]>();
  for (const [key, bucket] of byRevision) {
    for (const child of bucket.children) {
      const block = bucket.blocks.get(child.parentId);
      if (block === undefined) {
        throw new Error(
          "Training plan exercise references a missing block parent.",
        );
      }
      block.exercises.push(child.exercise);
    }

    const top = bucket.top
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => {
        if (item.kind !== "block") return Object.freeze({ ...item });
        const block = bucket.blocks.get(item.itemId);
        if (block === undefined) {
          throw new Error("Training plan block reconstruction failed.");
        }
        block.exercises.sort(
          (left, right) => left.sortOrder - right.sortOrder,
        );
        return Object.freeze({
          ...block,
          exercises: Object.freeze(
            block.exercises.map((exercise) =>
              Object.freeze({ ...exercise }),
            ),
          ),
        });
      });
    result.set(key, Object.freeze(top));
  }
  return result;
}

async function insertRevision(
  transaction: TrainingPlanPostgresQueryClient,
  revision: TrainingPlanRevision,
): Promise<void> {
  assertTrainingPlanRevisionInvariant(revision);
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

  const payload = JSON.stringify(flattenRevisionItems(revision));
  const inserted = await transaction.unsafe(
    `INSERT INTO appbasis_training_plan_revision_item (
       organization_id, plan_id, revision, item_id, item_kind,
       parent_block_item_id, sort_order, name, source_block_id,
       source_block_revision, source_exercise_id, duration_minutes,
       note, sets_value, repetitions_value, amount_value, unit_value,
       comment
     )
     SELECT $1, $2, $3,
            input.item_id, input.item_kind, input.parent_block_item_id,
            input.sort_order, input.name, input.source_block_id,
            input.source_block_revision, input.source_exercise_id,
            input.duration_minutes, input.note, input.sets_value,
            input.repetitions_value, input.amount_value, input.unit_value,
            input.comment
     FROM jsonb_to_recordset($4::jsonb) AS input(
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
     )
     RETURNING item_id`,
    [
      revision.organizationId,
      revision.planId,
      revision.revision,
      payload,
    ],
  );
  const expectedCount =
    revision.items.length +
    revision.items.reduce(
      (count, item) =>
        count + (item.kind === "block" ? item.exercises.length : 0),
      0,
    );
  if (inserted.length !== expectedCount) {
    throw new Error(
      "Training plan revision item insert returned an invalid count.",
    );
  }
}

function flattenRevisionItems(
  revision: TrainingPlanRevision,
): readonly Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const item of revision.items) {
    if (item.kind === "block") {
      rows.push({
        item_id: item.itemId,
        item_kind: "block",
        parent_block_item_id: null,
        sort_order: item.sortOrder,
        name: item.name,
        source_block_id: item.sourceBlockId,
        source_block_revision: item.sourceBlockRevision,
        source_exercise_id: null,
        duration_minutes: item.durationMinutes,
        note: item.note,
        sets_value: null,
        repetitions_value: null,
        amount_value: null,
        unit_value: null,
        comment: null,
      });
      for (const exercise of item.exercises) {
        rows.push(exercisePayload(exercise, item.itemId));
      }
      continue;
    }
    rows.push(exercisePayload(item, null));
  }
  return rows;
}

function exercisePayload(
  item: Extract<TrainingPlanRevisionItem, { kind: "exercise" }>,
  parentBlockItemId: string | null,
): Record<string, unknown> {
  return {
    item_id: item.itemId,
    item_kind: "exercise",
    parent_block_item_id: parentBlockItemId,
    sort_order: item.sortOrder,
    name: item.name,
    source_block_id: null,
    source_block_revision: null,
    source_exercise_id: item.sourceExerciseId,
    duration_minutes: null,
    note: null,
    sets_value: item.sets,
    repetitions_value: item.repetitions,
    amount_value: item.amount,
    unit_value: item.unit,
    comment: item.comment,
  };
}

interface MutableBlock {
  readonly kind: "block";
  readonly itemId: string;
  readonly sourceBlockId: string | null;
  readonly sourceBlockRevision: number | null;
  readonly name: string;
  readonly durationMinutes: number | null;
  readonly note: string | null;
  readonly sortOrder: number;
  exercises: Array<ReturnType<typeof exerciseFromRow>>;
}

function blockFromRow(
  row: Record<string, unknown>,
): Extract<TrainingPlanRevisionItem, { kind: "block" }> {
  return Object.freeze({
    kind: "block",
    itemId: requiredString(row.item_id, "block item id"),
    sourceBlockId: optionalString(row.source_block_id, "source block id"),
    sourceBlockRevision: optionalInteger(
      row.source_block_revision,
      "source block revision",
    ),
    name: requiredString(row.name, "block name"),
    durationMinutes: optionalInteger(
      row.duration_minutes,
      "duration minutes",
    ),
    note: optionalString(row.note, "block note"),
    exercises: Object.freeze([]),
    sortOrder: requiredInteger(row.sort_order, "block sort order"),
  });
}

function exerciseFromRow(
  row: Record<string, unknown>,
): Extract<TrainingPlanRevisionItem, { kind: "exercise" }> {
  return Object.freeze({
    kind: "exercise",
    itemId: requiredString(row.item_id, "exercise item id"),
    sourceExerciseId: optionalString(
      row.source_exercise_id,
      "source exercise id",
    ),
    name: requiredString(row.name, "exercise name"),
    sets: optionalString(row.sets_value, "sets"),
    repetitions: optionalString(
      row.repetitions_value,
      "repetitions",
    ),
    amount: optionalString(row.amount_value, "amount"),
    unit: optionalString(row.unit_value, "unit"),
    comment: optionalString(row.comment, "comment"),
    sortOrder: requiredInteger(row.sort_order, "exercise sort order"),
  });
}

function revisionKey(planId: string, revision: number): string {
  return planId + "\u0000" + revision;
}

function clonePlan(plan: TrainingPlanSnapshot): TrainingPlanSnapshot {
  return Object.freeze({
    ...plan,
    revision: cloneRevision(plan.revision),
  });
}

function cloneRevision(revision: TrainingPlanRevision): TrainingPlanRevision {
  return Object.freeze({
    ...revision,
    items: Object.freeze(
      revision.items.map((item) =>
        item.kind === "block"
          ? Object.freeze({
              ...item,
              exercises: Object.freeze(
                item.exercises.map((exercise) =>
                  Object.freeze({ ...exercise }),
                ),
              ),
            })
          : Object.freeze({ ...item }),
      ),
    ),
  });
}

function requiredItemKind(value: unknown): "block" | "exercise" {
  if (value !== "block" && value !== "exercise") {
    throw new Error("Training plan item kind is invalid.");
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Training plan ${label} is invalid.`);
  }
  return value;
}

function requiredScopedString(
  value: unknown,
  expected: string,
  label: string,
): string {
  const normalized = requiredString(value, label);
  if (normalized !== expected) {
    throw new Error(`Training plan ${label} escaped its scope.`);
  }
  return normalized;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function requiredInteger(value: unknown, label: string): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Training plan ${label} is invalid.`);
  }
  return number;
}

function optionalInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  return requiredInteger(value, label);
}

function scopedOrganization(value: unknown, expected: string): string {
  return requiredScopedString(value, expected, "organization id");
}

function normalizedTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Training plan timestamp is invalid.");
  }
  return parsed.toISOString();
}
