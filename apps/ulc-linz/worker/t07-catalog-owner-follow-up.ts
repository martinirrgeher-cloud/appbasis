import type {
  ExerciseCatalogPersonalDeletionResult,
} from "@appbasis/exercise-catalog";

/**
 * Fifth, independently owned, write-guarded catalogue step.
 *
 * Different from athlete subject erasure: catalogue personal usage/favorites
 * are keyed by a verified *identity principal*. No fallback to subjectId,
 * name, free text, source_ref or training group. The identity owner must
 * already have physically deleted the account and published the canonical
 * app-owned identity deletion marker, still within its original 35 days.
 */
export const ULC_T07_CATALOG_FENCE_SQL = `
SELECT count(*)::int AS active_fences
FROM pg_catalog.pg_trigger AS trigger
JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger.tgrelid
JOIN pg_catalog.pg_namespace AS ns ON ns.oid=relation.relnamespace
WHERE ns.nspname='public' AND NOT trigger.tgisinternal
  AND trigger.tgenabled IN ('O','A')
  AND trigger.tgfoid=
    to_regprocedure('public.appbasis_exercise_catalog_subject_deletion_write_fence()')
  AND (relation.relname, trigger.tgname) IN (
    ('appbasis_exercise_catalog_favorite',
      'appbasis_exercise_catalog_favorite_deletion_write_fence'),
    ('appbasis_exercise_catalog_usage_subject',
      'appbasis_exercise_catalog_usage_subject_deletion_write_fence')
  )`;

export interface UlcT07CatalogSqlClient {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcT07CatalogOwner {
  markPrincipalDeletedAndDeletePersonalCatalogData(
    organizationId: string,
    principalId: string,
    completedAt: Date,
  ): Promise<ExerciseCatalogPersonalDeletionResult>;
}

export interface UlcT07CatalogFollowUpResult {
  readonly markerInserted: boolean;
  readonly deletedFavorites: number;
  readonly deletedUsageEvents: number;
  readonly scope: "catalogue-verified-identity-only";
  readonly humanTextReviewed: false;
  readonly providerMediaAbsenceVerified: false;
  readonly olderRestorePromotionAllowed: false;
}

export class PostgresUlcT07CatalogOwnerFollowUp {
  constructor(
    private readonly sql: UlcT07CatalogSqlClient,
    private readonly catalog: UlcT07CatalogOwner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async erase(
    organizationId: string,
    subjectId: string,
    actorIdentityId: string,
  ): Promise<UlcT07CatalogFollowUpResult> {
    if (![organizationId, subjectId, actorIdentityId].every(validId)) {
      throw new Error("T07 catalog scope invalid.");
    }
    const timestamp = this.now();
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
      throw new Error("T07 catalog clock invalid.");
    }
    // Protected module flags alone do not prove the real database installed
    // the two write fences. Never erase before confirming the live catalog.
    const fence = await this.sql.unsafe(ULC_T07_CATALOG_FENCE_SQL);
    if (fence.length !== 1 || fence[0]?.active_fences !== 2) {
      throw new Error("T07 catalogue v6 SQL write fences are not both active.");
    }
    const links = await this.sql.unsafe(
      `SELECT identity_id, completed_at, purge_after
       FROM ulc_linz_lifecycle_deletion
       WHERE organization_id=$1 AND subject_id=$2
         AND source_role='athlete' AND purge_after > $3::timestamptz
       ORDER BY identity_id
       LIMIT 2`,
      [organizationId, subjectId, timestamp.toISOString()],
    );
    if (links.length !== 1) {
      throw new Error("T07 catalogue owner requires exactly one current canonical identity deletion.");
    }
    const identityId = links[0]?.identity_id;
    const completedAt = validTime(links[0]?.completed_at);
    const expiry = validTime(links[0]?.purge_after);
    if (
      !validId(identityId) || identityId === actorIdentityId ||
      completedAt.getTime() > timestamp.getTime() ||
      expiry.getTime() - completedAt.getTime() !== 35 * 24 * 60 * 60 * 1000 ||
      expiry.getTime() <= timestamp.getTime()
    ) {
      throw new Error("T07 catalogue identity deletion authority invalid.");
    }
    // Fail before any write if an earlier owner has an inconsistent marker.
    const markers = await this.sql.unsafe(
      `SELECT completed_at, purge_after
       FROM appbasis_exercise_catalog_favorite_deletion
       WHERE organization_id=$1 AND principal_id=$2`,
      [organizationId, identityId],
    );
    if (
      markers.length > 1 ||
      (markers.length === 1 && (
        validTime(markers[0]?.completed_at).getTime() !== completedAt.getTime() ||
        validTime(markers[0]?.purge_after).getTime() !== expiry.getTime()
      ))
    ) {
      throw new Error("T07 catalogue owner marker conflicts with canonical identity deletion.");
    }

    const result = await this.catalog.markPrincipalDeletedAndDeletePersonalCatalogData(
      organizationId, identityId, completedAt,
    );
    if (
      !result || typeof result.markerInserted !== "boolean" ||
      !validCount(result.deletedFavorites) || !validCount(result.deletedUsageEvents)
    ) throw new Error("T07 catalogue owner deletion result invalid.");
    return Object.freeze({
      markerInserted: result.markerInserted,
      deletedFavorites: result.deletedFavorites,
      deletedUsageEvents: result.deletedUsageEvents,
      scope: "catalogue-verified-identity-only" as const,
      humanTextReviewed: false as const,
      providerMediaAbsenceVerified: false as const,
      olderRestorePromotionAllowed: false as const,
    });
  }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    value === value.trim() && !value.includes("\0");
}
function validTime(value: unknown): Date {
  const dt = value instanceof Date ? value : new Date(
    typeof value === "string" ? value : Number.NaN,
  );
  if (!Number.isFinite(dt.getTime())) {
    throw new Error("T07 catalogue owner timestamp invalid.");
  }
  return dt;
}
function validCount(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
