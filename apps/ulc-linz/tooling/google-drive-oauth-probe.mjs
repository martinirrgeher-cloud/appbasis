import { pathToFileURL } from "node:url";

import {
  checkUlcGoogleDriveOAuthReadOnly,
} from "../backup/google-drive-oauth-readonly.ts";

/** Separate manual, read-only OAuth preflight. No credential creation. */
export async function executeDriveOAuthProbe(
  env = process.env,
  fetchImpl = globalThis.fetch,
) {
  return checkUlcGoogleDriveOAuthReadOnly({ env, fetchImpl });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await executeDriveOAuthProbe();
    // Never print environment, OAuth requests/responses, access tokens,
    // refresh tokens, Google identity or raw provider error bodies.
    console.log(JSON.stringify(result));
    if (result.status !== "google-drive-folder-readonly-confirmed") {
      process.exitCode = 1;
    }
  } catch {
    console.error("ULC Drive OAuth read-only check failed closed.");
    process.exitCode = 1;
  }
}
