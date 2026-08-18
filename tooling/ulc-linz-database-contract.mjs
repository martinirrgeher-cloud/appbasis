import { createGeneratedDatabaseManifest } from "./generated-database-manifest.mjs";

export const ULC_LINZ_LIFECYCLE_DATABASE_OWNER = Object.freeze({
  id: "ulc-linz-lifecycle",
  root: "apps/ulc-linz",
  schemaVersion: 1,
  migrations: Object.freeze([
    "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
  ]),
});

/**
 * App-specific extension layered on top of the canonical generated manifest.
 * createAppSkeleton() remains unchanged; this is a real ULC vertical-slice
 * owner, not a second generator or a new platform service.
 */
export function createExpectedUlcLinzDatabaseManifest(definition) {
  if (definition?.appId !== "ulc-linz") {
    throw new Error("ULC Linz database contract requires appId ulc-linz.");
  }
  const generated = createGeneratedDatabaseManifest(definition);
  if (generated === null) {
    throw new Error("ULC Linz database contract requires generated platform owners.");
  }
  return Object.freeze({
    manifestVersion: generated.manifestVersion,
    application: generated.application,
    dialect: generated.dialect,
    owners: Object.freeze([
      ...generated.owners,
      Object.freeze({
        id: ULC_LINZ_LIFECYCLE_DATABASE_OWNER.id,
        root: ULC_LINZ_LIFECYCLE_DATABASE_OWNER.root,
        schemaVersion: ULC_LINZ_LIFECYCLE_DATABASE_OWNER.schemaVersion,
        migrations: Object.freeze([
          ...ULC_LINZ_LIFECYCLE_DATABASE_OWNER.migrations,
        ]),
      }),
    ]),
  });
}
