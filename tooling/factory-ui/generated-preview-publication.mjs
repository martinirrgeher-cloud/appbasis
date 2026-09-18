import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GITHUB_TREE_URL =
  "https://api.github.com/repos/martinirrgeher-cloud/appbasis/git/trees/main?recursive=1";
const TIMEOUT_MS = 3000;
const APP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const GENERATED_PREVIEW_PUBLICATION_FILES = Object.freeze([
  "appbasis.app.json",
  "appbasis.theme.json",
  "appbasis.database.json",
  "package.json",
  "worker/index.ts",
  "worker/ui.ts",
  "worker/preview.ts",
]);
export const GENERATED_PREVIEW_ROOT_PUBLICATION_FILES = Object.freeze([
  "pnpm-lock.yaml",
]);

export async function verifyGeneratedPreviewPublishedOnMain(
  repositoryRoot,
  appId,
  { fetchImpl = fetch } = {},
) {
  if (typeof fetchImpl !== "function") return false;
  if (typeof appId !== "string" || !APP_ID_PATTERN.test(appId)) return false;

  let response;
  try {
    response = await fetchImpl(GITHUB_TREE_URL, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return false;
  }

  if (!response?.ok) return false;
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;

  let payload;
  try {
    payload = await response.json();
  } catch {
    return false;
  }

  if (
    payload?.truncated !== false ||
    !Array.isArray(payload?.tree)
  ) {
    return false;
  }

  const remoteBlobs = new Map(
    payload.tree
      .filter(
        (entry) =>
          entry?.type === "blob" &&
          typeof entry.path === "string" &&
          typeof entry.sha === "string",
      )
      .map((entry) => [entry.path, entry.sha]),
  );

  for (const relativePath of GENERATED_PREVIEW_PUBLICATION_FILES) {
    let source;
    try {
      source = await readFile(
        join(repositoryRoot, "apps", appId, ...relativePath.split("/")),
      );
    } catch {
      return false;
    }

    const remotePath = `apps/${appId}/${relativePath}`;
    if (remoteBlobs.get(remotePath) !== gitBlobSha(source)) {
      return false;
    }
  }

  for (const relativePath of GENERATED_PREVIEW_ROOT_PUBLICATION_FILES) {
    let source;
    try {
      source = await readFile(join(repositoryRoot, relativePath));
    } catch {
      return false;
    }
    if (remoteBlobs.get(relativePath) !== gitBlobSha(source)) {
      return false;
    }
  }

  return true;
}

export function gitBlobSha(source) {
  const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return createHash("sha1").update(header).update(buffer).digest("hex");
}
