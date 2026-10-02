import {
  createUlcExerciseCatalogItem,
  type UlcExerciseCatalogItem,
  type UlcExerciseParameterDefinition,
} from "./exercise-catalog-domain";

type SqlParameter = string | number | boolean | null;

export interface UlcExerciseCatalogSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcExerciseCatalogRecord extends UlcExerciseCatalogItem {
  readonly isFavorite: boolean;
}

export class UlcExerciseCatalogNotFoundError extends Error {
  readonly code = "EXERCISE_CATALOG_NOT_FOUND";

  constructor() {
    super("Exercise catalog item was not found.");
    this.name = "UlcExerciseCatalogNotFoundError";
  }
}

export class UlcExerciseCatalogConflictError extends Error {
  readonly code = "EXERCISE_CATALOG_CONFLICT";

  constructor() {
    super("Exercise catalog item conflicts with existing state.");
    this.name = "UlcExerciseCatalogConflictError";
  }
}

export class UlcExerciseCatalogPersistenceError extends Error {
  readonly code = "EXERCISE_CATALOG_PERSISTENCE_ERROR";

  constructor() {
    super("Exercise catalog persistence returned an inconsistent state.");
    this.name = "UlcExerciseCatalogPersistenceError";
  }
}

export class PostgresUlcExerciseCatalogRepository {
  readonly #sql: UlcExerciseCatalogSqlClient;

  constructor(sql: UlcExerciseCatalogSqlClient) {
    this.#sql = sql;
  }

