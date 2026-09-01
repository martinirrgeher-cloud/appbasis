import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { requireCurrentUlcLinzCloudflareDeployment } from "./ulc-linz-cloudflare-current-deployment.mjs";
import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";
import { collectUlcLinzM5SecurityLogAccessEvidence } from "./ulc-linz-m5-security-log-access-evidence.mjs";
import { collectUlcLinzM5SecurityLogDeliveryEvidence } from "./ulc-linz-m5-security-log-delivery-evidence.mjs";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const TARGET_WORKER = "appbasis-ulc-linz-production";
const TARGET_DATABASE = "neondb";
const TARGET_NEON_HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const TARGET_VERSION_TAG = "ulc-linz-production-runtime-v1";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const OPAQUE_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_RETENTION_CONSTRAINT_PATTERN =
  /^CHECK \(\(retained_until = \(occurred_at \+ '(?:1 year|12 mons)'::interval\)\)\)$/u;
const CANONICAL_PURGE_BODY = [
  "DECLARE deleted_rows bigint;",
  "BEGIN",
  "DELETE FROM public.ulc_linz_security_event_log",
  "WHERE retained_until < statement_timestamp();",
  "GET DIAGNOSTICS deleted_rows = ROW_COUNT;",
  "RETURN deleted_rows;",
  "END",
].join(" ");

export async function completeUlcLinzM5ProductionFBundle(
  bundle,
  {
    cloudflareAccountId,
    cloudflareApiToken,
    productionDatabaseUrl,
    backupDatabaseUrl,
    cleanupDatabaseUrl,
    readDatabaseUrl,
    githubSha,
  },
  {
    fetchImpl = fetch,
    now = new Date(),
    accessCollector = collectUlcLinzM5SecurityLogAccessEvidence,
    deliveryCollector = collectUlcLinzM5SecurityLogDeliveryEvidence,
    earlyDeletePathCollector = collectUlcLinzM5EarlyDeletePathEvidence,
  } = {},
) {
  const nowDate = requiredDate(now);
  const root = requiredBundle(bundle);
  const accountId = opaque(cloudflareAccountId, "Cloudflare account ID");
  const apiToken = credential(cloudflareApiToken, "Cloudflare API token");
  if (typeof githubSha !== "string" || !SHA_PATTERN.test(githubSha)) {
    throw new Error("Current GitHub SHA is invalid.");
  }
  if (root.ownerInputs.auditSecurityLoggingEvidenceInput !== undefined) {
    throw new Error("M5-F audit evidence is already present.");
  }
  const resourceBindingEvidence = root.ownerInputs.providerBoundEvidenceInput?.resourceBindingEvidence;
  if (
    resourceBindingEvidence?.application !== "ulc-linz" ||
    resourceBindingEvidence?.environment !== "production" ||
    resourceBindingEvidence?.cloudflare?.accountBindingId !== accountId ||
    resourceBindingEvidence?.cloudflare?.runtimeBindingId !== TARGET_WORKER
  ) {
    throw new Error("M5-F resource binding evidence is invalid.");
  }

  const safeProductionDatabaseUrl = credential(productionDatabaseUrl, "ULC production database URL");
  const safeBackupDatabaseUrl = credential(backupDatabaseUrl, "ULC production backup database URL");
  const safeReadDatabaseUrl = credential(readDatabaseUrl, "ULC security read database URL");
  const sink = await observeSecurityLogHyperdrive({ accountId, apiToken, githubSha, fetchImpl });
  const access = await accessCollector({
    productionDatabaseUrl: safeProductionDatabaseUrl,
    backupDatabaseUrl: safeBackupDatabaseUrl,
    cleanupDatabaseUrl: credential(cleanupDatabaseUrl, "ULC security cleanup database URL"),
    readDatabaseUrl: safeReadDatabaseUrl,
    ingestUsername: sink.ingestUsername,
  });
  if (
    access?.leastPrivilegeAccessVerified !== true ||
    access?.protectedOperationalAccessVerified !== true ||
    access?.providerMinimumRetentionVerified !== true
  ) {
    throw new Error("M5-F security-log access evidence is incomplete.");
  }

  const earlyDeletePaths = await earlyDeletePathCollector({ productionDatabaseUrl: safeProductionDatabaseUrl });
  if (earlyDeletePaths?.noEarlyDeletePathVerified !== true) {
    throw new Error("M5-F early-delete path inventory is incomplete.");
  }

  const sinkActivity = await deliveryCollector(
    { productionDatabaseUrl: safeReadDatabaseUrl, deployedAt: sink.deployedAt },
    { now: nowDate },
  );
  if (sinkActivity?.postDeploymentSinkActivityObserved !== true) {
    throw new Error("M5-F post-deployment production sink activity evidence is unavailable.");
  }

  const loggingEvidence = {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: resourceBindingEvidence.observedAt,
    validUntilOrReviewAt: resourceBindingEvidence.validUntilOrReviewAt,
    inventorySource: "provider-api",
    runtimeBindingId: TARGET_WORKER,
    sinkBindingId: sink.hyperdriveId,
    sinkIdentitySource: "provider-api",
    structuredEventCaptureEnabled: true,
    protectedOperationalAccess: true,
    retentionMode: "controlled-calendar-contract",
    retentionEvidence: controlledRetentionContractEvidence(access, earlyDeletePaths),
    sinkInventoryComplete: true,
    publicReadEndpointPresent: false,
  };

  return deepFreeze({
    ...root,
    ownerInputs: {
      ...root.ownerInputs,
      auditSecurityLoggingEvidenceInput: { resourceBindingEvidence, loggingEvidence },
    },
  });
}

