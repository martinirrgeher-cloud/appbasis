/**
 * T07 operator-only, short-lived Wrangler remote-development entrypoint.
 * This file is NOT imported by the normal ULC Worker and is NEVER deployed.
 *
 * A GitHub Environment-authorized workflow starts it on the runner, binds
 * existing Hyperdrive, provides one-time credentials and uses a random
 * 256-bit operation token. No athlete IDs or free text are returned.
 */
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
    if (
      (mode !== "inspect" && mode !== "erase-structured-only") ||
      !subjectId || !SUBJECT_ID.test(subjectId) ||
      (mode === "inspect" && (confirmation !== INSPECT || completedAt !== null)) ||
      (mode === "erase-structured-only" &&
        (confirmation !== ERASE || !completedAt || !ISO.test(completedAt)))
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
        mode === "erase-structured-only"
          ? { confirmation: ERASE, expectedSourceCompletedAt: completedAt! }
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
