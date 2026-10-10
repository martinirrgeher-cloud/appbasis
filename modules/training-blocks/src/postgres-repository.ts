import type {
  TrainingBlockDeactivateResult,
  TrainingBlockRepository,
  TrainingBlockRevision,
  TrainingBlockRevisionAppendResult,
  TrainingBlockSnapshot,
} from "./repository";

export type TrainingBlockSqlParameter = string | number | boolean | null;

export interface TrainingBlockPostgresQueryClient {
  unsafe(
    query: string,
    parameters?: TrainingBlockSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface TrainingBlockPostgresClient
  extends TrainingBlockPostgresQueryClient {
  begin<T>(
    callback: (transaction: TrainingBlockPostgresQueryClient) => Promise<T>,
  ): Promise<T>;
}

export class PostgresTrainingBlockRepository implements TrainingBlockRepository {
  readonly #client: TrainingBlockPostgresClient;

  constructor(client: TrainingBlockPostgresClient) {
    this.#client = client;
  }

  async listCurrent(organizationId: string): Promise<readonly TrainingBlockSnapshot[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readCurrentBlocks(transaction, organizationId);
    });
  }

  async findCurrent(
    organizationId: string,
    blockId: string,
  ): Promise<TrainingBlockSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const blocks = await readCurrentBlocks(transaction, organizationId, blockId);
      return blocks[0];
    });
  }

  async create(block: TrainingBlockSnapshot): Promise<TrainingBlockSnapshot> {
    await this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `INSERT INTO appbasis_training_block (
           id, organization_id, is_active, current_revision, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
         RETURNING id`,
        [
          block.id,
          block.organizationId,
          block.isActive,
          block.currentRevision,
          block.createdAt,
          block.updatedAt,
        ],
      );
      if (rows.length !== 1) {
        throw new Error("Training block insert did not return one row.");
      }
      await insertRevision(transaction, block.revision);
    });
    return block;
  }

  async appendRevision(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    revision: TrainingBlockRevision,
  ): Promise<TrainingBlockRevisionAppendResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `SELECT current_revision, created_at::text AS created_at,
                updated_at::text AS updated_at, is_active
         FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, blockId],
      );
      if (rows.length === 0) return Object.freeze({ status: "not-found" as const });
      if (rows.length !== 1) {
        throw new Error("Training block lock returned multiple rows.");
      }
      const row = rows[0]!;
      const currentRevision = requiredInteger(row.current_revision, "current revision");
      if (currentRevision !== expectedRevision) {
        return Object.freeze({ status: "conflict" as const, currentRevision });
      }
      if (
        revision.organizationId !== organizationId ||
        revision.blockId !== blockId ||
        revision.revision !== expectedRevision + 1
      ) {
        throw new Error("Training block next revision escaped the locked block scope.");
      }

      await insertRevision(transaction, revision);
      const updated = await transaction.unsafe(
        `UPDATE appbasis_training_block
         SET current_revision = $3,
             updated_at = $4::timestamptz
         WHERE organization_id = $1
           AND id = $2
           AND current_revision = $5
         RETURNING id`,
        [
          organizationId,
          blockId,
          revision.revision,
          revision.createdAt,
          expectedRevision,
        ],
      );
      if (updated.length !== 1) {
        throw new Error("Training block current revision update was not atomic.");
      }
      const block = Object.freeze({
        id: blockId,
        organizationId,
        isActive: requiredBoolean(row.is_active, "active flag"),
        currentRevision: revision.revision,
        createdAt: normalizedTimestamp(requiredString(row.created_at, "created timestamp")),
        updatedAt: revision.createdAt,
        revision: cloneRevision(revision),
      });
      return Object.freeze({ status: "updated" as const, block });
    });
  }

  async deactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<TrainingBlockDeactivateResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `SELECT current_revision, is_active
         FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, blockId],
      );
      if (rows.length === 0) return Object.freeze({ status: "not-found" as const });
      if (rows.length !== 1) throw new Error("Training block lock returned multiple rows.");
      const currentRevision = requiredInteger(rows[0]!.current_revision, "current revision");
      if (currentRevision !== expectedRevision) {
        return Object.freeze({ status: "conflict" as const, currentRevision });
      }
      const isActive = requiredBoolean(rows[0]!.is_active, "active flag");
      if (isActive) {
        const changed = await transaction.unsafe(
          `UPDATE appbasis_training_block
           SET is_active = false,
               updated_at = $3::timestamptz
           WHERE organization_id = $1
             AND id = $2
             AND current_revision = $4
           RETURNING id`,
          [organizationId, blockId, updatedAt, expectedRevision],
        );
        if (changed.length !== 1) {
          throw new Error("Training block deactivation was not atomic.");
        }
      }
      const blocks = await readCurrentBlocks(transaction, organizationId, blockId);
      const block = blocks[0];
      if (block === undefined) throw new Error("Training block disappeared after deactivation.");
      return Object.freeze({ status: "updated" as const, block });
    });
  }

  async listRevisions(
    organizationId: string,
    blockId: string,
  ): Promise<readonly TrainingBlockRevision[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readRevisions(transaction, organizationId, blockId);
    });
  }

  async findRevision(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<TrainingBlockRevision | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const revisions = await readRevisions(
        transaction,
        organizationId,
        blockId,
        revision,
      );
      return revisions[0];
    });
  }
}

