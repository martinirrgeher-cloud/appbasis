/**
 * T07 operator-only, short-lived Wrangler remote-development entrypoint.
 * This file is NOT imported by the normal ULC Worker and is NEVER deployed.
 *
 * A GitHub Environment-authorized workflow starts it on the runner, binds
 * existing Hyperdrive, provides one-time credentials and uses a random
 * 256-bit operation token. No athlete IDs or free text are returned.
 */
import { ULC_T07_EXACT_TEXT_TARGET_NAMES, type UlcT07ExactTextTarget } from
  "./t07-exact-owner-text-redaction";
import { runProtectedUlcLinzAthleteErasureWithCredentials } from
  "./protected-athlete-erasure-credential-operation";

export interface UlcLinzT07OperatorEnvironment {
  readonly HYPERDRIVE?: Readonly<{ connectionString?: unknown }>;
  readonly BETTER_AUTH_SECRET?: unknown;
  readonly ADMINISTRATOR_USERNAME?: unknown;
  readonly ADMINISTRATOR_PASSWORD?: unknown;
  readonly T07_OPERATION_TOKEN?: unknown;
}

const PATH = "/__appbasis/t07/athlete-erasure";
const INSPECT = "INSPECT-ULC-T07-STRUCTURED-OWNERS";
const ERASE = "ERASE-ULC-T07-FOUR-STRUCTURED-OWNERS";
const CATALOG = "ERASE-ULC-T07-VERIFIED-CATALOG-OWNER";
const IDENTITY = "ERASE-ULC-T07-VERIFIED-IDENTITY-OWNER";
const NOTE = "REDACT-ULC-T07-EXACT-SESSION-NOTE";
const OWNER_TEXT = "REDACT-ULC-T07-EXACT-OWNER-TEXT";
const SUBJECT_ID = /^[a-zA-Z0-9._:-]{1,200}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export default {
  async fetch(request: Request, env: UlcLinzT07OperatorEnvironment): Promise<Response> {
    const supplied = request.headers.get("x-appbasis-t07-token");
    const expected = env?.T07_OPERATION_TOKEN;
    const url = new URL(request.url);
    if (
      request.method !== "POST" ||
      url.pathname !== PATH ||
      typeof expected !== "string" ||
      expected.length < 32 ||
      supplied !== expected
    ) return new Response(null, { status: 404 });

    const mode = request.headers.get("x-appbasis-t07-operation");
    const subjectId = request.headers.get("x-appbasis-t07-subject-id");
    const confirmation = request.headers.get("x-appbasis-t07-confirmation");
    const completedAt = request.headers.get("x-appbasis-t07-source-completed-at");
    const sessionId = request.headers.get("x-appbasis-t07-session-id");
    const sessionDay = request.headers.get("x-appbasis-t07-session-date");
    const noteSha = request.headers.get("x-appbasis-t07-session-note-sha256");
    const textTarget = request.headers.get("x-appbasis-t07-text-target");
    const textKey1 = request.headers.get("x-appbasis-t07-text-key-1");
    const textKey2 = request.headers.get("x-appbasis-t07-text-key-2");
    const textKey3 = request.headers.get("x-appbasis-t07-text-key-3");
    const textHash = request.headers.get("x-appbasis-t07-text-sha256");
    const textKeys = [textKey1, textKey2, textKey3].filter((key): key is string => key !== null);
    if (
      (mode !== "inspect" && mode !== "erase-structured-only" &&
        mode !== "erase-catalog-owner-only" &&
        mode !== "erase-identity-owner-only" &&
        mode !== "redact-session-note-only" &&
        mode !== "redact-exact-owner-text-only") ||
      !subjectId || !SUBJECT_ID.test(subjectId) ||
      (mode === "redact-session-note-only"
        ? (!sessionId || !SUBJECT_ID.test(sessionId) ||
           !sessionDay || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDay) ||
           !noteSha || !/^[a-f0-9]{64}$/.test(noteSha))
        : (sessionId !== null || sessionDay !== null || noteSha !== null)) ||
      (mode === "redact-exact-owner-text-only"
        ? (!textTarget || !ULC_T07_EXACT_TEXT_TARGET_NAMES.includes(textTarget as UlcT07ExactTextTarget) ||
           !textKey1 || !SUBJECT_ID.test(textKey1) ||
           (textKey2 !== null && !SUBJECT_ID.test(textKey2)) ||
           (textKey3 !== null && (!textKey2 || !SUBJECT_ID.test(textKey3))) ||
           !textHash || !/^[0-9a-f]{64}$/.test(textHash))
        : (textTarget !== null || textKey1 !== null || textKey2 !== null ||
           textKey3 !== null || textHash !== null)) ||
      (mode === "inspect" && (confirmation !== INSPECT || completedAt !== null)) ||
      (mode !== "inspect" &&
        (confirmation !== (mode === "erase-structured-only"
          ? ERASE : mode === "erase-catalog-owner-only" ? CATALOG :
            mode === "erase-identity-owner-only" ? IDENTITY :
            mode === "redact-session-note-only" ? NOTE : OWNER_TEXT) ||
          !completedAt || !ISO.test(completedAt)))
    ) return new Response(null, { status: 404 });

    const connectionString = env.HYPERDRIVE?.connectionString;
    const secret = env.BETTER_AUTH_SECRET;
    const username = env.ADMINISTRATOR_USERNAME;
    const password = env.ADMINISTRATOR_PASSWORD;
    if (
      typeof connectionString !== "string" || connectionString.length === 0 ||
      typeof secret !== "string" || secret.length < 32 ||
      typeof username !== "string" || !/^[a-z0-9._]{3,30}$/.test(username) ||
      typeof password !== "string" || password.length < 8 || password.length > 128
    ) return new Response(null, { status: 503 });

    try {
      const result = await runProtectedUlcLinzAthleteErasureWithCredentials(
        {
          connectionString,
          baseURL: "https://app.ulc-linz.at",
          secret,
          administratorUsername: username,
          administratorPassword: password,
        },
        { organizationId: "ulc-linz", subjectId },
        mode,
        mode !== "inspect"
          ? { confirmation: mode === "erase-structured-only"
              ? ERASE : mode === "erase-catalog-owner-only" ? CATALOG :
                mode === "erase-identity-owner-only" ? IDENTITY :
                mode === "redact-session-note-only" ? NOTE : OWNER_TEXT,
            expectedSourceCompletedAt: completedAt!,
            ...(mode === "redact-exact-owner-text-only" ? {
              textTarget: textTarget!, textKeys,
              expectedValueSha256: textHash!,
            } : {}),
            ...(mode === "redact-session-note-only" ? {
              sessionId: sessionId!, expectedSessionDate: sessionDay!,
              expectedNoteSha256: noteSha!,
            } : {}) }
          : undefined,
      );
      // The credential layer already projects a strict, PII-free envelope.
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      // A partial transaction may have committed in an earlier owner. Never
      // disclose internal SQL errors or subject identifiers over HTTP.
      return new Response(null, { status: 503 });
    }
  },
};
