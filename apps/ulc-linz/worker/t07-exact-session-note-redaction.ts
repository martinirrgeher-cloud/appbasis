/**
 * App-owned, exact-record T07 manual redaction for a shared training-session note.
 *
 * This is NOT a public route, automatic retention, text-to-person matcher,
 * or evidence that all personal data have been erased. A protected caller must
 * independently verify the administrator, the original athlete deletion
 * authority and a private per-record operator decision before invoking it.
 *
 * Keep the operation intentionally narrow: shared training sessions must not
 * be deleted or stripped of other athletes' data during a subject erasure.
 */
export interface UlcT07NoteRedactionSqlPort {
  begin<T>(handler: (transaction: UlcT07NoteRedactionSqlTransaction) => Promise<T>): Promise<T>;
}
export interface UlcT07NoteRedactionSqlTransaction {
  unsafe(query: string, parameters?: (string | number | boolean | null)[]):
    PromiseLike<readonly Record<string, unknown>[]>;
}
export interface UlcT07ExactSessionNoteDecision {
  readonly organizationId: string;
  readonly sessionId: string;
  /** Private, exact expected session date to prevent cross-session selection. */
  readonly expectedSessionDate: string;
  /** SHA-256 of the exact UTF-8 note inspected and separately approved. */
  readonly expectedNoteSha256: string;
}
export interface UlcT07ExactSessionNoteRedaction {
  readonly status: "one-shared-session-note-redacted-only";
  readonly redacted: true;
  readonly fullPrivacyComplete: false;
  readonly olderRestorePromotionAllowed: false;
}

const ID = /^[a-zA-Z0-9._:-]{1,200}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class PostgresUlcT07ExactSessionNoteRedactor {
  constructor(private readonly sql: UlcT07NoteRedactionSqlPort) {}

  async redact(
    decision: UlcT07ExactSessionNoteDecision,
  ): Promise<UlcT07ExactSessionNoteRedaction> {
    if (
      !decision || !ID.test(decision.organizationId) ||
      !ID.test(decision.sessionId) ||
      !DAY.test(decision.expectedSessionDate) ||
      !Number.isFinite(Date.parse(decision.expectedSessionDate + "T00:00:00.000Z")) ||
      !SHA256.test(decision.expectedNoteSha256)
    ) throw new Error("T07 exact shared session note decision is invalid.");

    return this.sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      // Lock the precise session row; note writes from normal session edits
      // must serialize with this manual owner mutation.
      const rows = await tx.unsafe(
        `SELECT session_date::text AS session_date,
                encode(sha256(convert_to(note, 'UTF8')), 'hex') AS note_sha256
           FROM ulc_linz_training_session
          WHERE organization_id = $1 AND id = $2
          FOR UPDATE`,
        [decision.organizationId, decision.sessionId],
      );
      if (rows.length !== 1 ||
          rows[0]?.session_date !== decision.expectedSessionDate ||
          rows[0]?.note_sha256 !== decision.expectedNoteSha256) {
        throw new Error("T07 session note changed or has no exact approved match.");
      }

      const modified = await tx.unsafe(
        `UPDATE ulc_linz_training_session
            SET note = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = $2
            AND session_date = $3::date
            AND note IS NOT NULL
            AND encode(sha256(convert_to(note, 'UTF8')), 'hex') = $4
          RETURNING id`,
        [
          decision.organizationId, decision.sessionId,
          decision.expectedSessionDate, decision.expectedNoteSha256,
        ],
      );
      if (modified.length !== 1 || modified[0]?.id !== decision.sessionId) {
        throw new Error("T07 approved session note could not be redacted exactly once.");
      }
      const verified = await tx.unsafe(
        `SELECT note IS NULL AS redacted
           FROM ulc_linz_training_session
          WHERE organization_id = $1 AND id = $2 AND session_date = $3::date`,
        [decision.organizationId, decision.sessionId, decision.expectedSessionDate],
      );
      if (verified.length !== 1 || verified[0]?.redacted !== true) {
        throw new Error("T07 exact session note redaction readback failed.");
      }
      // No note content, subject, session ID or fingerprint in the result.
      return Object.freeze({
        status: "one-shared-session-note-redacted-only" as const,
        redacted: true as const,
        fullPrivacyComplete: false as const,
        olderRestorePromotionAllowed: false as const,
      });
    });
  }
}