async function readCurrentBlocks(
  client: TrainingBlockPostgresQueryClient,
  organizationId: string,
  blockId?: string,
): Promise<readonly TrainingBlockSnapshot[]> {
  const parameters: TrainingBlockSqlParameter[] = [organizationId];
  const filter = blockId === undefined ? "" : " AND block.id = $2";
  if (blockId !== undefined) parameters.push(blockId);
  const rows = await client.unsafe(
    `SELECT block.id, block.organization_id, block.is_active,
            block.current_revision, block.created_at::text AS block_created_at,
            block.updated_at::text AS block_updated_at,
            revision.name, revision.audience_id, revision.duration_minutes,
            revision.note, revision.created_at::text AS revision_created_at
     FROM appbasis_training_block AS block
     INNER JOIN appbasis_training_block_revision AS revision
       ON revision.organization_id = block.organization_id
      AND revision.block_id = block.id
      AND revision.revision = block.current_revision
     WHERE block.organization_id = $1${filter}
     ORDER BY lower(revision.name) ASC, block.id ASC`,
    parameters,
  );
  if (rows.length === 0) return Object.freeze([]);
  const children = await readChildren(
    client,
    organizationId,
    blockId,
    undefined,
    true,
  );
  return Object.freeze(
    rows.map((row) => {
      const id = requiredString(row.id, "block id");
      const revisionNumber = requiredInteger(row.current_revision, "current revision");
      const child = children.get(revisionKey(id, revisionNumber)) ?? Object.freeze([]);
      return Object.freeze({
        id,
        organizationId: scopedOrganization(row.organization_id, organizationId),
        isActive: requiredBoolean(row.is_active, "active flag"),
        currentRevision: revisionNumber,
        createdAt: normalizedTimestamp(requiredString(row.block_created_at, "block created timestamp")),
        updatedAt: normalizedTimestamp(requiredString(row.block_updated_at, "block updated timestamp")),
        revision: revisionFromRow(row, organizationId, id, revisionNumber, child),
      });
    }),
  );
}

async function readRevisions(
  client: TrainingBlockPostgresQueryClient,
  organizationId: string,
  blockId: string,
  revision?: number,
): Promise<readonly TrainingBlockRevision[]> {
  const parameters: TrainingBlockSqlParameter[] = [organizationId, blockId];
  const filter = revision === undefined ? "" : " AND revision = $3";
  if (revision !== undefined) parameters.push(revision);
  const rows = await client.unsafe(
    `SELECT organization_id, block_id, revision, name, audience_id,
            duration_minutes, note, created_at::text AS revision_created_at
     FROM appbasis_training_block_revision
     WHERE organization_id = $1
       AND block_id = $2${filter}
     ORDER BY revision DESC`,
    parameters,
  );
  if (rows.length === 0) return Object.freeze([]);
  const children = await readChildren(
    client,
    organizationId,
    blockId,
    revision,
    false,
  );
  return Object.freeze(
    rows.map((row) => {
      const revisionNumber = requiredInteger(row.revision, "revision");
      return revisionFromRow(
        row,
        organizationId,
        blockId,
        revisionNumber,
        children.get(revisionKey(blockId, revisionNumber)) ?? Object.freeze([]),
      );
    }),
  );
}

