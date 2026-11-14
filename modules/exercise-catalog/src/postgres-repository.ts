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

/**
 * Optional P02-G safety path. Do not enable in a live app until catalog
 * migration 0004 and the cross-owner erasure authority are both approved.
 * No implicit fallback when the marker schema is absent.
 */
export type ExerciseCatalogFavoriteFenceMode =
  | "legacy-unprotected"
  | "require-catalog-erasure-marker";

export interface ExerciseCatalogFavoriteDeletionResult {
  readonly markerInserted: boolean;
  readonly deletedFavorites: number;
}

/** Explicit context, not verified by this module. A trusted caller must
 * verify identity/authorization at the true source of subject ownership. */
export interface ExerciseCatalogUsageSubjectContext {
  readonly organizationId: string;
  readonly principalId: string;
  readonly usageId: string;
  readonly verifiedBy: "identity" | "athletes";
}

export type ExerciseCatalogUsageWriteMode =
  | "legacy-unprotected"
  | "require-explicit-subject";

export interface ExerciseCatalogPersonalDeletionResult
  extends ExerciseCatalogFavoriteDeletionResult {
  readonly deletedUsageEvents: number;
}

export class ExerciseCatalogUsageSubjectRequiredError extends Error {
  constructor() {
    super("Exercise catalog usage requires a verified subject and active deletion fence.");
    this.name = "ExerciseCatalogUsageSubjectRequiredError";
  }
}

export class ExerciseCatalogFavoriteDeletedError extends Error {
  constructor() {
    super("Exercise catalog favorite is blocked by a deletion marker.");
    this.name = "ExerciseCatalogFavoriteDeletedError";
  }
}

