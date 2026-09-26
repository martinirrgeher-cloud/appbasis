import { resolve } from "node:path";

import {
  deriveUlcLinzProductionRuntimeContractDigest,
  isUlcLinzProductionRuntimeContractPath,
} from "./ulc-linz-m6-production-resource-binding.mjs";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_REPOSITORY = "martinirrgeher-cloud/appbasis";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_COMPARE_COMMITS = 50;
const MAX_COMPARE_FILES = 300;
const GITHUB_TIMEOUT_MS = 10000;
const GITHUB_ATTEMPTS = 3;
const GITHUB_RETRY_DELAY_MS = 250;

export async function verifyUlcLinzProductionRuntimeEquivalence(
  repositoryRoot,
  {
    deployedGithubSha,
    currentGithubSha,
    fetchImpl = fetch,
    token = process.env.GITHUB_TOKEN ?? "",
    sleep = defaultSleep,
  } = {},
) {
  const root = resolve(repositoryRoot);
  requireSha(deployedGithubSha, "deployed runtime SHA");
  requireSha(currentGithubSha, "current runtime SHA");
  if (typeof fetchImpl !== "function" || typeof sleep !== "function") {
    throw new Error("ULC production runtime equivalence verifier is invalid.");
  }

  const runtimeContractDigest =
    deriveUlcLinzProductionRuntimeContractDigest(root);

  if (deployedGithubSha === currentGithubSha) {
    return Object.freeze({
      equivalent: true,
      mode: "exact-head",
      runtimeContractDigest,
      deployedGithubSha,
      currentGithubSha,
    });
  }

  const comparison = await fetchComparisonWithRetry(
    deployedGithubSha,
    currentGithubSha,
    fetchImpl,
    token,
    sleep,
  );
  validateComparison(
    comparison,
    deployedGithubSha,
    currentGithubSha,
  );

  return Object.freeze({
    equivalent: true,
    mode: "runtime-contract-unchanged",
    runtimeContractDigest,
    deployedGithubSha,
    currentGithubSha,
  });
}

function validateComparison(comparison, deployedGithubSha, currentGithubSha) {
  if (!isPlainRecord(comparison)) {
    throw new Error("ULC production runtime equivalence evidence is unavailable.");
  }
  if (
    comparison.status !== "ahead" ||
    comparison?.base_commit?.sha !== deployedGithubSha ||
    comparison?.merge_base_commit?.sha !== deployedGithubSha ||
    comparison?.head_commit?.sha !== currentGithubSha ||
    !Number.isSafeInteger(comparison.ahead_by) ||
    comparison.ahead_by < 1 ||
    comparison.ahead_by > MAX_COMPARE_COMMITS ||
    comparison.behind_by !== 0 ||
    comparison.total_commits !== comparison.ahead_by ||
    !Array.isArray(comparison.commits) ||
    comparison.commits.length !== comparison.ahead_by ||
    !Array.isArray(comparison.files) ||
    comparison.files.length < 1 ||
    comparison.files.length >= MAX_COMPARE_FILES
  ) {
    throw new Error(
      "ULC production runtime deployment cannot be proven equivalent to current main.",
    );
  }

  for (const commit of comparison.commits) {
    if (
      !isPlainRecord(commit) ||
      typeof commit.sha !== "string" ||
      !SHA_PATTERN.test(commit.sha)
    ) {
      throw new Error(
        "ULC production runtime equivalence commit evidence is invalid.",
      );
    }
  }

  for (const file of comparison.files) {
    if (
      !isPlainRecord(file) ||
      typeof file.filename !== "string" ||
      file.filename.length < 1
    ) {
      throw new Error(
        "ULC production runtime equivalence file evidence is invalid.",
      );
    }
    if (
      isUlcLinzProductionRuntimeContractPath(file.filename) ||
      (file.previous_filename !== undefined &&
        (typeof file.previous_filename !== "string" ||
          isUlcLinzProductionRuntimeContractPath(file.previous_filename)))
    ) {
      throw new Error(
        "ULC production runtime contract changed since the deployed Worker version.",
      );
    }
  }
}

async function fetchComparisonWithRetry(
  deployedGithubSha,
  currentGithubSha,
  fetchImpl,
  token,
  sleep,
) {
  const url = new URL(
    `${GITHUB_API_BASE_URL}/repos/${GITHUB_REPOSITORY}/compare/${deployedGithubSha}...${currentGithubSha}`,
  );
  for (let attempt = 1; attempt <= GITHUB_ATTEMPTS; attempt += 1) {
    const result = await fetchComparison(url, fetchImpl, token);
    if (result !== null) return result;
    if (attempt < GITHUB_ATTEMPTS) {
      await sleep(GITHUB_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error("ULC production runtime equivalence evidence is unavailable.");
}

async function fetchComparison(url, fetchImpl, token) {
  const safeToken = typeof token === "string" ? token.trim() : "";
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(safeToken.length > 0 ? { authorization: `Bearer ${safeToken}` } : {}),
  };
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response?.ok) return null;
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function requireSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error(`ULC production ${label} is invalid.`);
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultSleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