async function readChildren(
  client: TrainingBlockPostgresQueryClient,
  organizationId: string,
  blockId: string | undefined,
  revision: number | undefined,
  currentOnly: boolean,
): Promise<ReadonlyMap<string, readonly TrainingBlockRevision["exercises"][number][]>> {
  const parameters: TrainingBlockSqlParameter[] = [organizationId];
  let itemFilter = "";
  if (blockId !== undefined) {
    parameters.push(blockId);
    itemFilter += ` AND item.block_id = $${parameters.length}`;
  }
  if (revision !== undefined) {
    parameters.push(revision);
    itemFilter += ` AND item.revision = $${parameters.length}`;
  }
  const currentJoin = currentOnly
    ? ` INNER JOIN appbasis_training_block AS current_block
          ON current_block.organization_id = item.organization_id
         AND current_block.id = item.block_id
         AND current_block.current_revision = item.revision`
    : "";

  const itemRows = await client.unsafe(
    `SELECT item.organization_id, item.block_id, item.revision, item.item_id,
            item.exercise_id, item.sort_order, item.note
     FROM appbasis_training_block_revision_item AS item${currentJoin}
     WHERE item.organization_id = $1${itemFilter}
     ORDER BY item.block_id ASC, item.revision DESC, item.sort_order ASC, item.item_id ASC`,
    parameters,
  );

  const parameterRows = await client.unsafe(
    `SELECT parameter.organization_id, parameter.block_id, parameter.revision,
            parameter.item_id, parameter.parameter_key, parameter.parameter_value,
            parameter.sort_order
     FROM appbasis_training_block_revision_item_parameter AS parameter
     ${currentOnly ? `INNER JOIN appbasis_training_block AS current_block
       ON current_block.organization_id = parameter.organization_id
      AND current_block.id = parameter.block_id
      AND current_block.current_revision = parameter.revision` : ""}
     WHERE parameter.organization_id = $1${itemFilter
       .replaceAll("item.block_id", "parameter.block_id")
       .replaceAll("item.revision", "parameter.revision")}
     ORDER BY parameter.block_id ASC, parameter.revision DESC,
              parameter.item_id ASC, parameter.sort_order ASC, parameter.parameter_key ASC`,
    parameters,
  );

  const overrides = new Map<string, Array<{ key: string; value: string; sortOrder: number }>>();
  for (const row of parameterRows) {
    scopedOrganization(row.organization_id, organizationId);
    const key = itemKey(
      requiredString(row.block_id, "parameter block id"),
      requiredInteger(row.revision, "parameter revision"),
      requiredString(row.item_id, "parameter item id"),
    );
    const list = overrides.get(key) ?? [];
    list.push({
      key: requiredString(row.parameter_key, "parameter key"),
      value: requiredString(row.parameter_value, "parameter value"),
      sortOrder: requiredInteger(row.sort_order, "parameter sort order"),
    });
    overrides.set(key, list);
  }

  const items = new Map<string, TrainingBlockRevision["exercises"][number][]>();
  for (const row of itemRows) {
    scopedOrganization(row.organization_id, organizationId);
    const currentBlockId = requiredString(row.block_id, "item block id");
    const currentRevision = requiredInteger(row.revision, "item revision");
    const currentItemId = requiredString(row.item_id, "item id");
    const key = revisionKey(currentBlockId, currentRevision);
    const list = items.get(key) ?? [];
    list.push(
      Object.freeze({
        itemId: currentItemId,
        exerciseId: requiredString(row.exercise_id, "exercise id"),
        note: optionalString(row.note, "item note"),
        parameterOverrides: Object.freeze(
          (overrides.get(itemKey(currentBlockId, currentRevision, currentItemId)) ?? [])
            .map((override) => Object.freeze({ ...override })),
        ),
        sortOrder: requiredInteger(row.sort_order, "item sort order"),
      }),
    );
    items.set(key, list);
  }
  return new Map(
    [...items.entries()].map(([key, value]) => [key, Object.freeze(value)] as const),
  );
}

