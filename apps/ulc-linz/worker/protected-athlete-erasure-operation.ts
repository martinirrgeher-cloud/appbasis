import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "@appbasis/database";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { createIdentityRuntime } from "@appbasis/identity/server";
import { PostgresPermissionStore } from "@appbasis/permissions";
import { PostgresTrainingBlockRepository } from "@appbasis/training-blocks";
import { PostgresTrainingDocumentationRepository } from "@appbasis/training-documentation";
import { PostgresTrainingPlanRepository } from "@appbasis/training-plans";

import {
  deleteUlcLinzAthleteFourOwnerStructuredDependentsAfterRetention,
  inspectUlcLinzAthleteSubjectDeletionFollowUp,
  type UlcLinzAthleteFourOwnerStructuredDeletionResult,
  type UlcLinzAthleteSubjectDeletionPreflight,
  type UlcLinzAthleteSubjectDeletionRequest,
} from "./lifecycle-service";
import { PostgresUlcLinzScopePersistence } from "./scope-persistence";
import { PostgresUlcTrainingSubjectProtectedHistoryRepository } from
  "./training-subject-history-protected-postgres";
import { PostgresUlcTrainingSubjectPrivacyInspector } from
  "./training-subject-privacy-postgres";

const CONFIRMATION = "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS";

/** Exact read-only SQL pinned by a real two-schema PostgreSQL E2E. */
export const ULC_T07_FOUR_OWNER_MARKER_SQL = `
  SELECT 'documentation' AS owner, completed_at, purge_after
  FROM appbasis_training_documentation_subject_deletion
  WHERE organization_id = $1 AND subject_id = $2
  UNION ALL
  SELECT 'history' AS owner, completed_at, purge_after
  FROM ulc_linz_training_subject_deletion
  WHERE organization_id = $1 AND athlete_id = $2`;

/**
 * Explicit owner-connection control-plane operation. Nothing imports this from
 * the public Worker, scheduler or existing destructive identity retention.
 * This is intentionally NOT an eight-owner erasure, free-text redaction,
 * restore promotion or legal T10 approval.
 */
export interface ProtectedAthleteErasureOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
  /** Authenticated, signed Better Auth admin session, not an identity ID. */
  readonly administrativeSessionToken: string;
  /** An explicit operator-selected target DB; production is neondb. */
  readonly expectedDatabaseName: string;
  readonly now?: () => Date;
}

export interface ProtectedAthleteErasurePreflight {
  readonly status: "source-unverifiable" | "owner-marker-conflict" |
    "structured-follow-up-pending" | "structured-owner-markers-match";
  readonly preflight: UlcLinzAthleteSubjectDeletionPreflight;
  readonly documentationMarkerPresent: boolean | null;
  readonly historyMarkerPresent: boolean | null;
  readonly documentationOwned: number | null;
  readonly documentationOtherRevisions: number | null;
  readonly attendanceRows: number | null;
  readonly registrationRows: number | null;
  readonly registrationHistoryRows: number | null;
  readonly freeTextAndAuditReviewed: false;
  readonly allowsOlderRestorePromotion: false;
  readonly allowsFullPrivacyReady: false;
}

export interface ProtectedAthleteErasureOperation {
  inspect(request: UlcLinzAthleteSubjectDeletionRequest): Promise<ProtectedAthleteErasurePreflight>;
  eraseStructuredOnly(
    request: UlcLinzAthleteSubjectDeletionRequest,
    authorization: Readonly<{ confirmation: string; expectedSourceCompletedAt: string }>,
  ): Promise<Readonly<{
    status: "four-structured-owners-complete-only";
    result: UlcLinzAthleteFourOwnerStructuredDeletionResult;
    verified: ProtectedAthleteErasurePreflight;
    freeTextAndAuditReviewed: false;
    allowsOlderRestorePromotion: false;
    allowsFullPrivacyReady: false;
  }>>;
  close(): Promise<void>;
}

