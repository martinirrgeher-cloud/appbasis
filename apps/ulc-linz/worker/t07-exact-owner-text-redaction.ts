/**
 * T07 private one-cell manual redaction, limited to explicitly approved
 * app-owned free-text fields. This is NOT a public API or a deletion classifier.
 *
 * A responsible administrator must separately establish that the specific cell
 * contains personal data of the approved subject, that deleting its WHOLE
 * value does not damage another person's legitimate data, and that no legal
 * retention hold applies. The canonical source marker and the exact original
 * SHA-256 are rechecked inside the same row-locking transaction.
 */
import type { UlcT07NoteRedactionSqlPort } from "./t07-exact-session-note-redaction";

const KEY = /^[a-zA-Z0-9._:-]{1,200}$/;
const REVISION = /^[1-9][0-9]{0,8}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type KeyColumn = Readonly<{ name: string; format: "key" | "revision" }>;
type Target = Readonly<{ table: string; column: string; keys: readonly KeyColumn[] }>;

/**
 * Static SQL allowlist, including historic revision rows. No table/column/key
 * identifier originates from user input or from the GitHub workflow.
 */
const TARGETS = Object.freeze({
  "registration-note": { table: "ulc_linz_training_registration", column: "note",
    keys: [{ name: "session_id", format: "key" }, { name: "athlete_id", format: "key" }] },
  "registration-change-note": { table: "ulc_linz_training_registration_change", column: "note",
    keys: [{ name: "id", format: "key" }] },
  "documentation-revision-note": { table: "appbasis_training_documentation_revision", column: "note",
    keys: [{ name: "documentation_id", format: "key" }, { name: "revision", format: "revision" }] },
  "training-plan-revision-note": { table: "appbasis_training_plan_revision", column: "note",
    keys: [{ name: "plan_id", format: "key" }, { name: "revision", format: "revision" }] },
  "training-plan-item-note": { table: "appbasis_training_plan_revision_item", column: "note",
    keys: [{ name: "plan_id", format: "key" }, { name: "revision", format: "revision" },
      { name: "item_id", format: "key" }] },
  "training-plan-item-comment": { table: "appbasis_training_plan_revision_item", column: "comment",
    keys: [{ name: "plan_id", format: "key" }, { name: "revision", format: "revision" },
      { name: "item_id", format: "key" }] },
  "training-block-revision-note": { table: "appbasis_training_block_revision", column: "note",
    keys: [{ name: "block_id", format: "key" }, { name: "revision", format: "revision" }] },
  "training-block-item-note": { table: "appbasis_training_block_revision_item", column: "note",
    keys: [{ name: "block_id", format: "key" }, { name: "revision", format: "revision" },
      { name: "item_id", format: "key" }] },
  "training-block-usage-note": { table: "appbasis_training_block_usage", column: "note",
    keys: [{ name: "id", format: "key" }] },
  "training-block-usage-source-ref": { table: "appbasis_training_block_usage", column: "source_ref",
    keys: [{ name: "id", format: "key" }] },
  "exercise-catalog-usage-note": { table: "appbasis_exercise_catalog_usage", column: "note",
    keys: [{ name: "id", format: "key" }] },
  "exercise-catalog-usage-source-ref": { table: "appbasis_exercise_catalog_usage", column: "source_ref",
    keys: [{ name: "id", format: "key" }] },
} as const satisfies Record<string, Target>);

export type UlcT07ExactTextTarget = keyof typeof TARGETS;
export const ULC_T07_EXACT_TEXT_TARGET_NAMES =
  Object.freeze(Object.keys(TARGETS) as UlcT07ExactTextTarget[]);

export interface UlcT07ExactTextDecision {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly expectedSourceCompletedAt: string;
  readonly target: UlcT07ExactTextTarget;
  readonly keys: readonly string[];
  /** SHA-256 of the EXACT existing UTF-8 cell, not the subject name or PII. */
  readonly expectedValueSha256: string;
}

