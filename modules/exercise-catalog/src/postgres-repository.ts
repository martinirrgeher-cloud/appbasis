import type {
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
  ExerciseCatalogPrivateMedia,
  ExerciseCatalogUsageEvent,
  ExerciseCatalogUsageSummary,
} from "./domain/catalog";
import type { ExerciseCatalogRepository } from "./repository";

export type ExerciseCatalogSqlParameter =
  | string
  | number
  | boolean
  | null;

export interface ExerciseCatalogPostgresQueryClient {
  unsafe(
    query: string,
    parameters?: ExerciseCatalogSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface ExerciseCatalogPostgresClient
  extends ExerciseCatalogPostgresQueryClient {
  begin<T>(
    callback: (transaction: ExerciseCatalogPostgresQueryClient) => Promise<T>,
  ): Promise<T>;
}

export class PostgresExerciseCatalogRepository
  implements ExerciseCatalogRepository
{
  readonly #client: ExerciseCatalogPostgresClient;

  constructor(client: ExerciseCatalogPostgresClient) {
    this.#client = client;
  }

  async listItems(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogItem[]> {
    return readItemsConsistently(this.#client, organizationId);
  }

  async listItemsWithFavorites(
    organizationId: string,
    principalId: string,
  ) {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      const items = await readItems(transaction, organizationId);
      const favoriteExerciseIds = await readFavoriteExerciseIds(
        transaction,
        organizationId,
        principalId,
      );
      return Object.freeze({ items, favoriteExerciseIds });
    });
  }

  async findItemById(
    organizationId: string,
    exerciseId: string,
  ): Promise<ExerciseCatalogItem | undefined> {
    const items = await readItemsConsistently(
      this.#client,
      organizationId,
      exerciseId,
    );
    return items[0];
  }

  async createItem(item: ExerciseCatalogItem): Promise<ExerciseCatalogItem> {
    await this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `INSERT INTO appbasis_exercise_catalog_item (
           id, organization_id, name, category_key, subcategory, difficulty_key,
           goal, description, coaching_cues, common_mistakes, equipment,
           video_url, is_active
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           ARRAY(SELECT jsonb_array_elements_text($11::jsonb)),
           $12, $13
         )
         RETURNING id`,
        itemSqlParameters(item),
      );
      if (rows.length !== 1) {
        throw new Error("Exercise catalog insert did not return one row.");
      }
      await replaceChildren(transaction, item);
    });
    return item;
  }

  async updateItemFromCurrent(
    organizationId: string,
    exerciseId: string,
    update: (current: ExerciseCatalogItem) => ExerciseCatalogItem,
  ): Promise<ExerciseCatalogItem | undefined> {
    return this.#client.begin(async (transaction) => {
      const items = await readItems(
        transaction,
        organizationId,
        exerciseId,
        true,
      );
      const current = items[0];
      if (current === undefined) return undefined;

      const item = update(current);
      if (
        item.organizationId !== organizationId ||
        item.id !== exerciseId
      ) {
        throw new Error(
          "Exercise catalog update changed its organization or item id.",
        );
      }
      return writeUpdatedItem(transaction, item);
    });
  }

  async listFavoriteExerciseIds(
    organizationId: string,
    principalId: string,
  ): Promise<readonly string[]> {
    return readFavoriteExerciseIds(
      this.#client,
      organizationId,
      principalId,
    );
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void> {
    if (favorite) {
      await this.#client.unsafe(
        `INSERT INTO appbasis_exercise_catalog_favorite (
           organization_id, principal_id, exercise_id
         )
         SELECT $1, $2, $3
         WHERE EXISTS (
           SELECT 1
           FROM appbasis_exercise_catalog_item
           WHERE organization_id = $1
             AND id = $3
         )
         ON CONFLICT (organization_id, principal_id, exercise_id)
         DO NOTHING`,
        [organizationId, principalId, exerciseId],
      );
      return;
    }
    await this.#client.unsafe(
      `DELETE FROM appbasis_exercise_catalog_favorite
       WHERE organization_id = $1
         AND principal_id = $2
         AND exercise_id = $3`,
      [organizationId, principalId, exerciseId],
    );
  }

  async listUsageSummaries(
    organizationId: string,
  ): Promise<readonly ExerciseCatalogUsageSummary[]> {
    const rows = await this.#client.unsafe(
      `SELECT exercise_id,
              count(*)::int AS usage_count,
              max(occurred_at)::text AS last_used_at
       FROM appbasis_exercise_catalog_usage
       WHERE organization_id = $1
       GROUP BY exercise_id
       ORDER BY exercise_id ASC`,
      [organizationId],
    );
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          exerciseId: requiredRowString(row.exercise_id, "usage exercise id"),
          usageCount: requiredInteger(row.usage_count, "usage count"),
          lastUsedAt: optionalRowString(row.last_used_at, "last used at"),
        }),
      ),
    );
  }

  async listUsageEvents(
    organizationId: string,
    exerciseId: string,
    limit = 50,
  ): Promise<readonly ExerciseCatalogUsageEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Exercise catalog usage limit is invalid.");
    }
    const rows = await this.#client.unsafe(
      `SELECT id, organization_id, exercise_id, occurred_at::text AS occurred_at,
              source_kind, source_ref, note
       FROM appbasis_exercise_catalog_usage
       WHERE organization_id = $1
         AND exercise_id = $2
       ORDER BY occurred_at DESC, id DESC
       LIMIT $3`,
      [organizationId, exerciseId, limit],
    );
    return Object.freeze(rows.map(usageFromRow));
  }

  async recordUsage(event: ExerciseCatalogUsageEvent): Promise<void> {
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_usage (
         organization_id, id, exercise_id, occurred_at, source_kind, source_ref, note
       )
       SELECT $1, $2, $3, $4::timestamptz, $5, $6, $7
       WHERE EXISTS (
         SELECT 1
         FROM appbasis_exercise_catalog_item
         WHERE organization_id = $1
           AND id = $3
       )
       RETURNING id`,
      [
        event.organizationId,
        event.id,
        event.exerciseId,
        event.occurredAt,
        event.sourceKind,
        event.sourceRef,
        event.note,
      ],
    );
    if (rows.length !== 1) {
      throw new Error("Exercise catalog usage references an unknown item.");
    }
  }

  async listPrivateMedia(
    organizationId: string,
    exerciseId: string,
  ): Promise<readonly ExerciseCatalogPrivateMedia[]> {
    const rows = await this.#client.unsafe(
      `SELECT id, organization_id, exercise_id, file_name, storage_key,
              content_type, size_bytes::float8 AS size_bytes,
              created_at::text AS created_at
       FROM appbasis_exercise_catalog_private_media
       WHERE organization_id = $1
         AND exercise_id = $2
       ORDER BY created_at ASC, id ASC`,
      [organizationId, exerciseId],
    );
    return Object.freeze(rows.map(privateMediaFromRow));
  }

  async registerPrivateMedia(
    media: ExerciseCatalogPrivateMedia,
  ): Promise<void> {
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_private_media (
         organization_id, id, exercise_id, file_name, storage_key,
         content_type, size_bytes, created_at
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8::timestamptz
       WHERE EXISTS (
         SELECT 1
         FROM appbasis_exercise_catalog_item
         WHERE organization_id = $1
           AND id = $3
       )
       RETURNING id`,
      [
        media.organizationId,
        media.id,
        media.exerciseId,
        media.fileName,
        media.storageKey,
        media.contentType,
        media.sizeBytes,
        media.createdAt,
      ],
    );
    if (rows.length !== 1) {
      throw new Error("Exercise catalog private media references an unknown item.");
    }
  }

  async deletePrivateMedia(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined> {
    const rows = await this.#client.unsafe(
      `DELETE FROM appbasis_exercise_catalog_private_media
       WHERE organization_id = $1
         AND exercise_id = $2
         AND id = $3
       RETURNING id, organization_id, exercise_id, file_name, storage_key,
                 content_type, size_bytes::float8 AS size_bytes,
                 created_at::text AS created_at`,
      [organizationId, exerciseId, mediaId],
    );
    if (rows.length === 0) return undefined;
    if (rows.length !== 1) {
      throw new Error("Exercise catalog private media delete returned multiple rows.");
    }
    return privateMediaFromRow(rows[0]!);
  }
}