  async list(
    organizationId: string,
    identityId: string,
  ): Promise<readonly UlcExerciseCatalogRecord[]> {
    const organization = requiredIdentifier(organizationId);
    const identity = requiredIdentifier(identityId);

    const [items, parameters, groups, favorites] = await Promise.all([
      this.#sql.unsafe(
        `SELECT id, organization_id, name, category_key, subcategory, goal,
                description, coaching_cues, common_mistakes, equipment,
                video_url, is_active
         FROM ulc_linz_exercise_catalog_item
         WHERE organization_id = $1
         ORDER BY is_active DESC, lower(name) ASC, id ASC`,
        [organization],
      ),
      this.#sql.unsafe(
        `SELECT organization_id, exercise_id, parameter_key, label, unit,
                input_type, default_value,
                min_value::float8 AS min_value,
                max_value::float8 AS max_value,
                step_value::float8 AS step_value,
                is_required, sort_order
         FROM ulc_linz_exercise_parameter
         WHERE organization_id = $1
         ORDER BY exercise_id ASC, sort_order ASC, parameter_key ASC`,
        [organization],
      ),
      this.#sql.unsafe(
        `SELECT organization_id, exercise_id, group_id
         FROM ulc_linz_exercise_group
         WHERE organization_id = $1
         ORDER BY exercise_id ASC, group_id ASC`,
        [organization],
      ),
      this.#sql.unsafe(
        `SELECT organization_id, exercise_id
         FROM ulc_linz_exercise_favorite
         WHERE organization_id = $1
           AND identity_id = $2
         ORDER BY exercise_id ASC`,
        [organization, identity],
      ),
    ]);

    return hydrate(items, parameters, groups, favorites, organization);
  }

  async read(
    organizationId: string,
    identityId: string,
    exerciseId: string,
  ): Promise<UlcExerciseCatalogRecord | null> {
    const id = requiredIdentifier(exerciseId);
    const rows = await this.list(organizationId, identityId);
    return rows.find((item) => item.id === id) ?? null;
  }

  async create(item: UlcExerciseCatalogItem): Promise<void> {
    const rows = await this.#sql.unsafe(
      `WITH inserted AS (
         INSERT INTO ulc_linz_exercise_catalog_item (
           id, organization_id, name, category_key, subcategory, goal,
           description, coaching_cues, common_mistakes, equipment,
           video_url, is_active
         )
         SELECT
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           ARRAY(
             SELECT jsonb_array_elements_text($10::jsonb)
           ),
           $11, true
         WHERE NOT EXISTS (
           SELECT 1
           FROM ulc_linz_exercise_catalog_item
           WHERE organization_id = $2
             AND lower(name) = lower($3)
         )
         RETURNING id
       ),
       inserted_parameters AS (
         INSERT INTO ulc_linz_exercise_parameter (
           organization_id, exercise_id, parameter_key, label, unit,
           input_type, default_value, min_value, max_value, step_value,
           is_required, sort_order
         )
         SELECT
           $2, inserted.id, p.parameter_key, p.label, p.unit,
           p.input_type, p.default_value, p.min_value, p.max_value,
           p.step_value, p.is_required, p.sort_order
         FROM inserted
         CROSS JOIN LATERAL jsonb_to_recordset($12::jsonb) AS p(
           parameter_key text,
           label text,
           unit text,
           input_type text,
           default_value text,
           min_value numeric,
           max_value numeric,
           step_value numeric,
           is_required boolean,
           sort_order integer
         )
         RETURNING 1
       ),
       inserted_groups AS (
         INSERT INTO ulc_linz_exercise_group (
           organization_id, exercise_id, group_id
         )
         SELECT $2, inserted.id, selected.group_id
         FROM inserted
         CROSS JOIN LATERAL jsonb_array_elements_text($13::jsonb)
           AS selected(group_id)
         RETURNING 1
       )
       SELECT id FROM inserted`,
      [
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
        JSON.stringify(parameterRows(item.parameters)),
        JSON.stringify(item.groupIds),
      ],
    );

    if (rows.length === 0) throw new UlcExerciseCatalogConflictError();
    if (rows.length !== 1 || rows[0]?.["id"] !== item.id) blocked();
  }

  async update(item: UlcExerciseCatalogItem): Promise<void> {
    const rows = await this.#sql.unsafe(
      `WITH target AS MATERIALIZED (
         SELECT id
         FROM ulc_linz_exercise_catalog_item
         WHERE id = $1
           AND organization_id = $2
           AND is_active = true
       ),
       conflict AS MATERIALIZED (
         SELECT 1
         FROM ulc_linz_exercise_catalog_item
         WHERE organization_id = $2
           AND id <> $1
           AND lower(name) = lower($3)
         LIMIT 1
       ),
       updated AS (
         UPDATE ulc_linz_exercise_catalog_item
         SET name = $3,
             category_key = $4,
             subcategory = $5,
             goal = $6,
             description = $7,
             coaching_cues = $8,
             common_mistakes = $9,
             equipment = ARRAY(
               SELECT jsonb_array_elements_text($10::jsonb)
             ),
             video_url = $11,
             updated_at = now()
         WHERE id IN (SELECT id FROM target)
           AND NOT EXISTS (SELECT 1 FROM conflict)
         RETURNING id
       ),
       deleted_parameters AS (
         DELETE FROM ulc_linz_exercise_parameter
         WHERE organization_id = $2
           AND exercise_id IN (SELECT id FROM updated)
         RETURNING 1
       ),
       deleted_groups AS (
         DELETE FROM ulc_linz_exercise_group
         WHERE organization_id = $2
           AND exercise_id IN (SELECT id FROM updated)
         RETURNING 1
       ),
       inserted_parameters AS (
         INSERT INTO ulc_linz_exercise_parameter (
           organization_id, exercise_id, parameter_key, label, unit,
           input_type, default_value, min_value, max_value, step_value,
           is_required, sort_order
         )
         SELECT
           $2, updated.id, p.parameter_key, p.label, p.unit,
           p.input_type, p.default_value, p.min_value, p.max_value,
           p.step_value, p.is_required, p.sort_order
         FROM updated
         CROSS JOIN LATERAL jsonb_to_recordset($12::jsonb) AS p(
           parameter_key text,
           label text,
           unit text,
           input_type text,
           default_value text,
           min_value numeric,
           max_value numeric,
           step_value numeric,
           is_required boolean,
           sort_order integer
         )
         RETURNING 1
       ),
       inserted_groups AS (
         INSERT INTO ulc_linz_exercise_group (
           organization_id, exercise_id, group_id
         )
         SELECT $2, updated.id, selected.group_id
         FROM updated
         CROSS JOIN LATERAL jsonb_array_elements_text($13::jsonb)
           AS selected(group_id)
         RETURNING 1
       )
       SELECT
         EXISTS (SELECT 1 FROM target) AS target_exists,
         EXISTS (SELECT 1 FROM conflict) AS conflict_exists,
         (SELECT count(*)::int FROM updated) AS updated_count`,
      [
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
        JSON.stringify(parameterRows(item.parameters)),
        JSON.stringify(item.groupIds),
      ],
    );

    if (rows.length !== 1 || rows[0] === undefined) blocked();
    const row = rows[0];
    if (row["target_exists"] !== true) throw new UlcExerciseCatalogNotFoundError();
    if (row["conflict_exists"] === true) throw new UlcExerciseCatalogConflictError();
    if (row["updated_count"] !== 1) blocked();
  }

  async deactivate(
    organizationId: string,
    exerciseId: string,
  ): Promise<void> {
    const rows = await this.#sql.unsafe(
      `UPDATE ulc_linz_exercise_catalog_item
       SET is_active = false,
           updated_at = now()
       WHERE organization_id = $1
         AND id = $2
         AND is_active = true
       RETURNING id`,
      [requiredIdentifier(organizationId), requiredIdentifier(exerciseId)],
    );
    if (rows.length === 0) throw new UlcExerciseCatalogNotFoundError();
    if (rows.length !== 1) blocked();
  }

  async setFavorite(
    organizationId: string,
    identityId: string,
    exerciseId: string,
    favorite: boolean,
  ): Promise<void> {
    const organization = requiredIdentifier(organizationId);
    const identity = requiredIdentifier(identityId);
    const exercise = requiredIdentifier(exerciseId);

    const rows = favorite
      ? await this.#sql.unsafe(
          `WITH target AS MATERIALIZED (
             SELECT id
             FROM ulc_linz_exercise_catalog_item
             WHERE organization_id = $1
               AND id = $3
           ),
           changed AS (
             INSERT INTO ulc_linz_exercise_favorite (
               organization_id, identity_id, exercise_id
             )
             SELECT $1, $2, id
             FROM target
             ON CONFLICT (organization_id, identity_id, exercise_id)
               DO NOTHING
             RETURNING exercise_id
           )
           SELECT EXISTS (SELECT 1 FROM target) AS target_exists`,
          [organization, identity, exercise],
        )
      : await this.#sql.unsafe(
          `WITH target AS MATERIALIZED (
             SELECT id
             FROM ulc_linz_exercise_catalog_item
             WHERE organization_id = $1
               AND id = $3
           ),
           changed AS (
             DELETE FROM ulc_linz_exercise_favorite
             WHERE organization_id = $1
               AND identity_id = $2
               AND exercise_id IN (SELECT id FROM target)
             RETURNING exercise_id
           )
           SELECT EXISTS (SELECT 1 FROM target) AS target_exists`,
          [organization, identity, exercise],
        );

    if (rows.length !== 1 || rows[0] === undefined) blocked();
    if (rows[0]["target_exists"] !== true) {
      throw new UlcExerciseCatalogNotFoundError();
    }
  }
}

