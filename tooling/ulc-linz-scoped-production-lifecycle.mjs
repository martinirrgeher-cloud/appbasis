/**
 * T10: app-scoped verification. Global standard-module contracts deliberately
 * remain BLOCKED, because other apps may use unprotected module repositories.
 * Only the existing private ULC M6 production entrypoint has been audited.
 *
 * This is a read-only evidence gate, NEVER legal/production/deploy approval.
 */
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const SCOPE = "private-members-only-six-module-pilot-no-private-minor-media";
const MODULES = Object.freeze([
  "exercise-catalog", "training-blocks", "training-documentation",
]);
const REQUIRED = Object.freeze({
  "exercise-catalog": Object.freeze([
    "src/postgres-repository.ts",
    "migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql",
    "migrations/0005_appbasis_exercise_catalog_subject_deletion_write_fence.sql",
    "test/service.test.ts",
    "production-pilot-lifecycle-evidence-20261128.md",
  ]),
  "training-blocks": Object.freeze([
    "src/lifecycle.ts",
    "src/postgres-repository.ts",
    "migrations/0004_appbasis_training_block_favorite_deletion.sql",
    "migrations/0005_appbasis_training_block_usage_subject.sql",
    "migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql",
    "test/postgres-repository.postgres.e2e.ts",
    "production-pilot-lifecycle-evidence-20261128.md",
  ]),
  "training-documentation": Object.freeze([
    "src/postgres-repository.ts",
    "migrations/0001_appbasis_training_documentation_subject_deletion.sql",
    "test/postgres-repository.postgres.e2e.ts",
    "test/subject-restore-reconciliation.test.ts",
    "production-pilot-lifecycle-evidence-20261128.md",
  ]),
});
const ENTRY = "apps/ulc-linz/worker/production-protected.ts";
const ENTRY_TEST = "apps/ulc-linz/test/production-protected.test.ts";
const RUNTIME_WIRING = Object.freeze([
  "apps/ulc-linz/worker/postgres.ts",
  "apps/ulc-linz/worker/exercise-catalog-runtime.ts",
  "apps/ulc-linz/worker/exercise-catalog-protected-runtime-readiness.ts",
  "apps/ulc-linz/worker/training-block-verified-runtime-readiness.ts",
  "apps/ulc-linz/worker/training-documentation-production-readiness.ts",
  "apps/ulc-linz/worker/training-documentation-write-actor.ts",
  "apps/ulc-linz/worker/training-plan-verified-usage-booking.ts",
  "apps/ulc-linz/test/exercise-catalog-protected-runtime-readiness.test.ts",
  "apps/ulc-linz/test/training-block-verified-runtime-readiness.test.ts",
  "apps/ulc-linz/test/training-documentation-postgres-write-guard.test.ts",
]);
const stop = (msg) => { throw new Error("ULC scoped T10 lifecycle denied: " + msg); };
const exact = (actual, desired) =>
  actual && typeof actual === "object" && !Array.isArray(actual) &&
  JSON.stringify(Object.keys(actual).sort()) === JSON.stringify([...desired].sort());
const blobRef = ref => exact(ref,["path","gitBlobSha"]) &&
  typeof ref.path === "string" &&
  /^[a-zA-Z0-9._/-]{3,250}$/.test(ref.path) &&
  ref.path.split("/").every(x=>x!==""&&x!=="."&&x!=="..") &&
  typeof ref.gitBlobSha === "string" && /^[0-9a-f]{40}$/.test(ref.gitBlobSha);

async function exactBlob(root, ref) {
  if (!blobRef(ref)) stop("invalid evidence reference");
  let current = root;
  let stats;
  for (const part of ref.path.split("/")) {
    current = join(current,part);
    try { stats=await lstat(current); }
    catch { stop("evidence missing"); }
    if (stats.isSymbolicLink()) stop("symlink in evidence path");
  }
  if (!stats?.isFile()) stop("non-file evidence");
  const data=await readFile(current);
  const sha=createHash("sha1").update(`blob ${data.length}\0`,"utf8")
    .update(data).digest("hex");
  if (sha!==ref.gitBlobSha) stop("pinned source changed: "+ref.path);
  return data.toString("utf8");
}

