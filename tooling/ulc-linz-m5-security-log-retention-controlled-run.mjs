import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

export const ULC_LINZ_M5_RETENTION_FAILURE_PHASES = Object.freeze([
  "database-binding",
  "database-client-import",
  "database-client-create",
  "cleanup-principal",
  "purge-execution",
  "post-verification",
  "database-client-close",
]);

const CLEANUP_CREATOR_BACK_REFERENCE_SQL = `
WITH protected_object_owner AS (
  SELECT
    CASE
      WHEN count(*) = 3 AND count(DISTINCT owner_oid) = 1 THEN min(owner_oid)
      ELSE NULL
    END AS owner_oid,
    count(*)::integer AS protected_object_count,
    count(DISTINCT owner_oid)::integer AS distinct_owner_count
  FROM (
    SELECT relation.relowner AS owner_oid
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('ulc_linz_security_event_log', 'ulc_linz_security_event_log_id_seq')
    UNION ALL
    SELECT procedure.proowner
    FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
      AND procedure.pronargs = 0
  ) protected_owner
), reverse_memberships AS (
  SELECT
    membership.member,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option,
    grantor.rolsuper AS grantor_superuser
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
  JOIN pg_catalog.pg_roles cleanup_role ON cleanup_role.oid = membership.roleid
  WHERE cleanup_role.rolname = current_user
)
SELECT
  count(membership.member)::integer AS reverse_membership_count,
  count(membership.member) FILTER (
    WHERE protected_object_owner.owner_oid IS NOT NULL
      AND membership.member = protected_object_owner.owner_oid
      AND membership.grantor_superuser = true
      AND membership.admin_option = true
      AND membership.inherit_option = false
      AND membership.set_option = false
  )::integer AS safe_creator_back_reference_count,
  count(membership.member) FILTER (
    WHERE NOT (
      protected_object_owner.owner_oid IS NOT NULL
      AND membership.member = protected_object_owner.owner_oid
      AND membership.grantor_superuser = true
      AND membership.admin_option = true
      AND membership.inherit_option = false
      AND membership.set_option = false
    )
  )::integer AS unsafe_reverse_membership_count,
  protected_object_owner.protected_object_count,
  protected_object_owner.distinct_owner_count
FROM protected_object_owner
LEFT JOIN reverse_memberships membership ON true
GROUP BY protected_object_owner.protected_object_count, protected_object_owner.distinct_owner_count
`;

export async function runControlledUlcLinzM5SecurityLogRetention({
  databaseUrl,
  backupDatabaseUrl,
  createPostgresDatabase,
  purgeExpiredSecurityEvents,
  onPhase = () => {},
}) {
  onPhase("database-binding");
  const cleanup = parseUlcLinzProductionDatabaseUrl(databaseUrl);
  const backup = parseUlcLinzProductionDatabaseUrl(backupDatabaseUrl);
  if (cleanup.host !== backup.host || cleanup.database !== backup.database || cleanup.user === backup.user) {
    throw new Error("ULC M5-F retention backup credential is not bound to the cleanup database.");
  }

  onPhase("database-client-create");
  const connection = createPostgresDatabase(databaseUrl);
  let completed = false;
  try {
    onPhase("cleanup-principal");
    const compatibleClient = createCleanupCreatorBackReferenceCompatibleClient(connection.client);
    const result = await runUlcLinzM5SecurityLogRetention(
      compatibleClient,
      async (client) => {
        onPhase("purge-execution");
        const purge = await purgeExpiredSecurityEvents(client);
        onPhase("post-verification");
        return purge;
      },
      backup.user,
    );
    completed = true;
    return result;
  } finally {
    if (connection?.client !== undefined) {
      if (completed) onPhase("database-client-close");
      await connection.client.end();
    }
  }
}

function createCleanupCreatorBackReferenceCompatibleClient(client) {
  const clientType = typeof client;
  if (
    client === null ||
    (clientType !== "object" && clientType !== "function") ||
    typeof client.unsafe !== "function"
  ) {
    throw new Error("ULC M5-F retention SQL client is invalid.");
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "unsafe") return Reflect.get(target, property, receiver);
      return async (query, params) => {
        const rows = await target.unsafe(query, params);
        if (typeof query !== "string" || !query.includes("WITH protected_acl AS")) return rows;

        const snapshot = await collectCleanupCreatorBackReferenceSnapshot(target);
        verifyCleanupCreatorBackReferenceSnapshot(snapshot);
        if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0]?.reverse_membership_count) !== snapshot.reverseMembershipCount) {
          throw new Error("ULC M5-F cleanup creator back-reference changed during access verification.");
        }
        return [{ ...rows[0], reverse_membership_count: 0 }];
      };
    },
  });
}

async function collectCleanupCreatorBackReferenceSnapshot(client) {
  const rows = await client.unsafe(CLEANUP_CREATOR_BACK_REFERENCE_SQL);
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object") {
    throw new Error("ULC M5-F cleanup creator back-reference evidence is invalid.");
  }
  return Object.freeze({
    reverseMembershipCount: Number(rows[0].reverse_membership_count),
    safeCreatorBackReferenceCount: Number(rows[0].safe_creator_back_reference_count),
    unsafeReverseMembershipCount: Number(rows[0].unsafe_reverse_membership_count),
    protectedObjectCount: Number(rows[0].protected_object_count),
    distinctOwnerCount: Number(rows[0].distinct_owner_count),
  });
}

function verifyCleanupCreatorBackReferenceSnapshot(snapshot) {
  if (
    !Number.isInteger(snapshot.reverseMembershipCount) || snapshot.reverseMembershipCount < 0 ||
    !Number.isInteger(snapshot.safeCreatorBackReferenceCount) || snapshot.safeCreatorBackReferenceCount < 0 ||
    snapshot.safeCreatorBackReferenceCount > 1 ||
    !Number.isInteger(snapshot.unsafeReverseMembershipCount) || snapshot.unsafeReverseMembershipCount !== 0 ||
    snapshot.protectedObjectCount !== 3 ||
    snapshot.distinctOwnerCount !== 1 ||
    snapshot.reverseMembershipCount !== snapshot.safeCreatorBackReferenceCount
  ) {
    throw new Error("ULC M5-F cleanup creator back-reference is not least privilege.");
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  let failurePhase = "database-binding";
  try {
    failurePhase = "database-client-import";
    const [{ createPostgresDatabase }, { purgeExpiredUlcLinzSecurityEvents }] = await Promise.all([
      import("../packages/database/src/client.ts"),
      import("../apps/ulc-linz/worker/security-events-postgres.ts"),
    ]);
    const result = await runControlledUlcLinzM5SecurityLogRetention({
      databaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
      backupDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
      createPostgresDatabase,
      purgeExpiredSecurityEvents: purgeExpiredUlcLinzSecurityEvents,
      onPhase: (phase) => {
        if (ULC_LINZ_M5_RETENTION_FAILURE_PHASES.includes(phase)) failurePhase = phase;
      },
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error(`ULC Linz M5-F production retention cleanup failed at phase ${failurePhase}.`);
    process.exitCode = 1;
  }
}
