import { isDeepStrictEqual } from "node:util";

import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";

export const ULC_LINZ_LIFECYCLE_DATABASE_OWNER = Object.freeze({
  id: "ulc-linz-lifecycle",
  root: "apps/ulc-linz",
  schemaVersion: 3,
  migrations: Object.freeze([
    "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
    "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
    "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
  ]),
});

/**
 * ULC's app-owned database contract is emitted by createAppSkeleton() through
 * the canonical generated database manifest. This helper validates that the
 * generated manifest still contains exactly the ULC owner expected by M5/M6;
 * it does not append or maintain a second generator path.
 */
export function createExpectedUlcLinzDatabaseManifest(definition) {
  if (definition?.appId !== "ulc-linz") {
    throw new Error("ULC Linz database contract requires appId ulc-linz.");
  }
  const generated = createGeneratedDatabaseManifest(definition);
  if (generated === null) {
    throw new Error("ULC Linz database contract requires generated platform owners.");
  }
  const owner = generated.owners.find(
    (candidate) => candidate.id === ULC_LINZ_LIFECYCLE_DATABASE_OWNER.id,
  );
  if (!isDeepStrictEqual(owner, ULC_LINZ_LIFECYCLE_DATABASE_OWNER)) {
    throw new Error("Canonical ULC Linz database owner drifted.");
  }
  return generated;
}