async function observeSecurityLogHyperdrive({ accountId, apiToken, githubSha, fetchImpl }) {
  const accountPath = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}`;
  const deployments = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/deployments`, apiToken, fetchImpl,
  );
  const current = requireCurrentUlcLinzCloudflareDeployment(
    deployments?.result?.deployments,
    { label: "M5-F deployed Worker inventory" },
  );
  const deployedAt = canonicalTimestamp(current.deployment.created_on, "Worker deployment created_on");
  const versionId = versionIdValue(current.version.version_id);
  const versionResponse = await cloudflareJson(
    `${accountPath}/workers/scripts/${TARGET_WORKER}/versions/${versionId}`, apiToken, fetchImpl,
  );
  const version = versionResponse.result;
  const message = version?.annotations?.["workers/message"];
  if (
    version?.id !== versionId ||
    version?.annotations?.["workers/tag"] !== TARGET_VERSION_TAG ||
    typeof message !== "string" ||
    !message.startsWith(`AppBasis ulc-linz production runtime ${githubSha} auth-hmac:`) ||
    !Array.isArray(version?.resources?.bindings)
  ) {
    throw new Error("M5-F deployed Worker is not bound to current main.");
  }
  const securityBindings = version.resources.bindings.filter(
    (binding) => binding?.name === "SECURITY_LOG_HYPERDRIVE" && binding?.type === "hyperdrive",
  );
  if (securityBindings.length !== 1) throw new Error("M5-F security-log Hyperdrive binding is not exact.");
  const hyperdriveId = opaque(securityBindings[0].id, "security-log Hyperdrive ID");
  const configResponse = await cloudflareJson(
    `${accountPath}/hyperdrive/configs/${encodeURIComponent(hyperdriveId)}`, apiToken, fetchImpl,
  );
  const config = configResponse.result;
  const origin = config?.origin;
  if (
    config?.id !== hyperdriveId ||
    origin === null || typeof origin !== "object" || Array.isArray(origin) ||
    (origin.scheme !== "postgres" && origin.scheme !== "postgresql") ||
    String(origin.host ?? "").toLowerCase() !== TARGET_NEON_HOST ||
    Number(origin.port ?? 5432) !== 5432 ||
    origin.database !== TARGET_DATABASE ||
    typeof origin.user !== "string" ||
    config?.caching?.disabled !== true
  ) {
    throw new Error("M5-F security-log Hyperdrive origin is invalid.");
  }
  return Object.freeze({
    hyperdriveId,
    ingestUsername: databaseRole(origin.user),
    deployedAt: deployedAt.toISOString(),
  });
}