export class PostgresUlcT07ExactOwnerTextRedactor {
  constructor(private readonly sql: UlcT07NoteRedactionSqlPort) {}

  async redact(decision: UlcT07ExactTextDecision): Promise<Readonly<{
    status: "one-exact-owner-text-cell-redacted-only";
    redacted: true;
    freeTextAndAuditReviewed: false;
    fullPrivacyComplete: false;
    olderRestorePromotionAllowed: false;
  }>> {
    if (!decision || !KEY.test(decision.organizationId) ||
        !KEY.test(decision.subjectId) ||
        !ISO.test(decision.expectedSourceCompletedAt) ||
        !Number.isFinite(Date.parse(decision.expectedSourceCompletedAt)) ||
        !DIGEST.test(decision.expectedValueSha256) ||
        !Object.prototype.hasOwnProperty.call(TARGETS, decision.target)) {
      throw new Error("T07 exact owner text decision or source invalid.");
    }
    const target: Target = TARGETS[decision.target];
    const keys = decision.keys;
    if (!Array.isArray(keys) || keys.length !== target.keys.length ||
        keys.some((k, i) =>
          typeof k !== "string" ||
          !(target.keys[i]!.format === "revision" ? REVISION : KEY).test(k))) {
      throw new Error("T07 exact owner text keys are invalid.");
    }

    const params = [decision.organizationId, ...keys] as string[];
    const where = ["organization_id = $1",
      ...target.keys.map((key, i) => `${key.name} = $${i + 2}${key.format === "revision" ? "::integer" : ""}`),
    ].join(" AND ");
    const sha = `encode(sha256(convert_to(${target.column}, 'UTF8')), 'hex')`;

    return this.sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      // Re-read the real (35d) authoritative athlete marker in the write
      // transaction. A stale/colliding marker is not erasure authority.
      const source = await tx.unsafe(
        `SELECT completed_at
           FROM ulc_linz_lifecycle_deletion
          WHERE organization_id=$1 AND subject_id=$2
            AND source_role='athlete'
            AND completed_at=$3::timestamptz
            AND purge_after=completed_at + interval '840 hours'
            AND completed_at<=now() AND purge_after>now()
          FOR SHARE`,
        [decision.organizationId, decision.subjectId, decision.expectedSourceCompletedAt],
      );
      if (source.length !== 1) {
        throw new Error("T07 exact text source is expired, missing or conflicting.");
      }
      const prior = await tx.unsafe(
        `SELECT ${sha} AS value_hash FROM ${target.table}
         WHERE ${where} FOR UPDATE`,
        params,
      );
      if (prior.length !== 1 ||
          prior[0]?.value_hash !== decision.expectedValueSha256) {
        throw new Error("T07 exact owner text no longer matches the approved value.");
      }
      const changed = await tx.unsafe(
        `UPDATE ${target.table} SET ${target.column} = NULL
         WHERE ${where} AND ${target.column} IS NOT NULL
           AND ${sha} = $${params.length + 1}
         RETURNING 1 AS affected`,
        [...params, decision.expectedValueSha256],
      );
      if (changed.length !== 1 || changed[0]?.affected !== 1) {
        throw new Error("T07 exact owner text mutation did not affect one cell.");
      }
      const verified = await tx.unsafe(
        `SELECT ${target.column} IS NULL AS redacted FROM ${target.table}
         WHERE ${where}`, params,
      );
      if (verified.length !== 1 || verified[0]?.redacted !== true) {
        throw new Error("T07 exact owner text readback did not prove redaction.");
      }
      return Object.freeze({
        status: "one-exact-owner-text-cell-redacted-only" as const,
        redacted: true as const,
        freeTextAndAuditReviewed: false as const,
        fullPrivacyComplete: false as const,
        olderRestorePromotionAllowed: false as const,
      });
    });
  }
}
