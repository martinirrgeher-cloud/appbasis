import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { deriveUlcLinzM5GResourceBindingFingerprint } from "./ulc-linz-m5-provider-bound-evidence.mjs";
import { verifyUlcLinzM5LifecycleExecutorBinding } from "./ulc-linz-m5-lifecycle-executor-binding.mjs";
import { evaluateProductionReadiness } from "./factory-ui/production-readiness.mjs";
import { deriveUlcLinzM5JProductionEvidence } from "./factory-ui/ulc-linz-production-readiness-evidence.mjs";

const ROOT_FIELDS = Object.freeze(["schemaVersion", "application", "environment", "observedAt", "definition", "ownerInputs"]);
const UNSAFE_KEY = /authorization|cookie|password|secret|token|credential|connection.?string|database.?url|api[_-]?key|private.?key|request.?body|response.?body/i;
const UNSAFE_VALUE = [/^postgres(?:ql)?:\/\//i, /^bearer\s+/i, /^basic\s+/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const MAX_LIFECYCLE_BINDING_LEAD_MS = 45 * 60 * 1000;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export async function evaluateUlcLinzM5ProductionEvidenceBundle(
  repositoryRoot,
  bundle,
  { now = new Date(), expectedHeadSha = defaultEvidenceHeadSha() } = {},
) {
  const root = exactRecord(bundle, ROOT_FIELDS, "ULC production M5 evidence bundle");
  assertSafeTree(root);
  if (
    root.schemaVersion !== 1 ||
    root.application !== "ulc-linz" ||
    root.environment !== "production" ||
    root.definition?.appId !== "ulc-linz"
  ) {
    throw new Error("ULC production M5 evidence bundle target is invalid.");
  }

  const observedAt = canonicalTimestamp(root.observedAt, "observedAt");
  const nowDate = requiredDate(now);
  if (observedAt.getTime() > nowDate.getTime()) {
    throw new Error("ULC production M5 evidence bundle is from the future.");
  }
  const evidenceHeadSha = optionalEvidenceHeadSha(expectedHeadSha);

  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const lifecycleExecutorBinding = await verifyUlcLinzM5LifecycleExecutorBinding(
    resolvedRepositoryRoot,
    { now: () => nowDate.getTime() },
  );
  const ownerInputs = bindProtectedLifecycleExecutors(
    root.ownerInputs,
    lifecycleExecutorBinding,
    evidenceHeadSha,
  );
  const evidence = await deriveUlcLinzM5JProductionEvidence(
    resolvedRepositoryRoot,
    root.definition,
    ownerInputs,
    { now: nowDate },
  );
  const readiness = evaluateProductionReadiness(evidence);
  const providerBoundEvidenceInput = ownerInputs?.providerBoundEvidenceInput;
  const resourceBindingFingerprint =
    providerBoundEvidenceInput === undefined
      ? null
      : deriveUlcLinzM5GResourceBindingFingerprint(
          providerBoundEvidenceInput.resourceBindingEvidence,
          { now: nowDate },
        );

  return deepFreeze({
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    observedAt: root.observedAt,
    lifecycleBindingVerifiedAt: lifecycleExecutorBinding.verifiedAt,
    resourceBindingFingerprint,
    status: readiness.status,
    securityPrivacyReady: readiness.productionReady,
    verifiedCount: readiness.verifiedCount,
    requiredCount: readiness.requiredCount,
    criteria: readiness.criteria.map(({ id, status }) => ({ id, status })),
    productionReleaseAuthorized: false,
  });
}

export function formatUlcLinzM5ReadinessDiagnostic(result) {
  if (
    result === null ||
    typeof result !== "object" ||
    !Number.isSafeInteger(result.verifiedCount) ||
    !Number.isSafeInteger(result.requiredCount) ||
    !Array.isArray(result.criteria)
  ) {
    throw new Error("ULC production M5 readiness result is invalid.");
  }
  const openCriteria = result.criteria
    .filter((criterion) => criterion?.status !== "verified")
    .map((criterion) => criterion?.id)
    .filter((id) => typeof id === "string" && /^[a-zA-Z][a-zA-Z0-9]*$/.test(id));
  return `ULC M5 readiness blocked: ${result.verifiedCount}/${result.requiredCount}; open criteria: ${openCriteria.join(",") || "unknown"}.`;
}