async function readFavoriteExerciseIds(
  client: ExerciseCatalogPostgresQueryClient,
  organizationId: string,
  principalId: string,
): Promise<readonly string[]> {
  const rows = await client.unsafe(
    `SELECT favorite.exercise_id
     FROM appbasis_exercise_catalog_favorite AS favorite
     INNER JOIN appbasis_exercise_catalog_item AS item
       ON item.organization_id = favorite.organization_id
      AND item.id = favorite.exercise_id
     WHERE favorite.organization_id = $1
       AND favorite.principal_id = $2
     ORDER BY favorite.exercise_id ASC`,
    [organizationId, principalId],
  );
  return Object.freeze(
    rows.map((row) => requiredRowString(row.exercise_id, "exercise_id")),
  );
}

async function readItemsConsistently(
  client: ExerciseCatalogPostgresClient,
  organizationId: string,
  exerciseId?: string,
): Promise<readonly ExerciseCatalogItem[]> {
  return client.begin(async (transaction) => {
    await transaction.unsafe(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    return readItems(transaction, organizationId, exerciseId);
  });
}

async function readItems(
  client: ExerciseCatalogPostgresQueryClient,
  organizationId: string,
  exerciseId?: string,
  lockItem = false,
): Promise<readonly ExerciseCatalogItem[]> {
  const itemParameters: ExerciseCatalogSqlParameter[] = [organizationId];
  const itemFilter =
    exerciseId === undefined ? "" : " AND id = $2";
  if (exerciseId !== undefined) itemParameters.push(exerciseId);

  if (lockItem && exerciseId === undefined) {
    throw new Error("Exercise catalog item lock requires one exercise id.");
  }
  const lockClause = lockItem ? " FOR UPDATE" : "";
  const itemRows = await client.unsafe(
    `SELECT id, organization_id, name, category_key, subcategory, difficulty_key,
            goal, description, coaching_cues, common_mistakes, equipment,
            video_url, is_active
     FROM appbasis_exercise_catalog_item
     WHERE organization_id = $1${itemFilter}
     ORDER BY lower(name) ASC, id ASC${lockClause}`,
    itemParameters,
  );

  const ids = itemRows.map((row) =>
    requiredRowString(row.id, "exercise id"),
  );
  if (ids.length === 0) return Object.freeze([]);

  const childParameters: ExerciseCatalogSqlParameter[] = [organizationId];
  let childFilter = "";
  if (exerciseId !== undefined) {
    childFilter = " AND exercise_id = $2";
    childParameters.push(exerciseId);
  }

  const [parameterRows, audienceRows, videoRows, similarityRows] = await Promise.all([
    client.unsafe(
      `SELECT organization_id, exercise_id, parameter_key, label, unit,
              input_type, default_value, min_value, max_value, step_value,
              is_required, sort_order
       FROM appbasis_exercise_catalog_parameter
       WHERE organization_id = $1${childFilter}
       ORDER BY exercise_id ASC, sort_order ASC, parameter_key ASC`,
      childParameters,
    ),
    client.unsafe(
      `SELECT organization_id, exercise_id, audience_id
       FROM appbasis_exercise_catalog_audience
       WHERE organization_id = $1${childFilter}
       ORDER BY exercise_id ASC, audience_id ASC`,
      childParameters,
    ),
    client.unsafe(
      `SELECT organization_id, exercise_id, video_url
       FROM appbasis_exercise_catalog_video
       WHERE organization_id = $1${childFilter}
       ORDER BY exercise_id ASC, sort_order ASC, video_url ASC`,
      childParameters,
    ),
    client.unsafe(
      `SELECT organization_id, exercise_id, similar_exercise_id
       FROM appbasis_exercise_catalog_similarity
       WHERE organization_id = $1${childFilter}
       ORDER BY exercise_id ASC, similar_exercise_id ASC`,
      childParameters,
    ),
  ]);

  const knownIds = new Set(ids);
  const parameters = new Map<string, ExerciseCatalogParameter[]>();
  for (const row of parameterRows) {
    const id = scopedChildExerciseId(row, organizationId, knownIds);
    const entries = parameters.get(id) ?? [];
    entries.push(parameterFromRow(row));
    parameters.set(id, entries);
  }
  const audiences = new Map<string, string[]>();
  for (const row of audienceRows) {
    const id = scopedChildExerciseId(row, organizationId, knownIds);
    const entries = audiences.get(id) ?? [];
    entries.push(requiredRowString(row.audience_id, "audience id"));
    audiences.set(id, entries);
  }
  const videos = new Map<string, string[]>();
  for (const row of videoRows) {
    const id = scopedChildExerciseId(row, organizationId, knownIds);
    const entries = videos.get(id) ?? [];
    entries.push(requiredRowString(row.video_url, "video URL"));
    videos.set(id, entries);
  }
  const similarities = new Map<string, string[]>();
  for (const row of similarityRows) {
    const id = scopedChildExerciseId(row, organizationId, knownIds);
    const similarId = requiredRowString(
      row.similar_exercise_id,
      "similar exercise id",
    );
    if (similarId === id) {
      throw new Error("Exercise catalog similarity references itself.");
    }
    const entries = similarities.get(id) ?? [];
    entries.push(similarId);
    similarities.set(id, entries);
  }

  return Object.freeze(
    itemRows.map((row) =>
      itemFromRow(
        row,
        organizationId,
        parameters.get(requiredRowString(row.id, "exercise id")) ?? [],
        audiences.get(requiredRowString(row.id, "exercise id")) ?? [],
        videos.get(requiredRowString(row.id, "exercise id")) ?? [],
        similarities.get(requiredRowString(row.id, "exercise id")) ?? [],
      ),
    ),
  );
}

async function writeUpdatedItem(
  transaction: ExerciseCatalogPostgresQueryClient,
  item: ExerciseCatalogItem,
): Promise<ExerciseCatalogItem | undefined> {
  const rows = await transaction.unsafe(
    `UPDATE appbasis_exercise_catalog_item
     SET name = $3,
         category_key = $4,
         subcategory = $5,
         difficulty_key = $6,
         goal = $7,
         description = $8,
         coaching_cues = $9,
         common_mistakes = $10,
         equipment = ARRAY(SELECT jsonb_array_elements_text($11::jsonb)),
         video_url = $12,
         is_active = $13,
         updated_at = now()
     WHERE id = $1
       AND organization_id = $2
     RETURNING id`,
    itemSqlParameters(item),
  );
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) {
    throw new Error("Exercise catalog update returned multiple rows.");
  }
  await replaceChildren(transaction, item);
  return item;
}