export async function collectUlcLinzM5EarlyDeletePathEvidence(
  { productionDatabaseUrl },
  { databaseFactory = createPostgresDatabase } = {},
) {
  const safeUrl = credential(productionDatabaseUrl, "ULC production database URL");
  if (typeof databaseFactory !== "function") throw new Error("M5-F early-delete database factory is invalid.");
  const database = databaseFactory(safeUrl);
  try {
    const [functionRows, topologyRows, constraintRows, purgeRows, ownerMembershipRows] = await Promise.all([
      database.client.unsafe(`SELECT count(*)::integer AS unexpected_delete_function_count
        FROM pg_catalog.pg_proc procedure
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
        WHERE procedure.prokind IN ('f', 'p')
          AND namespace.nspname <> 'information_schema'
          AND namespace.nspname !~ '^pg_'
          AND NOT (
            namespace.nspname = 'public'
            AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
            AND procedure.pronargs = 0
          )
          AND (
            (
              procedure.prosecdef = true
              AND (
                has_table_privilege(
                  pg_catalog.pg_get_userbyid(procedure.proowner),
                  'public.ulc_linz_security_event_log',
                  'DELETE'
                )
                OR has_table_privilege(
                  pg_catalog.pg_get_userbyid(procedure.proowner),
                  'public.ulc_linz_security_event_log',
                  'TRUNCATE'
                )
                OR has_function_privilege(
                  pg_catalog.pg_get_userbyid(procedure.proowner),
                  'public.appbasis_ulc_linz_purge_expired_security_events()',
                  'EXECUTE'
                )
              )
            )
            OR pg_catalog.pg_get_functiondef(procedure.oid) ~* 'ulc_linz_security_event_log'
          )`),
      database.client.unsafe(`SELECT (
          SELECT CASE
            WHEN count(*) = 1
             AND bool_and(
               relation.relkind = 'r'
               AND relation.relispartition = false
               AND relation.relrowsecurity = false
               AND relation.relforcerowsecurity = false
             )
            THEN 0 ELSE 1
          END
          FROM pg_catalog.pg_class relation
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'ulc_linz_security_event_log'
        ) + (
          SELECT count(*)::integer
          FROM pg_catalog.pg_rewrite rewrite
          JOIN pg_catalog.pg_class relation ON relation.oid = rewrite.ev_class
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname <> 'information_schema'
            AND namespace.nspname !~ '^pg_'
            AND pg_catalog.pg_get_ruledef(rewrite.oid, true) ~* 'ulc_linz_security_event_log'
        ) + (
          SELECT count(*)::integer
          FROM pg_catalog.pg_constraint constraint_row
          WHERE constraint_row.contype = 'f'
            AND (
              constraint_row.conrelid = 'public.ulc_linz_security_event_log'::regclass
              OR constraint_row.confrelid = 'public.ulc_linz_security_event_log'::regclass
            )
        ) + (
          SELECT count(*)::integer
          FROM pg_catalog.pg_inherits inheritance
          WHERE inheritance.inhrelid = 'public.ulc_linz_security_event_log'::regclass
             OR inheritance.inhparent = 'public.ulc_linz_security_event_log'::regclass
        ) + (
          SELECT count(*)::integer
          FROM pg_catalog.pg_trigger trigger_row
          WHERE trigger_row.tgrelid = 'public.ulc_linz_security_event_log'::regclass
            AND trigger_row.tgisinternal = false
        ) AS unexpected_topology_count`),
      database.client.unsafe(`SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid) AS definition
        FROM pg_catalog.pg_constraint constraint_row
        WHERE constraint_row.conrelid = 'public.ulc_linz_security_event_log'::regclass
          AND constraint_row.contype = 'c'
        ORDER BY constraint_row.conname`),
      database.client.unsafe(`SELECT procedure.prosecdef AS security_definer,
          procedure.pronargs AS argument_count,
          procedure.prokind AS function_kind,
          language.lanname AS language_name,
          pg_catalog.format_type(procedure.prorettype, NULL) AS return_type,
          procedure.proconfig AS config,
          procedure.prosrc AS source_body,
          EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
              COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
            ) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
          ) AS public_execute
        FROM pg_catalog.pg_proc procedure
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
        JOIN pg_catalog.pg_language language ON language.oid = procedure.prolang
        WHERE namespace.nspname = 'public'
          AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'`),
      database.client.unsafe(`SELECT count(*)::integer AS protected_owner_member_count
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_class relation
          ON relation.oid = 'public.ulc_linz_security_event_log'::regclass
        WHERE membership.roleid = relation.relowner`),
    ]);
    if (
      !Array.isArray(functionRows) || functionRows.length !== 1 ||
      !Array.isArray(topologyRows) || topologyRows.length !== 1 ||
      !Array.isArray(constraintRows) ||
      !Array.isArray(purgeRows) || purgeRows.length !== 1 ||
      !Array.isArray(ownerMembershipRows) || ownerMembershipRows.length !== 1
    ) {
      throw new Error("M5-F early-delete path inventory is invalid.");
    }
    const unexpectedDeleteFunctionCount = nonNegativeInteger(
      functionRows[0].unexpected_delete_function_count,
      "M5-F unexpected delete function count",
    );
    const unexpectedTopologyCount = nonNegativeInteger(
      topologyRows[0].unexpected_topology_count,
      "M5-F unexpected protected topology count",
    );
    const protectedOwnerMemberCount = nonNegativeInteger(
      ownerMembershipRows[0].protected_owner_member_count,
      "M5-F protected owner member count",
    );
    const exactRetentionConstraintCount = constraintRows.filter((row) =>
      CANONICAL_RETENTION_CONSTRAINT_PATTERN.test(normalizedCatalogSql(row.definition, "retention constraint"))
    ).length;
    const purge = purgeRows[0];
    const config = Array.isArray(purge.config) ? purge.config.map((entry) => String(entry).replaceAll(" ", "")) : [];
    const canonicalPurgeVerified =
      purge.security_definer === true &&
      Number(purge.argument_count) === 0 &&
      purge.function_kind === "f" &&
      purge.language_name === "plpgsql" &&
      purge.return_type === "bigint" &&
      config.length === 1 && config[0] === "search_path=pg_catalog" &&
      normalizedCatalogSql(purge.source_body, "purge function body") === CANONICAL_PURGE_BODY &&
      purge.public_execute === false;
    if (
      unexpectedDeleteFunctionCount !== 0 ||
      unexpectedTopologyCount !== 0 ||
      exactRetentionConstraintCount !== 1 ||
      canonicalPurgeVerified !== true ||
      protectedOwnerMemberCount !== 0
    ) {
      throw new Error("M5-F canonical retention contract drift exists.");
    }
    return Object.freeze({ noEarlyDeletePathVerified: true });
  } finally {
    await database.client.end();
  }
}

