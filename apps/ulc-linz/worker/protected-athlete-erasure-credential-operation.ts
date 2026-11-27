import { createPostgresDatabase } from "@appbasis/database";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { BetterAuthIdentityBackend } from "@appbasis/identity/server";

import {
  createProtectedUlcLinzAthleteErasure,
  type ProtectedAthleteErasureOperation,
} from "./protected-athlete-erasure-operation";
import type {
  UlcLinzAthleteSubjectDeletionRequest,
} from "./lifecycle-service";

export type UlcLinzProtectedAthleteErasureMode =
  "inspect" | "erase-structured-only" | "erase-catalog-owner-only" |
  "erase-identity-owner-only" | "redact-session-note-only" |
  "redact-exact-owner-text-only";

export interface UlcLinzProtectedAthleteErasureCredentialOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
  readonly administratorUsername: string;
  readonly administratorPassword: string;
}

/**
 * Isolated operator-only credential entrypoint. Not used by the public Worker,
 * normal identity retention job or release scheduler. Explicit caller
 * approval must be supplied again for the structured-only mutation.
 *
 * Never print session cookies, subject IDs, notes or account data. An error
 * from an owner transaction may mean PARTIAL completion; replay only while
 * the authoritative athlete marker is current and identical.
 */
export async function runProtectedUlcLinzAthleteErasureWithCredentials(
  options: UlcLinzProtectedAthleteErasureCredentialOptions,
  request: UlcLinzAthleteSubjectDeletionRequest,
  mode: UlcLinzProtectedAthleteErasureMode,
  authorization?: Readonly<{
    confirmation: string;
    expectedSourceCompletedAt: string;
    sessionId?: string;
    expectedSessionDate?: string;
    expectedNoteSha256?: string;
    textTarget?: string;
    textKeys?: readonly string[];
    expectedValueSha256?: string;
  }>,
) {
  if (
    !options ||
    typeof options.connectionString !== "string" ||
    options.connectionString.trim() !== options.connectionString ||
    !/^postgres(?:ql)?:\/\//.test(options.connectionString) ||
    typeof options.baseURL !== "string" ||
    options.baseURL !== "https://app.ulc-linz.at" ||
    typeof options.secret !== "string" ||
    options.secret.length < 32 ||
    typeof options.administratorUsername !== "string" ||
    !/^[a-z0-9._]{3,30}$/.test(options.administratorUsername) ||
    typeof options.administratorPassword !== "string" ||
    options.administratorPassword.length < 8 ||
    options.administratorPassword.length > 128 ||
    options.administratorPassword.trim().length === 0
  ) throw new Error("ULC T07 protected credentials or production binding are invalid.");

  if (mode !== "inspect" && mode !== "erase-structured-only" &&
      mode !== "erase-catalog-owner-only" &&
      mode !== "erase-identity-owner-only" &&
      mode !== "redact-session-note-only" &&
      mode !== "redact-exact-owner-text-only") {
    throw new Error("ULC T07 protected operation mode is invalid.");
  }
  if (mode !== "inspect" &&
    (!authorization ||
      authorization.confirmation !== (
        mode === "erase-structured-only"
          ? "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS"
          : mode === "erase-catalog-owner-only"
            ? "ERASE-ULC-T07-VERIFIED-CATALOG-OWNER"
            : mode === "erase-identity-owner-only"
              ? "ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER"
              : mode === "redact-session-note-only"
                ? "REDACT-ULC-T07-EXACT-SESSION-NOTE"
                : "REDACT-ULC-T07-EXACT-OWNER-TEXT"
      ) ||
      typeof authorization.expectedSourceCompletedAt !== "string")
  ) throw new Error("ULC T07 owner deletion has no explicit operator approval.");

  const connection = createPostgresDatabase(options.connectionString);
  const backend = new BetterAuthIdentityBackend({
    auth: createBetterAuthRuntime({
      database: connection.database,
      baseURL: options.baseURL,
      secret: options.secret,
    }),
    sql: connection.client,
    baseURL: options.baseURL,
  });

  let sessionToken: string | null = null;
  let operation: ProtectedAthleteErasureOperation | null = null;
  let primaryError: unknown = null;
  try {
    const session = await backend.signInWithUsername({
      username: options.administratorUsername,
      password: options.administratorPassword,
    });
    sessionToken = session.sessionToken;
    operation = await createProtectedUlcLinzAthleteErasure({
      connectionString: options.connectionString,
      baseURL: options.baseURL,
      secret: options.secret,
      administrativeSessionToken: sessionToken,
      expectedDatabaseName: "neondb",
    });
    if (mode === "inspect") {
      const inspected = await operation.inspect(request);
      return Object.freeze({
        status: inspected.status,
        sourceDecisionAt: inspected.preflight.completedAt?.toISOString() ?? null,
        planMarkerPresent: inspected.preflight.planMarkerPresent,
        usageMarkerPresent: inspected.preflight.usageMarkerPresent,
        documentationMarkerPresent: inspected.documentationMarkerPresent,
        historyMarkerPresent: inspected.historyMarkerPresent,
        documentationOwned: inspected.documentationOwned,
        documentationOtherRevisions: inspected.documentationOtherRevisions,
        attendanceRows: inspected.attendanceRows,
        registrationRows: inspected.registrationRows,
        registrationHistoryRows: inspected.registrationHistoryRows,
        residualReview: inspected.residualReview,
        eightOwnerReview: inspected.eightOwnerReview,
        fullErasureAuthorized: false as const,
        olderRestorePromotionAuthorized: false as const,
      });
    }
    if (mode === "redact-exact-owner-text-only") {
      if (!authorization || typeof authorization.textTarget !== "string" ||
          !Array.isArray(authorization.textKeys) ||
          typeof authorization.expectedValueSha256 !== "string") {
        throw new Error("T07 exact multi-owner text approval is missing.");
      }
      const finished = await operation.redactExactOwnerTextOnly(request, {
        confirmation: authorization.confirmation,
        organizationId: request.organizationId,
        subjectId: request.subjectId,
        expectedSourceCompletedAt: authorization.expectedSourceCompletedAt,
        target: authorization.textTarget as Parameters<ProtectedAthleteErasureOperation["redactExactOwnerTextOnly"]>[1]["target"],
        keys: authorization.textKeys,
        expectedValueSha256: authorization.expectedValueSha256,
      });
      return Object.freeze({
        status: finished.status,
        exactOwnerTextProofVerified: true as const,
        fullErasureAuthorized: false as const,
        olderRestorePromotionAuthorized: false as const,
      });
    }
    if (mode === "redact-session-note-only") {
      if (!authorization || typeof authorization.sessionId !== "string" ||
          typeof authorization.expectedSessionDate !== "string" ||
          typeof authorization.expectedNoteSha256 !== "string") {
        throw new Error("T07 exact session note approval metadata is missing.");
      }
      const finished = await operation.redactSessionNoteOnly(request, {
        confirmation: authorization.confirmation,
        expectedSourceCompletedAt: authorization.expectedSourceCompletedAt,
        sessionId: authorization.sessionId,
        expectedSessionDate: authorization.expectedSessionDate,
        expectedNoteSha256: authorization.expectedNoteSha256,
      });
      return Object.freeze({
        status: finished.status,
        sessionNoteProofVerified: true as const,
        fullErasureAuthorized: false as const,
        olderRestorePromotionAuthorized: false as const,
      });
    }
    if (mode === "erase-identity-owner-only") {
      const finished = await operation.eraseIdentityOwnerOnly(request, authorization!);
      return Object.freeze({
        status: finished.status,
        sourceDecisionAt: finished.verified.preflight.completedAt!.toISOString(),
        identityOwnerProofVerified: true as const,
        blockFavoriteMarkerVerified: true as const,
        fullErasureAuthorized: false as const,
        olderRestorePromotionAuthorized: false as const,
      });
    }
    if (mode === "erase-catalog-owner-only") {
      const finished = await operation.eraseCatalogOwnerOnly(request, authorization!);
      return Object.freeze({
        status: finished.status,
        sourceDecisionAt: finished.verified.preflight.completedAt!.toISOString(),
        catalogOwnerProofVerified: true as const,
        fullErasureAuthorized: false as const,
        olderRestorePromotionAuthorized: false as const,
      });
    }
    const finished = await operation.eraseStructuredOnly(request, authorization!);
    return Object.freeze({
      status: finished.status,
      sourceDecisionAt: finished.result.completedAt.toISOString(),
      structuredOwnersVerified: true as const,
      fullErasureAuthorized: false as const,
      olderRestorePromotionAuthorized: false as const,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError: unknown = null;
    if (operation) {
      try { await operation.close(); }
      catch (error) { cleanupError = error; }
    }
    if (sessionToken) {
      try {
        await backend.endSession(sessionToken);
        if ((await backend.getSession(sessionToken)) !== null) {
          throw new Error("ULC T07 transient administrator session cleanup failed.");
        }
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try { await connection.client.end(); }
    catch (error) { cleanupError ??= error; }
    if (primaryError === null && cleanupError !== null) throw cleanupError;
  }
}