function bindProtectedLifecycleExecutors(ownerInputs, binding, evidenceHeadSha) {
  if (
    ownerInputs === null ||
    typeof ownerInputs !== "object" ||
    Array.isArray(ownerInputs) ||
    binding?.executionBoundary !== "protected-operations" ||
    binding?.deletionExecutorBound !== true ||
    binding?.retentionExecutorBound !== true ||
    typeof binding?.verifiedHeadSha !== "string" ||
    !SHA_PATTERN.test(binding.verifiedHeadSha) ||
    (evidenceHeadSha !== null && binding.verifiedHeadSha !== evidenceHeadSha)
  ) {
    throw new Error("ULC production lifecycle executor binding is invalid.");
  }
  const lifecycleInput = ownerInputs.lifecycleActivationEvidenceInput;
  const activation = lifecycleInput?.activationEvidence;
  if (
    lifecycleInput === null ||
    typeof lifecycleInput !== "object" ||
    Array.isArray(lifecycleInput) ||
    activation === null ||
    typeof activation !== "object" ||
    Array.isArray(activation) ||
    activation.executionBoundary !== "protected-operations"
  ) {
    throw new Error("ULC production lifecycle activation input is invalid.");
  }

  const bindingVerifiedAt = canonicalTimestamp(
    binding.verifiedAt,
    "lifecycleBindingVerifiedAt",
  );
  const activationObservedAt = canonicalTimestamp(
    activation.observedAt,
    "lifecycleActivationObservedAt",
  );
  const activationValidUntil = canonicalTimestamp(
    activation.validUntilOrReviewAt,
    "lifecycleActivationValidUntilOrReviewAt",
  );
  if (
    activationValidUntil.getTime() < activationObservedAt.getTime() ||
    bindingVerifiedAt.getTime() > activationValidUntil.getTime() ||
    activationObservedAt.getTime() - bindingVerifiedAt.getTime() >
      MAX_LIFECYCLE_BINDING_LEAD_MS
  ) {
    throw new Error("ULC production lifecycle live binding evidence is outside the correlated evidence window.");
  }

  return {
    ...ownerInputs,
    lifecycleActivationEvidenceInput: {
      ...lifecycleInput,
      activationEvidence: {
        ...activation,
        deletionExecutorBound: true,
        retentionExecutorBound: true,
      },
    },
  };
}

function defaultEvidenceHeadSha() {
  if (
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
  ) {
    return requiredEvidenceHeadSha(process.env.GITHUB_SHA);
  }
  return null;
}

function optionalEvidenceHeadSha(value) {
  if (value === null || value === undefined) return null;
  return requiredEvidenceHeadSha(value);
}

function requiredEvidenceHeadSha(value) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error("ULC production M5 evidence checkout head is invalid.");
  }
  return value;
}

function exactRecord(value, fields, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error(`${label} is invalid.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !fields.includes(field)) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined,
    )
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertSafeTree(value, seen = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    if (value.includes("\0") || UNSAFE_VALUE.some((pattern) => pattern.test(value))) {
      throw new Error("ULC production M5 evidence bundle contains sensitive data.");
    }
    return;
  }
  if (typeof value !== "object" || seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("ULC production M5 evidence bundle is unsafe.");
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (UNSAFE_KEY.test(key)) {
      throw new Error("ULC production M5 evidence bundle contains sensitive data.");
    }
    if (!Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error("ULC production M5 evidence bundle is unsafe.");
    }
    assertSafeTree(descriptor.value, seen);
  }
  seen.delete(value);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function requiredDate(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("ULC production M5 evidence clock is invalid.");
  }
  return new Date(value.getTime());
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length < 1 || argv.length > 2 || (argv[1] !== undefined && argv[1] !== "--require-ready")) {
    throw new Error("Usage: node tooling/ulc-linz-m5-production-evidence-runner.mjs <bundle.json> [--require-ready]");
  }
  const bundle = JSON.parse(await readFile(resolve(argv[0]), "utf8"));
  const result = await evaluateUlcLinzM5ProductionEvidenceBundle(process.cwd(), bundle, {
    now: new Date(),
    expectedHeadSha: process.env.GITHUB_SHA ?? null,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (argv[1] === "--require-ready" && result.securityPrivacyReady !== true) {
    console.error(formatUlcLinzM5ReadinessDiagnostic(result));
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC production M5 evidence evaluation failed.");
    process.exitCode = 1;
  });
}