export async function createProtectedUlcLinzAthleteErasure(
  options: ProtectedAthleteErasureOptions,
): Promise<ProtectedAthleteErasureOperation> {
  if (
    !options || typeof options.connectionString !== "string" ||
    options.connectionString.length === 0 ||
    typeof options.baseURL !== "string" ||
    typeof options.secret !== "string" || options.secret.length < 32 ||
    typeof options.administrativeSessionToken !== "string" ||
    options.administrativeSessionToken.length === 0 ||
    typeof options.expectedDatabaseName !== "string" ||
    options.expectedDatabaseName.length === 0 ||
    options.expectedDatabaseName !== options.expectedDatabaseName.trim() ||
    (options.now !== undefined && typeof options.now !== "function")
  ) throw new Error("ULC T07 protected operation options are invalid.");

  const connection = createPostgresDatabase(options.connectionString);
  try {
    const db = await connection.client.unsafe("SELECT current_database() AS database_name");
    if (db.length !== 1 || db[0]?.database_name !== options.expectedDatabaseName) {
      throw new Error("ULC T07 protected operation database does not match.");
    }

    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: options.baseURL,
      secret: options.secret,
    });
    const identity = createIdentityRuntime({
      auth, sql: connection.client, baseURL: options.baseURL,
      administrativeSessionToken: options.administrativeSessionToken,
    }).service;
    const permissions = new PostgresPermissionStore(connection.client);
    const scopes = new PostgresUlcLinzScopePersistence(connection.client);
    const athletes = new PostgresAthleteMasterdataRepository(connection.client);
    const plans = new PostgresTrainingPlanRepository(connection.client);
    const usage = new PostgresTrainingBlockRepository(connection.client);
    const documentation = new PostgresTrainingDocumentationRepository(connection.client);
    const training = new PostgresUlcTrainingSubjectProtectedHistoryRepository(connection.client);
    const trainingPrivacy = new PostgresUlcTrainingSubjectPrivacyInspector(connection.client);
    const now = options.now ?? (() => new Date());

    async function currentAdmin() {
      const current = await identity.getCurrentIdentity(options.administrativeSessionToken);
      if (current === null) throw new Error("ULC T07 administrator session is no longer active.");
      return current;
    }

    async function inspect(request: UlcLinzAthleteSubjectDeletionRequest):
      Promise<ProtectedAthleteErasurePreflight> {
      const current = await currentAdmin();
      // This canonical check must pass before any personal module exposure.
      const base = await inspectUlcLinzAthleteSubjectDeletionFollowUp(
        current, { permissions, scopes, athletes, plans, usage, now }, request,
      );
      if (base.status === "source-unverifiable") {
        return Object.freeze({
          status: base.status, preflight: base,
          documentationMarkerPresent: null, historyMarkerPresent: null,
          documentationOwned: null, documentationOtherRevisions: null,
          attendanceRows: null, registrationRows: null, registrationHistoryRows: null,
          freeTextAndAuditReviewed: false as const,
          allowsOlderRestorePromotion: false as const,
          allowsFullPrivacyReady: false as const,
        });
      }
      // Real read-only v19 DB owner and trigger check. This is NOT a write.
      await training.assertGuardReady();
      // The two remaining owner markers must exist after erasure, and may
      // not disagree with the authoritative source before any owner write.
      const markerRows = await connection.client.unsafe(
        ULC_T07_FOUR_OWNER_MARKER_SQL,
        [base.organizationId, base.subjectId],
      );
      if (markerRows.length > 2 || markerRows.some((row) =>
        row.owner !== "documentation" && row.owner !== "history"
      )) throw new Error("ULC T07 owner marker inventory is invalid.");
      const docMarker = markerRows.find((row) => row.owner === "documentation");
      const historyMarker = markerRows.find((row) => row.owner === "history");
      const sourceTime = base.completedAt!.getTime();
      const expectedExpiry = sourceTime + 35 * 24 * 60 * 60 * 1000;
      const markerMatches = (row: typeof docMarker) => !row || (
        new Date(row.completed_at as string).getTime() === sourceTime &&
        new Date(row.purge_after as string).getTime() === expectedExpiry
      );
      const markerConflict = !markerMatches(docMarker) || !markerMatches(historyMarker);
      const doc = await documentation.inspectSubjectPrivacy(
        base.organizationId, base.subjectId,
      );
      const app = await trainingPrivacy.inspectSubjectPrivacy(
        base.organizationId, base.subjectId,
      );
      if (
        doc.organizationId !== base.organizationId ||
        doc.subjectId !== base.subjectId ||
        app.organizationId !== base.organizationId ||
        app.subjectId !== base.subjectId
      ) throw new Error("ULC T07 subject privacy inventory scope mismatch.");

      const pending = base.status !== "owner-markers-match" ||
        !docMarker || !historyMarker ||
        doc.ownedDocuments !== 0 || doc.ownedRevisions !== 0 ||
        doc.otherSubjectDocumentsWithParticipant !== 0 ||
        doc.otherSubjectRevisionsWithParticipant !== 0 ||
        app.attendanceRows !== 0 || app.registrationRows !== 0 ||
        app.registrationHistoryRows !== 0;
      return Object.freeze({
        status: base.status === "owner-marker-conflict" || markerConflict
          ? "owner-marker-conflict" as const
          : pending ? "structured-follow-up-pending" as const
          : "structured-owner-markers-match" as const,
        preflight: base,
        documentationMarkerPresent: !!docMarker,
        historyMarkerPresent: !!historyMarker,
        documentationOwned: doc.ownedDocuments,
        documentationOtherRevisions: doc.otherSubjectRevisionsWithParticipant,
        attendanceRows: app.attendanceRows,
        registrationRows: app.registrationRows,
        registrationHistoryRows: app.registrationHistoryRows,
        freeTextAndAuditReviewed: false as const,
        allowsOlderRestorePromotion: false as const,
        allowsFullPrivacyReady: false as const,
      });
    }

    return Object.freeze({
      inspect,
      async eraseStructuredOnly(
        request: UlcLinzAthleteSubjectDeletionRequest,
        authorization: Readonly<{ confirmation: string; expectedSourceCompletedAt: string }>,
      ) {
        if (!authorization ||
            authorization.confirmation !== CONFIRMATION ||
            typeof authorization.expectedSourceCompletedAt !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
              authorization.expectedSourceCompletedAt,
            )) {
          throw new Error("ULC T07 exact structured-only erasure approval is missing.");
        }
        // Independent read-only inspection and guard validation BEFORE the
        // first owner write. Never infer consent from a missing marker.
        const before = await inspect(request);
        const completed = before.preflight.completedAt;
        if (
          before.status === "source-unverifiable" ||
          before.status === "owner-marker-conflict" ||
          !(completed instanceof Date) ||
          !Number.isFinite(completed.getTime()) ||
          completed.toISOString() !== authorization.expectedSourceCompletedAt
        ) throw new Error("ULC T07 source decision is not approved for this exact request.");

        const current = await currentAdmin();
        const result = await deleteUlcLinzAthleteFourOwnerStructuredDependentsAfterRetention(
          current, { permissions, scopes, athletes, plans, usage, documentation, training, now },
          request,
        );
        if (result.completedAt.getTime() !== completed.getTime()) {
          throw new Error("ULC T07 source decision changed while deleting.");
        }
        // A genuine, post-write read-only owner check, never just trusting
        // affected-row counts. Any exception may indicate PARTIAL completion.
        const verified = await inspect(request);
        if (verified.status !== "structured-owner-markers-match") {
          throw new Error("ULC T07 structured erasure remains incomplete; operator review.");
        }
        return Object.freeze({
          status: "four-structured-owners-complete-only" as const,
          result, verified,
          freeTextAndAuditReviewed: false as const,
          allowsOlderRestorePromotion: false as const,
          allowsFullPrivacyReady: false as const,
        });
      },
      async close() { await connection.client.end(); },
    });
  } catch (error) {
    await connection.client.end().catch(() => {});
    throw error;
  }
}
