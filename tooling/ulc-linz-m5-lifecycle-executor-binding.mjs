import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const WORKFLOW_PATH = ".github/workflows/m5-ulc-protected-lifecycle-operations.yml";
const EXECUTOR_PATH = "apps/ulc-linz/worker/protected-lifecycle-operations.ts";
const PUBLIC_ENTRYPOINT_PATH = "apps/ulc-linz/worker/index.ts";
const WORKFLOW_GIT_BLOB_SHA = "92a22df1803897806638de58f886cc365d33cf57";
const EXECUTOR_GIT_BLOB_SHA = "273e502b7d98bdf1786022f5c63f9cf74330269c";

const REQUIRED_WORKFLOW_ANCHORS = Object.freeze([
  "name: M5 ULC Protected Lifecycle Operations",
  "environment: m4-dr",
  "VERIFY-ULC-M5-LIFECYCLE-BINDING",
  "RUN-ULC-M5-PRODUCTION-RETENTION",
  "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_WRITE_TOKEN }}",
  "pnpm --dir apps/reference exec wrangler dev --remote",
  "createUlcLinzProtectedLifecycleOperations",
  "await lifecycle.verifyBinding()",
  "await lifecycle.runRetention()",
  "x-appbasis-lifecycle-token",
  "x-appbasis-lifecycle-operation",
  "dev: { ip: '127.0.0.1', port: 8787 }",
]);

const REQUIRED_EXECUTOR_ANCHORS = Object.freeze([
  'import { runUlcLinzRetention, type UlcLinzRetentionRunResult } from "./retention";',
  "identity: identityRuntime.lifecycleIdentity",
  "new PostgresIdentityDeletion(lifecycleClient)",
  "new PostgresIdentityDeletionRetention(",
  "new PostgresPermissionStore(lifecycleClient)",
  "new PostgresPrincipalAccessAdministration(",
  "new PostgresPrincipalLifecycleAdministration(",
  "new PostgresUlcLinzScopePersistence(lifecycleClient)",
  "return runUlcLinzRetention(dependencies);",
]);

const FORBIDDEN_WORKFLOW_ANCHORS = Object.freeze([
  "wrangler deploy",
  "workers_dev: true",
  "preview_urls: true",
  "routes:",
  "route:",
  "custom_domains:",
]);

export async function verifyUlcLinzM5LifecycleExecutorBinding(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const [workflow, executor, publicEntrypoint] = await Promise.all([
    readFile(join(root, WORKFLOW_PATH), "utf8"),
    readFile(join(root, EXECUTOR_PATH), "utf8"),
    readFile(join(root, PUBLIC_ENTRYPOINT_PATH), "utf8"),
  ]);

  if (gitBlobSha(workflow) !== WORKFLOW_GIT_BLOB_SHA) {
    throw new Error("ULC protected lifecycle workflow baseline drifted.");
  }
  if (gitBlobSha(executor) !== EXECUTOR_GIT_BLOB_SHA) {
    throw new Error("ULC protected lifecycle executor baseline drifted.");
  }
  if (!REQUIRED_WORKFLOW_ANCHORS.every((anchor) => workflow.includes(anchor))) {
    throw new Error("ULC protected lifecycle workflow contract is incomplete.");
  }
  if (!REQUIRED_EXECUTOR_ANCHORS.every((anchor) => executor.includes(anchor))) {
    throw new Error("ULC protected lifecycle executor composition is incomplete.");
  }
  if (FORBIDDEN_WORKFLOW_ANCHORS.some((anchor) => workflow.includes(anchor))) {
    throw new Error("ULC protected lifecycle workflow exposes a forbidden deployment surface.");
  }
  if (
    publicEntrypoint.includes("protected-lifecycle-operations") ||
    publicEntrypoint.includes("createUlcLinzProtectedLifecycleOperations")
  ) {
    throw new Error("ULC protected lifecycle executor leaked into the public app runtime.");
  }

  return Object.freeze({
    executionBoundary: "protected-operations",
    deletionExecutorBound: true,
    retentionExecutorBound: true,
  });
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}
