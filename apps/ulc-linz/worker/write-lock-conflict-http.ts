/**
 * Map transient database row/advisory-lock contention to a safe response.
 *
 * The guarded P24 SQL candidates use NOWAIT/pg_try_advisory_xact_lock so
 * concurrent deletion and updates fail immediately with PostgreSQL 55P03.
 * Do not retry an arbitrary HTTP write automatically: the browser may have
 * an unsaved draft and a second attempt could change its intended revision.
 *
 * Only the SQLSTATE is inspected. PostgreSQL's original message, detail,
 * hint, query, parameters, identities and media keys never leave the server.
 */
export function isUlcRetryableDatabaseLockConflict(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<object>();
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      return false;
    }
    seen.add(current);
    const item = current as { readonly code?: unknown; readonly cause?: unknown };
    if (item.code === "55P03") return true;
    current = item.cause;
  }
  return false;
}

export function ulcWriteLockConflictHttpResponse(error: unknown): Response | null {
  if (!isUlcRetryableDatabaseLockConflict(error)) return null;
  return Response.json(
    {
      error: {
        code: "ULC_WRITE_TEMPORARILY_BUSY",
        message: "The record is being updated or removed. Nothing was saved. Keep your changes, reload the current state and retry.",
      },
    },
    {
      status: 409,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
