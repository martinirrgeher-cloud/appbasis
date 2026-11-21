import { ulcWriteLockConflictHttpResponse } from "./write-lock-conflict-http";
import { UlcTrainingActorWriteBlockedError } from "./training-session-write-actor";
import { UlcTrainingScopeWriteBlockedError } from "./training-session-write-scope";
import { UlcTrainingSubjectWriteBlockedError } from "./training-session-postgres";

/**
 * A stale trainer right is NOT an unexpected server failure. Return only a
 * generic denial; neither athlete IDs nor database guard details are exposed.
 * A changed group/athlete roster is a recoverable conflict: retain local
 * drafts and let the user refresh after checking the server state.
 */
export function trainingWriteGuardHttpResponse(error: unknown): Response | null {
  const retryable = ulcWriteLockConflictHttpResponse(error);
  if (retryable !== null) return retryable;
  if (error instanceof UlcTrainingActorWriteBlockedError) {
    return Response.json(
      { error: {
        code: "TRAINING_WRITE_ACCESS_CHANGED",
        message: "Your permission to edit this training has changed. Please reload and contact an administrator if necessary.",
      }},
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (error instanceof UlcTrainingScopeWriteBlockedError ||
      error instanceof UlcTrainingSubjectWriteBlockedError) {
    return Response.json(
      { error: {
        code: "TRAINING_WRITE_SCOPE_CHANGED",
        message: "The group or participant roster has changed. Your changes were not saved. Please reload after checking the latest training.",
      }},
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return null;
}
