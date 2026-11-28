// Read-only T10 evidence consolidation. This never approves a production
// deployment, changes a status/contract, or calls a provider.
// Source: current Git working tree, not independently authenticated account
// agreements or live runtime; those require a separate operator decision.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { verifyUlcScopedProductionLifecycle } from "./ulc-linz-scoped-production-lifecycle.mjs";

const MODULES = Object.freeze([
  "countdown", "athletes", "exercise-catalog", "training-blocks",
  "training-plans", "training-documentation",
]);

function validCanonicalUtc(value) {
  if (typeof value !== "string" || value.length !== 24 || !value.endsWith("Z")) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
function validHttpsDocumentReference(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") &&
      url.username === "" && url.password === "" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
function validDateOnly(value) {
  if (typeof value !== "string" || value.length !== 10) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}
// Production provider evidence is not an "open" → "verified" checkbox.
// M5 has always required date, source, app/account binding and next review.
export function hasCurrentUlcProductionEvidence(receipts, now = new Date()) {
  if (!Array.isArray(receipts) || receipts.length === 0 ||
      !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  return receipts.every(receipt => {
    if (!receipt || typeof receipt !== "object") return false;
    if (receipt.appEnvironment !== "ulc-linz-production" ||
        !validHttpsDocumentReference(receipt.reference) ||
        !validHttpsDocumentReference(receipt.accountBindingReference) ||
        !validCanonicalUtc(receipt.observedAt) ||
        !validCanonicalUtc(receipt.validUntilOrReviewAt)) return false;
    const observed = new Date(receipt.observedAt).getTime();
    const validUntil = new Date(receipt.validUntilOrReviewAt).getTime();
    return observed <= now.getTime() && validUntil > now.getTime() &&
      validUntil > observed;
  });
}

function checked(value, message) {
  if (!value) throw new Error(message);
}

export function evaluateUlcT10PilotDecision(input) {
  checked(input && typeof input === "object" && !Array.isArray(input),
    "Invalid T10 evidence input.");
  const { app, modules, retention, provider, scopedPilot } = input;
  checked(app?.appId === "ulc-linz" && app.schemaVersion === 1,
    "T10 app contract is not ULC Linz.");
  checked(Array.isArray(app.modules) &&
    JSON.stringify(app.modules) === JSON.stringify(MODULES),
    "T10 selected six-module app contract changed; review required.");
  checked(modules && typeof modules === "object" && !Array.isArray(modules),
    "T10 module contracts unavailable.");
  checked(retention?.application === "ulc-linz" &&
    retention?.schemaVersion === 1 &&
    retention?.documentType === "t10-current-production-legal-decision" &&
    retention?.currentSchemaTableCount === 69 &&
    retention?.environment === "production" &&
    retention?.scope === "private-members-only-six-module-pilot-no-private-minor-media",
    "T10 current 69-table legal decision source mismatch.");
  checked(provider?.application === "ulc-linz",
    "T10 provider source mismatch.");

  const checks = [];
  const add = (id, passed, detail) => checks.push(Object.freeze({
    id, status: passed ? "verified-in-repository" : "open", detail,
  }));
  for (const moduleId of MODULES) {
    const module = modules[moduleId];
    checked(module?.moduleId === moduleId,
      "T10 module identity mismatch: " + moduleId);
    const req = module.requirements || {};
    const allVerified = Object.values(req).length > 0 &&
      Object.values(req).every(value => value === "verified" || value === "not-applicable");
    // Scoped ULC approval is not the global module "ready" bit. It is
    // admitted only by the SHA-verifying protected-entrypoint sidecar reader.
    const scopedReady = scopedPilot?.appId === "ulc-linz" &&
      scopedPilot?.scope ===
        "private-members-only-six-module-pilot-no-private-minor-media" &&
      scopedPilot?.legalApproved === false &&
      scopedPilot?.deploymentAuthorized === false &&
      scopedPilot?.privateMediaAllowed === false &&
      scopedPilot?.oldRestorePromotionAllowed === false &&
      scopedPilot?.verifiedModuleIds?.includes(moduleId) === true &&
      module.status === "blocked" &&
      req.authorization === "verified" && req.database === "verified" &&
      req.lifecycle === "blocked";
    const verified = (module.status === "ready" && allVerified) || scopedReady;
    add("module:" + moduleId, verified,
      verified
        ? scopedReady ? "app-scoped protected ULC pilot, source pinned"
          : "ready with verified generic module requirements"
        : "module=" + module.status + "; requirements=" +
          Object.entries(req).map(([key,value]) => key + ":" + value).join(","));
  }

  add("app:data-export", app.crossCutting?.dataExport === "verified",
    "app crossCutting.dataExport");
  add("app:lifecycle", app.crossCutting?.applicationLifecycle === "verified",
    "app crossCutting.applicationLifecycle");
  add("app:privacy", app.crossCutting?.privacy === "verified",
    "app crossCutting.privacy");
  add("app:composition", app.status === "ready",
    "app production composition contract status");
  const legal = retention.decision;
  const validDecision = legal && typeof legal === "object" &&
    typeof legal.privateRecordReference === "string" &&
    legal.privateRecordReference.length > 12 &&
    typeof legal.responsibleRole === "string" &&
    legal.responsibleRole.length > 4 &&
    validDateOnly(legal.decidedOn) &&
    Array.isArray(legal.coveredPurposes) && legal.coveredPurposes.length >= 4 &&
    legal.includesMinorsAndParents === true &&
    legal.approvedPilotScope === retention.scope;
  add("retention:legal", retention.legalApproval === true && !!validDecision,
    "current 69-table operator legal decision with private scope/date/role evidence required");

  // runtimeActive must be FALSE before deployment. Do not use its absence
  // as a circular pre-launch blocker or falsely label it as operating.
  add("retention:predeployment-safe", retention.runtimeActive === false,
    "runtime policy must not pre-activate before approved release");

  const requiredProviderIds = ["cloudflare", "neon-postgresql"];
  const ids = provider.providerScope?.map(v => v.id);
  checked(Array.isArray(ids) && JSON.stringify(ids) === JSON.stringify(requiredProviderIds),
    "T10 provider list changed; explicit audit required.");
  for (const item of provider.providerScope) {
    add("provider:" + item.id,
      item.appSpecificProductionEvidence === "verified" &&
      hasCurrentUlcProductionEvidence(item.evidence),
      "fresh account-bound app production evidence required; not a legal confirmation");
  }
  checked(Array.isArray(provider.dataFlows) && provider.dataFlows.length > 0,
    "T10 provider data-flow inventory missing.");
  add("provider:data-flows",
    provider.dataFlows.every(flow => flow.evidenceStatus === "verified" &&
      hasCurrentUlcProductionEvidence(flow.evidence)),
    "all declared app-specific data flows need fresh account-bound evidence");
  for (const key of ["dataRegion","dpa","encryption","subprocessors"]) {
    add("provider:" + key, provider.m5?.[key] === "verified" &&
      hasCurrentUlcProductionEvidence(provider.productionEvidence?.[key]),
      "app-specific fresh account-bound " + key + " proof required");
  }

  const open = Object.freeze(checks.filter(x => x.status === "open").map(x => x.id));
  return Object.freeze({
    schemaVersion: 1,
    application: "ulc-linz",
    source: "git-working-tree-only",
    checkedModules: Object.freeze([...MODULES]),
    evidenceStatus: open.length === 0 ? "repository-prerequisites-verified" : "blocked",
    readyForOperatorReview: open.length === 0,
    openChecks: open,
    checks: Object.freeze(checks),
    // Never synthesize approvals from JSON/CI/test flags.
    operatorApprovalRequired: true,
    operatorApproved: false,
    deploymentAuthorized: false,
    personalDataActivationAuthorized: false,
    historicalRestorePromotionAuthorized: false,
    irreversibleActionsPerformed: false,
    finalStatus: "NO-GO-until-separate-documented-T10-approval",
  });
}

export async function readCurrentUlcT10PilotDecision(root = new URL("../", import.meta.url)) {
  const json = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
  const app = await json("apps/ulc-linz/appbasis.production.json");
  const modules = Object.fromEntries(await Promise.all(
    MODULES.map(async id => [id, await json("modules/" + id + "/appbasis.production.json")]),
  ));
  const retention = await json("apps/ulc-linz/privacy/t10-current-production-legal-decision.json");
  const provider = await json("apps/ulc-linz/privacy/m5-provider-compliance-inventory.json");
  const scopedPilot = await verifyUlcScopedProductionLifecycle(fileURLToPath(root));
  return evaluateUlcT10PilotDecision({app, modules, retention, provider, scopedPilot});
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--require-repository-ready")) {
    console.error("Usage: node tooling/ulc-linz-t10-pilot-decision.mjs [--require-repository-ready]");
    process.exitCode = 2;
  } else {
    try {
      const result = await readCurrentUlcT10PilotDecision();
      console.log(JSON.stringify(result, null, 2));
      if (args.includes("--require-repository-ready") && !result.readyForOperatorReview) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(String(error instanceof Error ? error.message : error));
      process.exitCode = 2;
    }
  }
}
