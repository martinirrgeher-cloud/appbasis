// Read-only release-step selection. Provider mutation belongs solely to the
// canonical M6 refresh chain and requires a fresh operator approval there.
export const ULC_PRODUCTION_RELEASE_STEPS = Object.freeze([
  "runtime_refresh",
  "private_deploy",
  "security_smoke",
  "lifecycle_preflight",
  "composition_gate",
  "pilot_ingress",
  "smoke_principal",
  "post_deploy_smoke",
]);

const EXACT_CHILD_WORKFLOW_PATH = Object.freeze({
  runtime_refresh: ".github/workflows/m6-ulc-production-runtime-refresh-config.yml",
  private_deploy: ".github/workflows/m6-ulc-private-production-refresh-deploy.yml",
  security_smoke: ".github/workflows/m5-ulc-private-security-smoke.yml",
  lifecycle_preflight: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
  composition_gate: ".github/workflows/m6-ulc-production-composition-gate.yml",
  pilot_ingress: ".github/workflows/m6-ulc-production-pilot-ingress.yml",
  smoke_principal: ".github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml",
  post_deploy_smoke: ".github/workflows/m6-ulc-production-post-deploy-smoke.yml",
});

const EXACT_PARENT_WORKFLOW_PATH = ".github/workflows/m6-ulc-production-refresh-chain.yml";
const SHA_RE = /^[a-f0-9]{40}$/;
const NAME_RE = /^m6-chain-([1-9][0-9]*)-1-([a-z_]+)$/;

function isActive(run) {
  return run.status === "queued" || run.status === "in_progress" ||
    run.status === "waiting" || run.status === "pending" ||
    run.status === "requested";
}

function timestamp(value, label) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new Error("Invalid " + label);
  return parsed;
}

export function selectNextUlcProductionReleaseStep({ headSha, runs }) {
  if (typeof headSha !== "string" || !SHA_RE.test(headSha)) {
    throw new Error("Invalid exact main head SHA.");
  }
  if (!Array.isArray(runs) || runs.length > 500) {
    throw new Error("Invalid or incomplete production workflow-run inventory.");
  }

  const completions = new Map();
  let parentActive = false;

  for (const run of runs) {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      throw new Error("Malformed workflow run.");
    }
    if (run.head_sha !== headSha || run.head_branch !== "main") continue;
    if (run.event !== "workflow_dispatch") continue;

    if (run.path === EXACT_PARENT_WORKFLOW_PATH && isActive(run)) {
      parentActive = true;
      continue;
    }

    const name = run.name ?? run.display_title;
    const match = typeof name === "string" ? NAME_RE.exec(name) : null;
    if (!match) continue;
    const step = match[2];

    if (!Object.hasOwn(EXACT_CHILD_WORKFLOW_PATH, step) ||
        run.path !== EXACT_CHILD_WORKFLOW_PATH[step]) {
      throw new Error("Unrecognized or inconsistent release-chain child run.");
    }
    if (isActive(run)) throw new Error("An approved release-chain child is still running.");
    if (run.status !== "completed") {
      throw new Error("Release child has an unknown terminal status.");
    }
    if (run.run_attempt !== 1) {
      throw new Error("Release child rerun cannot prove fresh operator approval.");
    }
    if (run.conclusion !== "success") continue;

    const start = timestamp(run.created_at, "child start timestamp");
    const end = timestamp(run.updated_at, "child completion timestamp");
    if (end < start) throw new Error("Invalid release child completion order.");

    const old = completions.get(step);
    if (!old || end > old.end) {
      completions.set(step, { start, end });
    }
  }

  if (parentActive) throw new Error("Another M6 production approval is running.");

  let lastCompletion = null;
  for (const step of ULC_PRODUCTION_RELEASE_STEPS) {
    const completed = completions.get(step);
    if (!completed) {
      // Success of a later stage without this earlier stage is ambiguous:
      // fail closed rather than guessing which production write is safe.
      const later = ULC_PRODUCTION_RELEASE_STEPS.slice(
        ULC_PRODUCTION_RELEASE_STEPS.indexOf(step) + 1,
      );
      if (later.some((candidate) => completions.has(candidate))) {
        throw new Error("Release history is out of sequence; manual inspection required.");
      }
      return Object.freeze({ status: "next", step });
    }
    if (lastCompletion !== null && completed.start < lastCompletion) {
      throw new Error("Release history does not satisfy strict stage ordering.");
    }
    lastCompletion = completed.end;
  }
  return Object.freeze({ status: "complete", step: null });
}