function controlledRetentionContractEvidence(access, earlyDeletePaths) {
  if (
    access?.leastPrivilegeAccessVerified !== true ||
    access?.protectedOperationalAccessVerified !== true ||
    access?.providerMinimumRetentionVerified !== true ||
    earlyDeletePaths?.noEarlyDeletePathVerified !== true
  ) {
    throw new Error("M5-F controlled retention contract evidence is unavailable.");
  }
  return {
    source: "production-database-and-authoritative-contract",
    providerMinimumRetentionVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    calendarConstraintVerified: true,
    cleanupFunctionVerified: true,
    leastPrivilegeCleanupVerified: true,
    noEarlyDeletePathVerified: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  };
}

function requiredBundle(value) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    value.schemaVersion !== 1 || value.application !== "ulc-linz" ||
    value.environment !== "production" || value.ownerInputs === null ||
    typeof value.ownerInputs !== "object" || Array.isArray(value.ownerInputs)
  ) {
    throw new Error("ULC production M5 evidence bundle is invalid.");
  }
  return value;
}

async function cloudflareJson(url, apiToken, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("M5-F Cloudflare evidence request failed.");
  }
  if (!response?.ok || typeof response.json !== "function") throw new Error("M5-F Cloudflare evidence request failed.");
  const payload = await response.json().catch(() => null);
  if (payload?.success !== true) throw new Error("M5-F Cloudflare evidence request failed.");
  return payload;
}

function databaseRole(value) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(value)) {
    throw new Error("M5-F Hyperdrive database role is invalid.");
  }
  return value;
}
function versionIdValue(value) {
  if (typeof value !== "string" || !VERSION_ID_PATTERN.test(value)) {
    throw new Error("M5-F Worker version ID is invalid.");
  }
  return value;
}
function opaque(value, label) {
  if (typeof value !== "string" || !OPAQUE_PATTERN.test(value) || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
function credential(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}
function canonicalTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`M5-F ${label} is invalid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`M5-F ${label} is invalid.`);
  }
  return parsed;
}
function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("M5-F evidence clock is invalid.");
  return new Date(value.getTime());
}
function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is invalid.`);
  return number;
}
function normalizedCatalogSql(value, label) {
  if (typeof value !== "string") throw new Error(`M5-F ${label} is invalid.`);
  return value.replaceAll(/\s+/gu, " ").trim();
}
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    throw new Error("Usage: node tooling/ulc-linz-m5-production-f-evidence.mjs <bundle.json>");
  }
  const bundle = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const completed = await completeUlcLinzM5ProductionFBundle(bundle, {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    productionDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    backupDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
    cleanupDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
    readDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
    githubSha: process.env.GITHUB_SHA,
  });
  process.stdout.write(`${JSON.stringify(completed, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "M5-F production evidence completion failed.");
    process.exitCode = 1;
  });
}