/**
 * Validate only private ULC pilot evidence, without upgrading generic modules.
 * A later standard-module release requires its own unrestricted lifecycle proof.
 */
export async function verifyUlcScopedProductionLifecycle(
  repositoryRoot, supplied,
) {
  const root = resolve(repositoryRoot);
  const value = supplied ?? JSON.parse(await readFile(join(root,
    "apps/ulc-linz/production-scoped-module-lifecycle.json"),"utf8"));
  if (!exact(value,[
      "schemaVersion","appId","scope","scopeLimitations",
      "productionEntrypoint","productionEntrypointTest",
      "runtimeGuardEvidence","moduleLifecycle"
    ]) || value.schemaVersion!==1 || value.appId!=="ulc-linz" ||
      value.scope!==SCOPE) stop("app or scope mismatch");
  if (!exact(value.scopeLimitations,[
       "privateMedia","unverifiedHistoricalRestore","ambiguousFreeText","actorAndAudit"
      ]) ||
      value.scopeLimitations.privateMedia!=="disabled" ||
      value.scopeLimitations.unverifiedHistoricalRestore!=="promotion-denied" ||
      value.scopeLimitations.ambiguousFreeText!=="manual-stop" ||
      value.scopeLimitations.actorAndAudit!=="manual-stop") stop("missing pilot stop conditions");

  if (value.productionEntrypoint?.path!==ENTRY ||
      value.productionEntrypointTest?.path!==ENTRY_TEST) {
    stop("wrong protected production entrypoint");
  }
  const source = await exactBlob(root,value.productionEntrypoint);
  await exactBlob(root,value.productionEntrypointTest);
  if (!Array.isArray(value.runtimeGuardEvidence) ||
      JSON.stringify(value.runtimeGuardEvidence.map(x=>x.path)) !==
        JSON.stringify(RUNTIME_WIRING)) stop("protected runtime wiring reference set is incomplete");
  const runtimeSources = new Map();
  for(const ref of value.runtimeGuardEvidence) {
    runtimeSources.set(ref.path, await exactBlob(root,ref));
  }
  const actualRuntime = runtimeSources.get("apps/ulc-linz/worker/postgres.ts");
  if (!actualRuntime?.includes("assertUlcLiveTrainingDocumentationActor") ||
      !actualRuntime.includes("writeGuard: assertUlcLiveTrainingDocumentationActor") ||
      !actualRuntime.includes("assertUlcProtectedCatalogProductionReadiness") ||
      !actualRuntime.includes("assertUlcVerifiedBlockUsageProductionReadiness") ||
      !actualRuntime.includes("assertUlcTrainingDocumentationProductionReadiness")) {
    stop("protected PostgreSQL runtime guard wiring is missing");
  }
  for (const guarded of [
    'exerciseCatalogMediaStore: null',
    '"standard-module-protected-production"',
    '"protected-production-verified-subject"',
    '"protected-production"',
    '"require-live-training-actor-transaction"',
  ]) {
    if (!source.includes(guarded)) stop("protected runtime mode missing");
  }

  if (!Array.isArray(value.moduleLifecycle) ||
      value.moduleLifecycle.length!==MODULES.length ||
      JSON.stringify(value.moduleLifecycle.map(x=>x.moduleId)) !==
        JSON.stringify(MODULES)) stop("three exact scoped modules required");

  for (const entry of value.moduleLifecycle) {
    if (!exact(entry,["moduleId","evidence"]) || !Array.isArray(entry.evidence)) {
      stop("module evidence shape invalid");
    }
    const required=REQUIRED[entry.moduleId].map(x=>`modules/${entry.moduleId}/${x}`);
    const actual=entry.evidence.map(x=>x.path);
    if (JSON.stringify(actual.sort())!==JSON.stringify(required.sort())) {
      stop("module evidence must pin ALL required lifecycle implementation and tests");
    }
    for(const ref of entry.evidence) await exactBlob(root,ref);
  }

  return Object.freeze({
    appId:"ulc-linz",scope:SCOPE,
    verifiedModuleIds:Object.freeze([...MODULES]),
    productionEntrypoint:ENTRY,
    // This never authorizes a production release or data processing.
    legalApproved:false, deploymentAuthorized:false,
    oldRestorePromotionAllowed:false, privateMediaAllowed:false,
  });
}
