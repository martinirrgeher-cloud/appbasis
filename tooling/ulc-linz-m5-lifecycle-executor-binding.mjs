import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const WORKFLOW_PATH = ".github/workflows/m5-ulc-protected-lifecycle-operations.yml";
const EXECUTOR_PATH = "apps/ulc-linz/worker/protected-lifecycle-operations.ts";
const PUBLIC_ENTRYPOINT_PATH = "apps/ulc-linz/worker/index.ts";

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
  "new PostgresIdentityDeletion(connection.client)",
  "new PostgresIdentityDeletionRetention(",
  "new PostgresPermissionStore(connection.client)",
  "new PostgresPrincipalAccessAdministration(",
  "new PostgresPrincipalLifecycleAdministration(",
  "new PostgresUlcLinzScopePersistence(connection.client)",
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