function hydrate(
  itemRows: readonly Record<string, unknown>[],
  parameterRowsInput: readonly Record<string, unknown>[],
  groupRows: readonly Record<string, unknown>[],
  favoriteRows: readonly Record<string, unknown>[],
  organizationId: string,
): readonly UlcExerciseCatalogRecord[] {
  const itemIds = new Set<string>();
  for (const row of itemRows) {
    if (row["organization_id"] !== organizationId) blocked();
    const id = rowIdentifier(row, "id");
    if (itemIds.has(id)) blocked();
    itemIds.add(id);
  }

  const parameters = new Map<string, UlcExerciseParameterDefinition[]>();
  for (const row of parameterRowsInput) {
    if (row["organization_id"] !== organizationId) blocked();
    const exerciseId = rowIdentifier(row, "exercise_id");
    if (!itemIds.has(exerciseId)) blocked();
    const list = parameters.get(exerciseId) ?? [];
    list.push({
      key: rowIdentifier(row, "parameter_key") as UlcExerciseParameterDefinition["key"],
      label: rowString(row, "label"),
      unit: rowString(row, "unit"),
      inputType: rowIdentifier(row, "input_type") as UlcExerciseParameterDefinition["inputType"],
      defaultValue: rowNullableString(row, "default_value"),
      minValue: rowNullableNumber(row, "min_value"),
      maxValue: rowNullableNumber(row, "max_value"),
      stepValue: rowNullableNumber(row, "step_value"),
      isRequired: rowBoolean(row, "is_required"),
      sortOrder: rowInteger(row, "sort_order"),
    });
    parameters.set(exerciseId, list);
  }

  const groups = new Map<string, string[]>();
  for (const row of groupRows) {
    if (row["organization_id"] !== organizationId) blocked();
    const exerciseId = rowIdentifier(row, "exercise_id");
    if (!itemIds.has(exerciseId)) blocked();
    const list = groups.get(exerciseId) ?? [];
    list.push(rowIdentifier(row, "group_id"));
    groups.set(exerciseId, list);
  }

  const favorites = new Set<string>();
  for (const row of favoriteRows) {
    if (row["organization_id"] !== organizationId) blocked();
    const exerciseId = rowIdentifier(row, "exercise_id");
    if (!itemIds.has(exerciseId) || favorites.has(exerciseId)) blocked();
    favorites.add(exerciseId);
  }

  return Object.freeze(
    itemRows.map((row) => {
      const id = rowIdentifier(row, "id");
      const item = createUlcExerciseCatalogItem(
        {
          name: rowString(row, "name"),
          categoryKey: rowIdentifier(row, "category_key") as UlcExerciseCatalogItem["categoryKey"],
          subcategory: rowNullableString(row, "subcategory"),
          goal: rowNullableString(row, "goal"),
          description: rowNullableString(row, "description"),
          coachingCues: rowNullableString(row, "coaching_cues"),
          commonMistakes: rowNullableString(row, "common_mistakes"),
          equipment: rowStringArray(row, "equipment"),
          videoUrl: rowNullableString(row, "video_url"),
          groupIds: groups.get(id) ?? [],
          parameters: parameters.get(id) ?? [],
          isActive: rowBoolean(row, "is_active"),
        },
        { id, organizationId },
      );
      return Object.freeze({
        ...item,
        isFavorite: favorites.has(id),
      });
    }),
  );
}

function parameterRows(
  parameters: readonly UlcExerciseParameterDefinition[],
): readonly Record<string, unknown>[] {
  return parameters.map((parameter) => ({
    parameter_key: parameter.key,
    label: parameter.label,
    unit: parameter.unit,
    input_type: parameter.inputType,
    default_value: parameter.defaultValue,
    min_value: parameter.minValue,
    max_value: parameter.maxValue,
    step_value: parameter.stepValue,
    is_required: parameter.isRequired,
    sort_order: parameter.sortOrder,
  }));
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    blocked();
  }
  return value;
}

function rowIdentifier(row: Record<string, unknown>, key: string): string {
  return requiredIdentifier(row[key]);
}

function rowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") blocked();
  return value;
}

function rowNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") blocked();
  return value;
}

function rowStringArray(
  row: Record<string, unknown>,
  key: string,
): readonly string[] {
  const value = row[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    blocked();
  }
  return Object.freeze([...value]);
}

function rowBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") blocked();
  return value;
}

function rowInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) blocked();
  return value;
}

function rowNullableNumber(
  row: Record<string, unknown>,
  key: string,
): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) blocked();
  return value;
}

function blocked(): never {
  throw new UlcExerciseCatalogPersistenceError();
}