async function insertRevision(
  transaction: TrainingBlockPostgresQueryClient,
  revision: TrainingBlockRevision,
): Promise<void> {
  const rows = await transaction.unsafe(
    `INSERT INTO appbasis_training_block_revision (
       organization_id, block_id, revision, name, audience_id,
       duration_minutes, note, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
     RETURNING revision`,
    [
      revision.organizationId,
      revision.blockId,
      revision.revision,
      revision.name,
      revision.audienceId,
      revision.durationMinutes,
      revision.note,
      revision.createdAt,
    ],
  );
  if (rows.length !== 1) throw new Error("Training block revision insert failed.");

  for (const exercise of revision.exercises) {
    await transaction.unsafe(
      `INSERT INTO appbasis_training_block_revision_item (
         organization_id, block_id, revision, item_id, exercise_id,
         sort_order, note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        revision.organizationId,
        revision.blockId,
        revision.revision,
        exercise.itemId,
        exercise.exerciseId,
        exercise.sortOrder,
        exercise.note,
      ],
    );
    for (const override of exercise.parameterOverrides) {
      await transaction.unsafe(
        `INSERT INTO appbasis_training_block_revision_item_parameter (
           organization_id, block_id, revision, item_id,
           parameter_key, parameter_value, sort_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          revision.organizationId,
          revision.blockId,
          revision.revision,
          exercise.itemId,
          override.key,
          override.value,
          override.sortOrder,
        ],
      );
    }
  }
}

function revisionFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  blockId: string,
  revision: number,
  exercises: readonly TrainingBlockRevision["exercises"][number][],
): TrainingBlockRevision {
  const rowBlockId = optionalString(row.block_id, "block id") ?? blockId;
  if (rowBlockId !== blockId) throw new Error("Training block revision escaped its block scope.");
  if (row.organization_id !== undefined) scopedOrganization(row.organization_id, expectedOrganizationId);
  return Object.freeze({
    organizationId: expectedOrganizationId,
    blockId,
    revision,
    name: requiredString(row.name, "revision name"),
    audienceId: optionalString(row.audience_id, "audience id"),
    durationMinutes: optionalInteger(row.duration_minutes, "duration"),
    note: optionalString(row.note, "revision note"),
    exercises: Object.freeze(exercises.map(cloneExercise)),
    createdAt: normalizedTimestamp(requiredString(row.revision_created_at, "revision timestamp")),
  });
}

function cloneRevision(revision: TrainingBlockRevision): TrainingBlockRevision {
  return Object.freeze({
    ...revision,
    exercises: Object.freeze(revision.exercises.map(cloneExercise)),
  });
}

function cloneExercise(
  exercise: TrainingBlockRevision["exercises"][number],
): TrainingBlockRevision["exercises"][number] {
  return Object.freeze({
    ...exercise,
    parameterOverrides: Object.freeze(
      exercise.parameterOverrides.map((override) => Object.freeze({ ...override })),
    ),
  });
}

function revisionKey(blockId: string, revision: number): string {
  return blockId + "\u0000" + String(revision);
}

function itemKey(blockId: string, revision: number, itemId: string): string {
  return revisionKey(blockId, revision) + "\u0000" + itemId;
}

function scopedOrganization(value: unknown, expected: string): string {
  const actual = requiredString(value, "organization id");
  if (actual !== expected) throw new Error("Training block row escaped organization scope.");
  return actual;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  return value;
}

function optionalInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  return requiredInteger(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  return value;
}

function normalizedTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Training block timestamp has an invalid shape.");
  }
  return parsed.toISOString();
}
