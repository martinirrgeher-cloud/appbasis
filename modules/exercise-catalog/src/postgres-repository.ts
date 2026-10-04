import type {
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
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
           id, organization_id, name, category_key, subcategory, goal,
           description, coaching_cues, common_mistakes, equipment, video_url,
           is_active
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           ARRAY(SELECT jsonb_array_elements_text($10::jsonb)),
           $11, $12
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
    const rows = await this.#client.unsafe(
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
    `SELECT id, organization_id, name, category_key, subcategory, goal,
            description, coaching_cues, common_mistakes, equipment, video_url,
            is_active
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

  const [parameterRows, audienceRows] = await Promise.all([
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

  return Object.freeze(
    itemRows.map((row) =>
      itemFromRow(
        row,
        organizationId,
        parameters.get(requiredRowString(row.id, "exercise id")) ?? [],
        audiences.get(requiredRowString(row.id, "exercise id")) ?? [],
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
         goal = $6,
         description = $7,
         coaching_cues = $8,
         common_mistakes = $9,
         equipment = ARRAY(SELECT jsonb_array_elements_text($10::jsonb)),
         video_url = $11,
         is_active = $12,
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
    item.goal,
    item.description,
    item.coachingCues,
    item.commonMistakes,
    JSON.stringify(item.equipment),
    item.videoUrl,
    item.isActive,
  ];
}

function itemFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
  parameters: readonly ExerciseCatalogParameter[],
  audienceIds: readonly string[],
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
    goal: optionalRowString(row.goal, "goal"),
    description: optionalRowString(row.description, "description"),
    coachingCues: optionalRowString(row.coaching_cues, "coaching cues"),
    commonMistakes: optionalRowString(
      row.common_mistakes,
      "common mistakes",
    ),
    equipment: Object.freeze([...equipment]),
    videoUrl: optionalRowString(row.video_url, "video URL"),
    audienceIds: Object.freeze([...audienceIds]),
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
