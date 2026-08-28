import { appendFile } from "node:fs/promises";

const NEON_API_ORIGIN = "https://console.neon.tech/api/v2";
const PROVIDER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;
const PROJECT_PAGE_LIMIT = 400;
const MAX_PROJECT_PAGES = 20;
const ATTESTATION_KEYS = Object.freeze({
  sourceProject: "APPBASIS_M5_NEON_SOURCE_PROJECT_ID",
  sourceBranch: "APPBASIS_M5_NEON_SOURCE_BRANCH_ID",
  sourceEndpoint: "APPBASIS_M5_NEON_SOURCE_ENDPOINT_ID",
  restoreProject: "APPBASIS_M5_NEON_RESTORE_PROJECT_ID",
  restoreBranch: "APPBASIS_M5_NEON_RESTORE_BRANCH_ID",
  restoreEndpoint: "APPBASIS_M5_NEON_RESTORE_ENDPOINT_ID",
});

export async function verifyUlcLinzM5NeonBranchIsolation({
  sourceUrl,
  restoreUrls,
  apiKey,
  orgId,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("ULC M5 Neon branch isolation requires NEON_API_KEY.");
  }
  if (typeof orgId !== "string" || !PROVIDER_ID_PATTERN.test(orgId)) {
    throw new Error("ULC M5 Neon branch isolation requires a canonical NEON_ORG_ID.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("ULC M5 Neon branch isolation provider dependency is invalid.");
  }
  if (!Array.isArray(restoreUrls) || restoreUrls.length === 0) {
    throw new Error("ULC M5 Neon branch isolation requires restore credentials.");
  }

  const source = parseDatabaseReference(sourceUrl, "ULC M5 production database URL");
  const restores = restoreUrls.map((value, index) =>
    parseDatabaseReference(value, `ULC M5 restore database URL ${index + 1}`),
  );
  if (new Set(restores.map((item) => item.database)).size !== 1) {
    throw new Error("All ULC M5 restore credentials must select the same database before provider verification.");
  }

  const projects = await listAllProjects({ apiKey, orgId, fetchImpl });
  if (projects.length === 0) {
    throw new Error("ULC M5 Neon branch isolation could not resolve any projects for the configured organization.");
  }

  const endpointGroups = await Promise.all(
    projects.map(async (project) => ({
      projectId: project.id,
      endpoints: await listProjectEndpoints({ projectId: project.id, apiKey, fetchImpl }),
    })),
  );
  const endpoints = endpointGroups.flatMap(({ projectId, endpoints: values }) =>
    values.map((endpoint) => ({ ...endpoint, _listedProjectId: projectId })),
  );

  const sourceIdentity = resolveEndpointIdentity(source, endpoints, "production");
  const restoreIdentities = restores.map((restore, index) =>
    resolveEndpointIdentity(restore, endpoints, `restore credential ${index + 1}`),
  );
  const restoreIdentity = restoreIdentities[0];

  for (const identity of restoreIdentities.slice(1)) {
    if (
      identity.projectId !== restoreIdentity.projectId ||
      identity.branchId !== restoreIdentity.branchId ||
      identity.database !== restoreIdentity.database
    ) {
      throw new Error("All ULC M5 restore credentials must resolve to the same Neon project, branch and database.");
    }
  }

  if (
    sourceIdentity.projectId === restoreIdentity.projectId &&
    sourceIdentity.branchId === restoreIdentity.branchId
  ) {
    throw new Error(
      "ULC M5 restore target must resolve to a different Neon branch from production before any destructive restore work.",
    );
  }

  return Object.freeze({
    source: sourceIdentity,
    restore: restoreIdentity,
    restoreCredentialCount: restoreIdentities.length,
  });
}

export async function persistUlcLinzM5NeonBranchIsolationAttestation(
  proof,
  { githubEnv = process.env.GITHUB_ENV } = {},
) {
  validateProof(proof);
  if (typeof githubEnv !== "string" || githubEnv.trim() === "") {
    throw new Error("ULC M5 Neon branch isolation requires GITHUB_ENV for cross-step attestation.");
  }
  const lines = [
    [ATTESTATION_KEYS.sourceProject, proof.source.projectId],
    [ATTESTATION_KEYS.sourceBranch, proof.source.branchId],
    [ATTESTATION_KEYS.sourceEndpoint, proof.source.endpointId],
    [ATTESTATION_KEYS.restoreProject, proof.restore.projectId],
    [ATTESTATION_KEYS.restoreBranch, proof.restore.branchId],
    [ATTESTATION_KEYS.restoreEndpoint, proof.restore.endpointId],
  ].map(([key, value]) => `${key}=${value}\n`).join("");
  await appendFile(githubEnv, lines, { encoding: "utf8", mode: 0o600 });
}

export function assertUlcLinzM5NeonBranchIsolationAttestation({
  sourceUrl,
  restoreUrl,
  env = process.env,
} = {}) {
  const source = parseDatabaseReference(sourceUrl, "ULC M5 production database URL");
  const restore = parseDatabaseReference(restoreUrl, "ULC M5 restore database URL");
  const sourceProject = requiredAttestationValue(env, ATTESTATION_KEYS.sourceProject);
  const sourceBranch = requiredAttestationValue(env, ATTESTATION_KEYS.sourceBranch);
  const sourceEndpoint = requiredAttestationValue(env, ATTESTATION_KEYS.sourceEndpoint);
  const restoreProject = requiredAttestationValue(env, ATTESTATION_KEYS.restoreProject);
  const restoreBranch = requiredAttestationValue(env, ATTESTATION_KEYS.restoreBranch);
  const restoreEndpoint = requiredAttestationValue(env, ATTESTATION_KEYS.restoreEndpoint);

  if (source.endpointId !== sourceEndpoint || restore.endpointId !== restoreEndpoint) {
    throw new Error("ULC M5 Neon branch isolation attestation does not match the active database endpoints.");
  }
  if (sourceProject === restoreProject && sourceBranch === restoreBranch) {
    throw new Error("ULC M5 Neon branch isolation attestation resolves restore to the production branch.");
  }
  return Object.freeze({
    source: { projectId: sourceProject, branchId: sourceBranch, endpointId: sourceEndpoint },
    restore: { projectId: restoreProject, branchId: restoreBranch, endpointId: restoreEndpoint },
  });
}

function parseDatabaseReference(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must be PostgreSQL.`);
  }
  const hostname = url.hostname.toLowerCase();
  const endpointId = hostname.split(".")[0]?.replace(/-pooler$/, "");
  if (
    !hostname.endsWith(".neon.tech") ||
    !endpointId?.startsWith("ep-") ||
    !PROVIDER_ID_PATTERN.test(endpointId)
  ) {
    throw new Error(`${name} must identify a canonical Neon compute endpoint.`);
  }
  const encodedDatabase = url.pathname.slice(1);
  if (!encodedDatabase || encodedDatabase.includes("/")) {
    throw new Error(`${name} must identify exactly one database.`);
  }
  let database;
  try {
    database = decodeURIComponent(encodedDatabase);
  } catch {
    throw new Error(`${name} contains an invalid encoded database name.`);
  }
  if (!database || database.includes("/") || database.includes("\\") || database.includes("\0")) {
    throw new Error(`${name} contains an invalid database name.`);
  }
  return Object.freeze({ hostname, endpointId, database });
}

async function listAllProjects({ apiKey, orgId, fetchImpl }) {
  const projects = [];
  const seenCursors = new Set();
  let cursor;
  for (let page = 0; page < MAX_PROJECT_PAGES; page += 1) {
    const url = new URL(`${NEON_API_ORIGIN}/projects`);
    url.searchParams.set("org_id", orgId);
    url.searchParams.set("limit", String(PROJECT_PAGE_LIMIT));
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);
    const body = await getJson(url, { apiKey, fetchImpl });
    if (!Array.isArray(body?.projects) || body.projects.length > PROJECT_PAGE_LIMIT) {
      throw new Error("ULC M5 Neon projects response is invalid.");
    }
    if (Array.isArray(body?.unavailable_project_ids) && body.unavailable_project_ids.length > 0) {
      throw new Error("ULC M5 Neon project inventory is incomplete.");
    }
    for (const project of body.projects) {
      if (!project || !PROVIDER_ID_PATTERN.test(project.id ?? "")) {
        throw new Error("ULC M5 Neon project identity is invalid.");
      }
      projects.push({ id: project.id });
    }
    if (body.projects.length < PROJECT_PAGE_LIMIT) return projects;
    const nextCursor = body?.pagination?.cursor;
    if (typeof nextCursor !== "string" || nextCursor.length === 0 || nextCursor === cursor || seenCursors.has(nextCursor)) {
      throw new Error("ULC M5 Neon project pagination is invalid.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  throw new Error("ULC M5 Neon project pagination exceeded the safe limit.");
}

async function listProjectEndpoints({ projectId, apiKey, fetchImpl }) {
  const url = new URL(`${NEON_API_ORIGIN}/projects/${encodeURIComponent(projectId)}/endpoints`);
  const body = await getJson(url, { apiKey, fetchImpl });
  if (!Array.isArray(body?.endpoints)) {
    throw new Error("ULC M5 Neon endpoints response is invalid.");
  }
  return body.endpoints;
}

function resolveEndpointIdentity(reference, endpoints, label) {
  const matches = endpoints.filter((endpoint) => {
    const host = typeof endpoint?.host === "string" ? endpoint.host.toLowerCase() : "";
    return host === reference.hostname && endpoint?.id === reference.endpointId;
  });
  if (matches.length !== 1) {
    throw new Error(`ULC M5 ${label} endpoint must resolve to exactly one Neon provider identity.`);
  }
  const endpoint = matches[0];
  if (
    !PROVIDER_ID_PATTERN.test(endpoint.project_id ?? "") ||
    endpoint.project_id !== endpoint._listedProjectId ||
    !PROVIDER_ID_PATTERN.test(endpoint.branch_id ?? "") ||
    endpoint.type !== "read_write"
  ) {
    throw new Error(`ULC M5 ${label} endpoint provider identity is incomplete or not read-write.`);
  }
  return Object.freeze({
    projectId: endpoint.project_id,
    branchId: endpoint.branch_id,
    endpointId: endpoint.id,
    database: reference.database,
  });
}

async function getJson(url, { apiKey, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    throw new Error("ULC M5 Neon provider identity lookup failed closed.");
  }
  if (!response?.ok) {
    throw new Error("ULC M5 Neon provider identity lookup was refused or failed.");
  }
  try {
    return await response.json();
  } catch {
    throw new Error("ULC M5 Neon provider identity response is invalid.");
  }
}

function requiredAttestationValue(env, key) {
  const value = env?.[key];
  if (typeof value !== "string" || !PROVIDER_ID_PATTERN.test(value)) {
    throw new Error("ULC M5 Neon branch isolation attestation is missing or invalid.");
  }
  return value;
}

function validateProof(proof) {
  for (const identity of [proof?.source, proof?.restore]) {
    if (
      !identity ||
      !PROVIDER_ID_PATTERN.test(identity.projectId ?? "") ||
      !PROVIDER_ID_PATTERN.test(identity.branchId ?? "") ||
      !PROVIDER_ID_PATTERN.test(identity.endpointId ?? "")
    ) {
      throw new Error("ULC M5 Neon branch isolation proof is invalid.");
    }
  }
  if (proof.source.projectId === proof.restore.projectId && proof.source.branchId === proof.restore.branchId) {
    throw new Error("ULC M5 Neon branch isolation proof resolves restore to production.");
  }
}
