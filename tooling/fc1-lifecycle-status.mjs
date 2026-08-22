const ORDERED_STATUSES = Object.freeze([
  "draft",
  "repository-created",
  "preview-prepared",
  "preview-deployed",
  "preview-accepted",
  "production-ready",
  "production-released",
]);

export const FC1_LIFECYCLE_STATUSES = ORDERED_STATUSES;

export function deriveFc1LifecycleStatus(evidence = {}) {
  const normalized = normalizeEvidence(evidence);
  assertMonotonic(normalized);

  let status = "draft";
  if (normalized.repositoryCreated) status = "repository-created";
  if (normalized.previewPrepared) status = "preview-prepared";
  if (normalized.previewDeployed) status = "preview-deployed";
  if (normalized.previewAccepted) status = "preview-accepted";
  if (normalized.productionReady) status = "production-ready";
  if (normalized.productionReleased) status = "production-released";

  return Object.freeze({
    status,
    nextAction: nextActionFor(status),
  });
}

function normalizeEvidence(evidence) {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("FC1 lifecycle evidence must be an object.");
  }
  const allowed = new Set([
    "repositoryCreated",
    "previewPrepared",
    "previewDeployed",
    "previewAccepted",
    "productionReady",
    "productionReleased",
  ]);
  for (const key of Object.keys(evidence)) {
    if (!allowed.has(key)) throw new Error(`Unknown FC1 lifecycle evidence key: ${key}.`);
    if (typeof evidence[key] !== "boolean") {
      throw new Error(`FC1 lifecycle evidence ${key} must be boolean.`);
    }
  }
  return Object.freeze({
    repositoryCreated: evidence.repositoryCreated === true,
    previewPrepared: evidence.previewPrepared === true,
    previewDeployed: evidence.previewDeployed === true,
    previewAccepted: evidence.previewAccepted === true,
    productionReady: evidence.productionReady === true,
    productionReleased: evidence.productionReleased === true,
  });
}

function assertMonotonic(evidence) {
  const chain = [
    ["previewPrepared", "repositoryCreated"],
    ["previewDeployed", "previewPrepared"],
    ["previewAccepted", "previewDeployed"],
    ["productionReady", "previewAccepted"],
    ["productionReleased", "productionReady"],
  ];
  for (const [current, required] of chain) {
    if (evidence[current] && !evidence[required]) {
      throw new Error(`FC1 lifecycle is inconsistent: ${current} requires ${required}.`);
    }
  }
}

function nextActionFor(status) {
  switch (status) {
    case "draft": return "create-repository";
    case "repository-created": return "prepare-preview";
    case "preview-prepared": return "deploy-preview";
    case "preview-deployed": return "accept-preview";
    case "preview-accepted": return "prepare-production";
    case "production-ready": return "release-production";
    case "production-released": return null;
    default: throw new Error(`Unsupported FC1 lifecycle status: ${status}.`);
  }
}