async function replaceChildren(
  transaction: ExerciseCatalogPostgresQueryClient,
  item: ExerciseCatalogItem,
): Promise<void> {
  await transaction.unsafe(
    `DELETE FROM appbasis_exercise_catalog_parameter
     WHERE organization_id = $1
       AND exercise_id = $2`,
    [item.organizationId, item.id],
  );
  await transaction.unsafe(
    `DELETE FROM appbasis_exercise_catalog_audience
     WHERE organization_id = $1
       AND exercise_id = $2`,
    [item.organizationId, item.id],
  );
  await transaction.unsafe(
    `DELETE FROM appbasis_exercise_catalog_video
     WHERE organization_id = $1
       AND exercise_id = $2`,
    [item.organizationId, item.id],
  );

  if (item.similarExerciseIds.length > 0) {
    const targetRows = await transaction.unsafe(
      `SELECT id
       FROM appbasis_exercise_catalog_item
       WHERE organization_id = $1
         AND id IN (
           SELECT jsonb_array_elements_text($2::jsonb)
         )`,
      [item.organizationId, JSON.stringify(item.similarExerciseIds)],
    );
    const found = new Set(
      targetRows.map((row) => requiredRowString(row.id, "similar exercise id")),
    );
    if (
      item.similarExerciseIds.some(
        (similarId) => similarId === item.id || !found.has(similarId),
      )
    ) {
      throw new Error("Exercise catalog similarity references an unknown item.");
    }
  }

  await transaction.unsafe(
    `DELETE FROM appbasis_exercise_catalog_similarity
     WHERE organization_id = $1
       AND (exercise_id = $2 OR similar_exercise_id = $2)`,
    [item.organizationId, item.id],
  );

  for (const parameter of item.parameters) {
    await transaction.unsafe(
      `INSERT INTO appbasis_exercise_catalog_parameter (
         organization_id, exercise_id, parameter_key, label, unit, input_type,
         default_value, min_value, max_value, step_value, is_required,
         sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        item.organizationId,
        item.id,
        parameter.key,
        parameter.label,
        parameter.unit,
        parameter.inputType,
        parameter.defaultValue,
        parameter.minValue,
        parameter.maxValue,
        parameter.stepValue,
        parameter.isRequired,
        parameter.sortOrder,
      ],
    );
  }

  for (const audienceId of item.audienceIds) {
    await transaction.unsafe(
      `INSERT INTO appbasis_exercise_catalog_audience (
         organization_id, exercise_id, audience_id
       )
       VALUES ($1, $2, $3)`,
      [item.organizationId, item.id, audienceId],
    );
  }

  for (const [sortOrder, videoUrl] of item.videoUrls.entries()) {
    await transaction.unsafe(
      `INSERT INTO appbasis_exercise_catalog_video (
         organization_id, exercise_id, video_url, sort_order
       )
       VALUES ($1, $2, $3, $4)`,
      [item.organizationId, item.id, videoUrl, sortOrder],
    );
  }

  for (const similarId of item.similarExerciseIds) {
    await transaction.unsafe(
      `INSERT INTO appbasis_exercise_catalog_similarity (
         organization_id, exercise_id, similar_exercise_id
       )
       VALUES ($1, $2, $3), ($1, $3, $2)
       ON CONFLICT DO NOTHING`,
      [item.organizationId, item.id, similarId],
    );
  }
}

function itemSqlParameters(
  item: ExerciseCatalogItem,
): ExerciseCatalogSqlParameter[] {
  return [
    item.id,
    item.organizationId,
    item.name,
    item.categoryKey,
    item.subcategory,
    item.difficultyKey,
    item.goal,
    item.description,
    item.coachingCues,
    item.commonMistakes,
    JSON.stringify(item.equipment),
    item.videoUrls[0] ?? null,
    item.isActive,
  ];
}

function itemFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  parameters: readonly ExerciseCatalogParameter[],
  audienceIds: readonly string[],
  videoUrls: readonly string[],
  similarExerciseIds: readonly string[],
): ExerciseCatalogItem {
  const organizationId = requiredRowString(
    row.organization_id,
    "organization id",
  );
  if (organizationId !== expectedOrganizationId) {
    throw new Error(
      "Exercise catalog row escaped the requested organization scope.",
    );
  }
  const equipment = row.equipment;
  if (
    !Array.isArray(equipment) ||
    !equipment.every((entry) => typeof entry === "string")
  ) {
    throw new Error("Exercise catalog equipment row has an invalid shape.");
  }
  if (typeof row.is_active !== "boolean") {
    throw new Error("Exercise catalog active flag has an invalid shape.");
  }

  return Object.freeze({
    id: requiredRowString(row.id, "exercise id"),
    organizationId,
    name: requiredRowString(row.name, "exercise name"),
    categoryKey: requiredRowString(row.category_key, "category key"),
    subcategory: optionalRowString(row.subcategory, "subcategory"),
    difficultyKey: optionalRowString(row.difficulty_key, "difficulty key"),
    goal: optionalRowString(row.goal, "goal"),
    description: optionalRowString(row.description, "description"),
    coachingCues: optionalRowString(row.coaching_cues, "coaching cues"),
    commonMistakes: optionalRowString(
      row.common_mistakes,
      "common mistakes",
    ),
    equipment: Object.freeze([...equipment]),
    videoUrl: videoUrls[0] ?? optionalRowString(row.video_url, "video URL"),
    videoUrls: Object.freeze([...videoUrls]),
    audienceIds: Object.freeze([...audienceIds]),
    similarExerciseIds: Object.freeze([...similarExerciseIds]),
    parameters: Object.freeze(
      parameters.map((parameter) => Object.freeze({ ...parameter })),
    ),
    isActive: row.is_active,
  });
}

function parameterFromRow(
  row: Record<string, unknown>,
): ExerciseCatalogParameter {
  const inputType = row.input_type;
  if (inputType !== "number" && inputType !== "text") {
    throw new Error(
      "Exercise catalog parameter input type has an invalid shape.",
    );
  }
  if (typeof row.is_required !== "boolean") {
    throw new Error(
      "Exercise catalog parameter required flag has an invalid shape.",
    );
  }
  const sortOrder = requiredInteger(row.sort_order, "parameter sort order");
  return Object.freeze({
    key: requiredRowString(row.parameter_key, "parameter key"),
    label: requiredRowString(row.label, "parameter label"),
    unit: requiredRowStringAllowEmpty(row.unit, "parameter unit"),
    inputType,
    defaultValue: optionalRowString(
      row.default_value,
      "parameter default value",
    ),
    minValue: optionalNumber(row.min_value, "parameter minimum"),
    maxValue: optionalNumber(row.max_value, "parameter maximum"),
    stepValue: optionalNumber(row.step_value, "parameter step"),
    isRequired: row.is_required,
    sortOrder,
  });
}

function usageFromRow(
  row: Record<string, unknown>,
): ExerciseCatalogUsageEvent {
  return Object.freeze({
    id: requiredRowString(row.id, "usage id"),
    organizationId: requiredRowString(
      row.organization_id,
      "usage organization id",
    ),
    exerciseId: requiredRowString(row.exercise_id, "usage exercise id"),
    occurredAt: requiredRowString(row.occurred_at, "usage occurred at"),
    sourceKind: requiredRowString(row.source_kind, "usage source kind"),
    sourceRef: optionalRowString(row.source_ref, "usage source ref"),
    note: optionalRowString(row.note, "usage note"),
  });
}

function privateMediaFromRow(
  row: Record<string, unknown>,
): ExerciseCatalogPrivateMedia {
  const sizeBytes = requiredInteger(row.size_bytes, "private media size");
  return Object.freeze({
    id: requiredRowString(row.id, "private media id"),
    organizationId: requiredRowString(
      row.organization_id,
      "private media organization id",
    ),
    exerciseId: requiredRowString(
      row.exercise_id,
      "private media exercise id",
    ),
    fileName: requiredRowString(row.file_name, "private media file name"),
    storageKey: requiredRowString(row.storage_key, "private media storage key"),
    contentType: requiredRowString(
      row.content_type,
      "private media content type",
    ),
    sizeBytes,
    createdAt: requiredRowString(row.created_at, "private media created at"),
  });
}

function scopedChildExerciseId(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  knownIds: ReadonlySet<string>,
): string {
  const organizationId = requiredRowString(
    row.organization_id,
    "child organization id",
  );
  const exerciseId = requiredRowString(row.exercise_id, "child exercise id");
  if (
    organizationId !== expectedOrganizationId ||
    !knownIds.has(exerciseId)
  ) {
    throw new Error(
      "Exercise catalog child row escaped the requested item scope.",
    );
  }
  return exerciseId;
}

function requiredRowString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Exercise catalog " + label + " has an invalid shape.");
  }
  return value;
}

function requiredRowStringAllowEmpty(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new Error("Exercise catalog " + label + " has an invalid shape.");
  }
  return value;
}

function optionalRowString(
  value: unknown,
  label: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Exercise catalog " + label + " has an invalid shape.");
  }
  return value;
}

function optionalNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error("Exercise catalog " + label + " has an invalid shape.");
  }
  return parsed;
}

function requiredInteger(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Exercise catalog " + label + " has an invalid shape.");
  }
  return parsed;
}
