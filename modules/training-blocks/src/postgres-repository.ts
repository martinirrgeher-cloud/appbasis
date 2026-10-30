import {
  assertTrainingBlockCreationInvariant,
  compareTrainingBlockSnapshots,
  type TrainingBlockDeactivateResult,
  type TrainingBlockDeleteUnusedResult,
  type TrainingBlockRepository,
  type TrainingBlockRevision,
  type TrainingBlockRevisionAppendResult,
  type TrainingBlockSnapshot,
  type TrainingBlockUsageEvent,
  type TrainingBlockUsageSummary,
} from "./repository";

export type TrainingBlockSqlParameter =
  | string
  | number
  | boolean
  | readonly string[]
  | null;

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
    assertTrainingBlockCreationInvariant(block);
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
      const isActive = requiredBoolean(row.is_active, "active flag");
      if (!isActive) {
        return Object.freeze({ status: "inactive" as const, currentRevision });
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
        isActive,
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

  async reactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<TrainingBlockDeactivateResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `SELECT current_revision, is_active
         FROM appbasis_training_block
         WHERE organization_id = $1 AND id = $2
         FOR UPDATE`,
        [organizationId, blockId],
      );
      if (rows.length === 0) return Object.freeze({ status: "not-found" as const });
      if (rows.length !== 1) throw new Error("Training block lock returned multiple rows.");
      const currentRevision = requiredInteger(rows[0]!.current_revision, "current revision");
      if (currentRevision !== expectedRevision) {
        return Object.freeze({ status: "conflict" as const, currentRevision });
      }
      if (!requiredBoolean(rows[0]!.is_active, "active flag")) {
        const changed = await transaction.unsafe(
          `UPDATE appbasis_training_block
           SET is_active = true, updated_at = $3::timestamptz
           WHERE organization_id = $1 AND id = $2
             AND current_revision = $4 AND is_active = false
           RETURNING id`,
          [organizationId, blockId, updatedAt, expectedRevision],
        );
        if (changed.length !== 1) {
          throw new Error("Training block reactivation was not atomic.");
        }
      }
      const blocks = await readCurrentBlocks(transaction, organizationId, blockId);
      const block = blocks[0];
      if (block === undefined) throw new Error("Training block disappeared after reactivation.");
      return Object.freeze({ status: "updated" as const, block });
    });
  }

  async deleteUnused(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
  ): Promise<TrainingBlockDeleteUnusedResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `SELECT current_revision
         FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, blockId],
      );
      if (rows.length === 0) return Object.freeze({ status: "not-found" as const });
      if (rows.length !== 1) {
        throw new Error("Training block delete lock returned multiple rows.");
      }
      const currentRevision = requiredInteger(
        rows[0]!.current_revision,
        "current revision",
      );
      if (currentRevision !== expectedRevision) {
        return Object.freeze({
          status: "conflict" as const,
          currentRevision,
        });
      }

      const usage = await transaction.unsafe(
        `SELECT 1 AS used
         FROM appbasis_training_block_usage
         WHERE organization_id = $1
           AND block_id = $2
         LIMIT 1`,
        [organizationId, blockId],
      );
      if (usage.length > 0) {
        return Object.freeze({ status: "in-use" as const });
      }

      await transaction.unsafe(
        `DELETE FROM appbasis_training_block_favorite
         WHERE organization_id = $1
           AND block_id = $2`,
        [organizationId, blockId],
      );
      await transaction.unsafe(
        `DELETE FROM appbasis_training_block_revision_item_parameter
         WHERE organization_id = $1
           AND block_id = $2`,
        [organizationId, blockId],
      );
      await transaction.unsafe(
        `DELETE FROM appbasis_training_block_revision_item
         WHERE organization_id = $1
           AND block_id = $2`,
        [organizationId, blockId],
      );
      await transaction.unsafe(
        `DELETE FROM appbasis_training_block_revision
         WHERE organization_id = $1
           AND block_id = $2`,
        [organizationId, blockId],
      );
      const deleted = await transaction.unsafe(
        `DELETE FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $2
         RETURNING id`,
        [organizationId, blockId],
      );
      if (deleted.length !== 1) {
        throw new Error("Training block unused delete was not atomic.");
      }
      return Object.freeze({ status: "deleted" as const });
    });
  }

  async listFavoriteBlockIds(
    organizationId: string,
    principalId: string,
  ): Promise<readonly string[]> {
    const rows = await this.#client.unsafe(
      `SELECT favorite.block_id
       FROM appbasis_training_block_favorite AS favorite
       INNER JOIN appbasis_training_block AS block
         ON block.organization_id = favorite.organization_id
        AND block.id = favorite.block_id
       WHERE favorite.organization_id = $1
         AND favorite.principal_id = $2
       ORDER BY favorite.block_id ASC`,
      [organizationId, principalId],
    );
    return Object.freeze(
      rows.map((row) => requiredString(row.block_id, "favorite block id")),
    );
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    blockId: string,
    favorite: boolean,
  ): Promise<void> {
    if (favorite) {
      await this.#client.unsafe(
        `INSERT INTO appbasis_training_block_favorite (
           organization_id, principal_id, block_id
         )
         SELECT $1, $2, $3
         WHERE EXISTS (
           SELECT 1
           FROM appbasis_training_block
           WHERE organization_id = $1
             AND id = $3
         )
         ON CONFLICT (organization_id, principal_id, block_id)
         DO NOTHING`,
        [organizationId, principalId, blockId],
      );
      return;
    }
    await this.#client.unsafe(
      `DELETE FROM appbasis_training_block_favorite
       WHERE organization_id = $1
         AND principal_id = $2
         AND block_id = $3`,
      [organizationId, principalId, blockId],
    );
  }

  async listUsageSummaries(
    organizationId: string,
  ): Promise<readonly TrainingBlockUsageSummary[]> {
    const rows = await this.#client.unsafe(
      `SELECT usage.block_id,
              count(*)::int AS usage_count,
              max(usage.occurred_at)::text AS last_used_at
       FROM appbasis_training_block_usage AS usage
       INNER JOIN appbasis_training_block AS block
         ON block.organization_id = usage.organization_id
        AND block.id = usage.block_id
       WHERE usage.organization_id = $1
       GROUP BY usage.block_id
       ORDER BY usage.block_id ASC`,
      [organizationId],
    );
    return Object.freeze(
      rows.map((row) => Object.freeze({
        blockId: requiredString(row.block_id, "usage block id"),
        usageCount: requiredInteger(row.usage_count, "usage count"),
        lastUsedAt: optionalString(row.last_used_at, "usage last used timestamp"),
      })),
    );
  }

  async listUsageEvents(
    organizationId: string,
    blockId: string,
    limit = 50,
  ): Promise<readonly TrainingBlockUsageEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Training block usage limit is invalid.");
    }
    const rows = await this.#client.unsafe(
      `SELECT id, organization_id, block_id,
              occurred_at::text AS occurred_at,
              source_kind, source_ref, note
       FROM appbasis_training_block_usage
       WHERE organization_id = $1
         AND block_id = $2
       ORDER BY occurred_at DESC, id DESC
       LIMIT $3`,
      [organizationId, blockId, limit],
    );
    return Object.freeze(rows.map(usageFromRow));
  }

  async recordUsage(event: TrainingBlockUsageEvent): Promise<void> {
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_training_block_usage (
         organization_id, id, block_id, occurred_at,
         source_kind, source_ref, note
       )
       SELECT $1, $2, $3, $4::timestamptz, $5, $6, $7
       WHERE EXISTS (
         SELECT 1
         FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $3
       )
       RETURNING id`,
      [
        event.organizationId,
        event.id,
        event.blockId,
        event.occurredAt,
        event.sourceKind,
        event.sourceRef,
        event.note,
      ],
    );
    if (rows.length !== 1) {
      throw new Error("Training block usage references an unknown block.");
    }
  }

  async recordUsageIfAbsent(
    event: TrainingBlockUsageEvent,
  ): Promise<TrainingBlockUsageEvent | undefined> {
    const inserted = await this.#client.unsafe(
      `INSERT INTO appbasis_training_block_usage (
         organization_id, id, block_id, occurred_at,
         source_kind, source_ref, note
       )
       SELECT $1, $2, $3, $4::timestamptz, $5, $6, $7
       WHERE EXISTS (
         SELECT 1
         FROM appbasis_training_block
         WHERE organization_id = $1
           AND id = $3
       )
       ON CONFLICT (organization_id, id) DO NOTHING
       RETURNING id, organization_id, block_id,
                 occurred_at::text AS occurred_at,
                 source_kind, source_ref, note`,
      [
        event.organizationId,
        event.id,
        event.blockId,
        event.occurredAt,
        event.sourceKind,
        event.sourceRef,
        event.note,
      ],
    );
    if (inserted.length === 1) return usageFromRow(inserted[0]!);

    const existing = await this.#client.unsafe(
      `SELECT id, organization_id, block_id,
              occurred_at::text AS occurred_at,
              source_kind, source_ref, note
       FROM appbasis_training_block_usage
       WHERE organization_id = $1
         AND id = $2`,
      [event.organizationId, event.id],
    );
    if (existing.length === 1) return usageFromRow(existing[0]!);
    return undefined;
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
            revision.name, revision.audience_id, revision.audience_ids,
            revision.category, revision.duration_minutes,
            revision.note, revision.created_at::text AS revision_created_at
     FROM appbasis_training_block AS block
     INNER JOIN appbasis_training_block_revision AS revision
       ON revision.organization_id = block.organization_id
      AND revision.block_id = block.id
      AND revision.revision = block.current_revision
     WHERE block.organization_id = $1${filter}`,
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
  const blocks = rows.map((row) => {
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
    });
  blocks.sort(compareTrainingBlockSnapshots);
  return Object.freeze(blocks);
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
    `SELECT organization_id, block_id, revision, name, audience_id, audience_ids,
            category, duration_minutes, note, created_at::text AS revision_created_at
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
       organization_id, block_id, revision, name, audience_id, audience_ids,
       category, duration_minutes, note, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10::timestamptz)
     RETURNING revision`,
    [
      revision.organizationId,
      revision.blockId,
      revision.revision,
      revision.name,
      revision.audienceId,
      [...revision.audienceIds],
      revision.category ?? null,
      revision.durationMinutes,
      revision.note,
      revision.createdAt,
    ],
  );
  if (rows.length !== 1) throw new Error("Training block revision insert failed.");

  if (revision.exercises.length > 0) {
    const itemPayload = revision.exercises.map((exercise) => ({
      organization_id: revision.organizationId,
      block_id: revision.blockId,
      revision: revision.revision,
      item_id: exercise.itemId,
      exercise_id: exercise.exerciseId,
      sort_order: exercise.sortOrder,
      note: exercise.note,
    }));
    await transaction.unsafe(
      `INSERT INTO appbasis_training_block_revision_item (
         organization_id, block_id, revision, item_id, exercise_id,
         sort_order, note
       )
       SELECT payload.organization_id, payload.block_id, payload.revision,
              payload.item_id, payload.exercise_id, payload.sort_order, payload.note
       FROM jsonb_to_recordset($1::jsonb) AS payload(
         organization_id text,
         block_id text,
         revision integer,
         item_id text,
         exercise_id text,
         sort_order integer,
         note text
       )`,
      [JSON.stringify(itemPayload)],
    );
  }

  const parameterPayload = revision.exercises.flatMap((exercise) =>
    exercise.parameterOverrides.map((override) => ({
      organization_id: revision.organizationId,
      block_id: revision.blockId,
      revision: revision.revision,
      item_id: exercise.itemId,
      parameter_key: override.key,
      parameter_value: override.value,
      sort_order: override.sortOrder,
    })),
  );
  if (parameterPayload.length > 0) {
    await transaction.unsafe(
      `INSERT INTO appbasis_training_block_revision_item_parameter (
         organization_id, block_id, revision, item_id,
         parameter_key, parameter_value, sort_order
       )
       SELECT payload.organization_id, payload.block_id, payload.revision,
              payload.item_id, payload.parameter_key, payload.parameter_value,
              payload.sort_order
       FROM jsonb_to_recordset($1::jsonb) AS payload(
         organization_id text,
         block_id text,
         revision integer,
         item_id text,
         parameter_key text,
         parameter_value text,
         sort_order integer
       )`,
      [JSON.stringify(parameterPayload)],
    );
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
    audienceIds: audienceArray(
      row.audience_ids,
      optionalString(row.audience_id, "audience id"),
    ),
    category: optionalString(row.category, "category"),
    durationMinutes: optionalInteger(row.duration_minutes, "duration"),
    note: optionalString(row.note, "revision note"),
    exercises: Object.freeze(exercises.map(cloneExercise)),
    createdAt: normalizedTimestamp(requiredString(row.revision_created_at, "revision timestamp")),
  });
}

function cloneRevision(revision: TrainingBlockRevision): TrainingBlockRevision {
  return Object.freeze({
    ...revision,
    audienceIds: Object.freeze([...revision.audienceIds]),
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

function audienceArray(
  value: unknown,
  compatibilityAudienceId: string | null,
): readonly string[] {
  if (value === null || value === undefined) {
    return Object.freeze(
      compatibilityAudienceId === null ? [] : [compatibilityAudienceId],
    );
  }
  return stringArray(value, "audience ids");
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  const result = value.map((item) => requiredString(item, label));
  if (new Set(result).size !== result.length) {
    throw new Error(`Training block ${label} has an invalid shape.`);
  }
  return Object.freeze(result);
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

function usageFromRow(
  row: Record<string, unknown>,
): TrainingBlockUsageEvent {
  return Object.freeze({
    id: requiredString(row.id, "usage id"),
    organizationId: requiredString(row.organization_id, "usage organization id"),
    blockId: requiredString(row.block_id, "usage block id"),
    occurredAt: normalizedTimestamp(requiredString(row.occurred_at, "usage timestamp")),
    sourceKind: requiredString(row.source_kind, "usage source kind"),
    sourceRef: optionalString(row.source_ref, "usage source reference"),
    note: optionalString(row.note, "usage note"),
  });
}