export class PostgresExerciseCatalogRepository
  implements ExerciseCatalogRepository
{
  readonly #client: ExerciseCatalogPostgresClient;
  readonly #favoriteFenceMode: ExerciseCatalogFavoriteFenceMode;
  readonly #usageWriteMode: ExerciseCatalogUsageWriteMode;

  constructor(
    client: ExerciseCatalogPostgresClient,
    options: Readonly<{
      favoriteFenceMode?: ExerciseCatalogFavoriteFenceMode;
      usageWriteMode?: ExerciseCatalogUsageWriteMode;
    }> = {},
  ) {
    this.#client = client;
    const mode = options.favoriteFenceMode ?? "legacy-unprotected";
    if (
      mode !== "legacy-unprotected" &&
      mode !== "require-catalog-erasure-marker"
    ) {
      throw new Error("Exercise catalog favorite fence mode is invalid.");
    }
    const usageMode = options.usageWriteMode ?? "legacy-unprotected";
    if (
      usageMode !== "legacy-unprotected" &&
      usageMode !== "require-explicit-subject"
    ) {
      throw new Error("Exercise catalog usage write mode is invalid.");
    }
    if (
      usageMode === "require-explicit-subject" &&
      mode !== "require-catalog-erasure-marker"
    ) {
      throw new Error(
        "Exercise catalog usage subject protection requires the favorite erasure marker fence.",
      );
    }
    this.#favoriteFenceMode = mode;
    this.#usageWriteMode = usageMode;
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
    if (this.#favoriteFenceMode === "require-catalog-erasure-marker") {
      await this.#client.begin(async (transaction) => {
        await lockFavoritePrincipal(transaction, organizationId, principalId);
        if (favorite) {
          // Hard failure when migration 0004 does not exist; never fall back.
          const deleted = await transaction.unsafe(
            `SELECT 1 AS present
             FROM appbasis_exercise_catalog_favorite_deletion
             WHERE organization_id = $1 AND principal_id = $2`,
            [organizationId, principalId],
          );
          if (deleted.length > 1) {
            throw new Error("Exercise catalog favorite deletion marker is ambiguous.");
          }
          if (deleted.length !== 0) {
            throw new ExerciseCatalogFavoriteDeletedError();
          }
        }
        await writeFavorite(transaction, organizationId, principalId, exerciseId, favorite);
      });
      return;
    }
    // Explicit legacy path, retained for existing install compatibility.
    // Must not be used for a production-erasure guarantee.
    await writeFavorite(
      this.#client,
      organizationId,
      principalId,
      exerciseId,
      favorite,
    );
  }

  /**
   * Opt-in candidate: only an approved identity/privacy owner may invoke
   * this on the TRUE deletion decision. This repository does NOT infer the
   * right to delete a principal from its ID.
   *
   * Mark + purge is atomic with opt-in favorites, using the same lock.
   * It intentionally does not purge expired markers or reactivate users.
   */
  async markPrincipalDeletedAndDeleteFavorites(
    organizationId: string,
    principalId: string,
    completedAt: Date,
  ): Promise<ExerciseCatalogFavoriteDeletionResult> {
    if (this.#usageWriteMode === "require-explicit-subject") {
      // Prevent partial erasure in an owner that also stores personal usage.
      throw new Error(
        "Exercise catalog protected usage requires full personal-data deletion.",
      );
    }
    if (this.#favoriteFenceMode !== "require-catalog-erasure-marker") {
      throw new Error("Exercise catalog deletion requires approved fenced mode.");
    }
    if (
      !isValidFavoriteIdentity(organizationId) ||
      !isValidFavoriteIdentity(principalId) ||
      !(completedAt instanceof Date) ||
      !Number.isFinite(completedAt.getTime())
    ) {
      throw new Error("Exercise catalog principal deletion inputs are invalid.");
    }
    return this.#client.begin(async (transaction) => {
      await lockFavoritePrincipal(transaction, organizationId, principalId);
      const marker = await transaction.unsafe(
        `INSERT INTO appbasis_exercise_catalog_favorite_deletion
           (organization_id, principal_id, completed_at, purge_after)
         VALUES ($1, $2, $3::timestamptz, $3::timestamptz + interval '840 hours')
         ON CONFLICT (organization_id, principal_id) DO NOTHING
         RETURNING principal_id`,
        [organizationId, principalId, completedAt.toISOString()],
      );
      if (marker.length > 1) {
        throw new Error("Exercise catalog favorite deletion marker is invalid.");
      }
      const removed = await transaction.unsafe(
        `DELETE FROM appbasis_exercise_catalog_favorite
         WHERE organization_id = $1 AND principal_id = $2
         RETURNING exercise_id`,
        [organizationId, principalId],
      );
      return Object.freeze({
        markerInserted: marker.length === 1,
        deletedFavorites: removed.length,
      });
    });
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
    if (this.#usageWriteMode === "require-explicit-subject") {
      // A sourceRef is opaque and can refer to a plan/session, not a person.
      // A caller MUST NOT bypass explicit ownership by using this legacy API.
      throw new ExerciseCatalogUsageSubjectRequiredError();
    }
    await insertCatalogUsage(this.#client, event);
  }

  /**
   * Candidate guarded writer: callers MUST verify the supplied subject at
   * the canonical owner. The catalog DOES NOT authorize a claimed identity
   * on its own. This records explicit ownership for NEW usage only; it does
   * not infer subject identity from sourceRef, note or legacy data.
   */
  async recordUsageForVerifiedSubject(
    event: ExerciseCatalogUsageEvent,
    subject: ExerciseCatalogUsageSubjectContext,
  ): Promise<void> {
    if (this.#usageWriteMode !== "require-explicit-subject") {
      throw new ExerciseCatalogUsageSubjectRequiredError();
    }
    if (
      !event ||
      typeof event !== "object" ||
      !subject ||
      typeof subject !== "object" ||
      subject.organizationId !== event.organizationId ||
      subject.usageId !== event.id ||
      !isValidFavoriteIdentity(subject.organizationId) ||
      !isValidFavoriteIdentity(subject.principalId) ||
      (subject.verifiedBy !== "identity" && subject.verifiedBy !== "athletes")
    ) {
      throw new ExerciseCatalogUsageSubjectRequiredError();
    }
    await this.#client.begin(async (tx) => {
      // Same transaction lock as favorite erasure, before marker read/write.
      await lockFavoritePrincipal(tx, subject.organizationId, subject.principalId);
      const marker = await tx.unsafe(
        `SELECT 1 AS present
         FROM appbasis_exercise_catalog_favorite_deletion
         WHERE organization_id = $1 AND principal_id = $2`,
        [subject.organizationId, subject.principalId],
      );
      if (marker.length !== 0) {
        throw new ExerciseCatalogFavoriteDeletedError();
      }
      await insertCatalogUsage(tx, event);
      const linked = await tx.unsafe(
        `INSERT INTO appbasis_exercise_catalog_usage_subject (
           organization_id, usage_id, principal_id, verified_by
         ) VALUES ($1, $2, $3, $4)
         RETURNING usage_id`,
        [
          subject.organizationId,
          subject.usageId,
          subject.principalId,
          subject.verifiedBy,
        ],
      );
      if (
        linked.length !== 1 ||
        linked[0]?.usage_id !== subject.usageId
      ) {
        throw new Error("Exercise catalog usage subject link is invalid.");
      }
    });
  }

  /**
   * Candidate full catalog-owner erasure. Not a cross-owner authorization:
   * the caller must hold the independent, current, lawful deletion decision.
   * Atomic marker+favorites+new verified usage deletion, no heuristics for
   * ambiguous historical sourceRef or note text.
   */
  async markPrincipalDeletedAndDeletePersonalCatalogData(
    organizationId: string,
    principalId: string,
    completedAt: Date,
  ): Promise<ExerciseCatalogPersonalDeletionResult> {
    if (
      this.#favoriteFenceMode !== "require-catalog-erasure-marker" ||
      this.#usageWriteMode !== "require-explicit-subject"
    ) {
      throw new Error(
        "Exercise catalog personal erasure requires both protected modes.",
      );
    }
    if (
      !isValidFavoriteIdentity(organizationId) ||
      !isValidFavoriteIdentity(principalId) ||
      !(completedAt instanceof Date) ||
      !Number.isFinite(completedAt.getTime())
    ) {
      throw new Error("Exercise catalog personal erasure inputs are invalid.");
    }
    return this.#client.begin(async (tx) => {
      await lockFavoritePrincipal(tx, organizationId, principalId);
      const marker = await tx.unsafe(
        `INSERT INTO appbasis_exercise_catalog_favorite_deletion
           (organization_id, principal_id, completed_at, purge_after)
         VALUES ($1, $2, $3::timestamptz, $3::timestamptz + interval '840 hours')
         ON CONFLICT (organization_id, principal_id) DO NOTHING
         RETURNING principal_id`,
        [organizationId, principalId, completedAt.toISOString()],
      );
      if (marker.length > 1) {
        throw new Error("Exercise catalog personal erasure marker is invalid.");
      }
      const favorites = await tx.unsafe(
        `DELETE FROM appbasis_exercise_catalog_favorite
         WHERE organization_id = $1 AND principal_id = $2
         RETURNING exercise_id`,
        [organizationId, principalId],
      );
      const usage = await tx.unsafe(
        `DELETE FROM appbasis_exercise_catalog_usage AS u
         USING appbasis_exercise_catalog_usage_subject AS s
         WHERE u.organization_id = s.organization_id
           AND u.id = s.usage_id
           AND s.organization_id = $1 AND s.principal_id = $2
         RETURNING u.id`,
        [organizationId, principalId],
      );
      // ON DELETE CASCADE removes the verified subject link with the usage.
      return Object.freeze({
        markerInserted: marker.length === 1,
        deletedFavorites: favorites.length,
        deletedUsageEvents: usage.length,
      });
    });
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
         AND deletion_requested_at IS NULL
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

  async requestPrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<ExerciseCatalogPrivateMedia | undefined> {
    const rows = await this.#client.unsafe(
      `UPDATE appbasis_exercise_catalog_private_media
       SET deletion_requested_at = COALESCE(deletion_requested_at, now())
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
      throw new Error("Exercise catalog private media delete request returned multiple rows.");
    }
    return privateMediaFromRow(rows[0]!);
  }

  async completePrivateMediaDeletion(
    organizationId: string,
    exerciseId: string,
    mediaId: string,
  ): Promise<boolean> {
    const rows = await this.#client.unsafe(
      `DELETE FROM appbasis_exercise_catalog_private_media
       WHERE organization_id = $1
         AND exercise_id = $2
         AND id = $3
         AND deletion_requested_at IS NOT NULL
       RETURNING id`,
      [organizationId, exerciseId, mediaId],
    );
    if (rows.length > 1) {
      throw new Error("Exercise catalog private media delete completion returned multiple rows.");
    }
    return rows.length === 1;
  }
}

async function insertCatalogUsage(
  client: ExerciseCatalogPostgresQueryClient,
  event: ExerciseCatalogUsageEvent,
): Promise<void> {
  const rows = await client.unsafe(
    `INSERT INTO appbasis_exercise_catalog_usage (
       organization_id, id, exercise_id, occurred_at, source_kind, source_ref, note
     )
     SELECT $1, $2, $3, $4::timestamptz, $5, $6, $7
     WHERE EXISTS (
       SELECT 1 FROM appbasis_exercise_catalog_item
       WHERE organization_id = $1 AND id = $3
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

async function lockFavoritePrincipal(
  transaction: ExerciseCatalogPostgresQueryClient,
  organizationId: string,
  principalId: string,
): Promise<void> {
  if (
    !isValidFavoriteIdentity(organizationId) ||
    !isValidFavoriteIdentity(principalId)
  ) {
    throw new Error("Exercise catalog favorite identity is invalid.");
  }
  // Same scoped transaction lock as the already-tested training-block owner.
  await transaction.unsafe(
    `SELECT pg_advisory_xact_lock(
       hashtextextended(jsonb_build_array($1::text, $2::text)::text, 0)
     )`,
    [organizationId, principalId],
  );
}

function isValidFavoriteIdentity(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    value.trim() === value
  );
}

async function writeFavorite(
  client: ExerciseCatalogPostgresQueryClient,
  organizationId: string,
  principalId: string,
  exerciseId: string,
  favorite: boolean,
): Promise<void> {
  if (favorite) {
    await client.unsafe(
      `INSERT INTO appbasis_exercise_catalog_favorite (
         organization_id, principal_id, exercise_id
       )
       SELECT $1, $2, $3
       WHERE EXISTS (
         SELECT 1 FROM appbasis_exercise_catalog_item
         WHERE organization_id = $1 AND id = $3
       )
       ON CONFLICT (organization_id, principal_id, exercise_id)
       DO NOTHING`,
      [organizationId, principalId, exerciseId],
    );
    return;
  }
  await client.unsafe(
    `DELETE FROM appbasis_exercise_catalog_favorite
     WHERE organization_id = $1
       AND principal_id = $2
       AND exercise_id = $3`,
    [organizationId, principalId, exerciseId],
  );
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

  const legacyVideoUrl = optionalRowString(row.video_url, "video URL");
  const effectiveVideoUrls =
    videoUrls.length > 0
      ? videoUrls
      : legacyVideoUrl === null
        ? []
        : [legacyVideoUrl];

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
    videoUrl: effectiveVideoUrls[0] ?? null,
    videoUrls: Object.freeze([...effectiveVideoUrls]),
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
