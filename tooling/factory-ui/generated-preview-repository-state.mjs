import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export async function observeGeneratedPreviewRepositoryState(
  repositoryRoot,
  { execFileImpl = execFileAsync } = {},
) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) {
    return unavailableState();
  }
  if (typeof execFileImpl !== "function") return unavailableState();

  let headResult;
  let statusResult;
  try {
    headResult = await execFileImpl(
      "git",
      ["rev-parse", "--verify", "HEAD^{commit}"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    statusResult = await execFileImpl(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  } catch {
    return unavailableState();
  }

  const headSha =
    typeof headResult?.stdout === "string"
      ? headResult.stdout.trim()
      : "";
  const status =
    typeof statusResult?.stdout === "string"
      ? statusResult.stdout
      : null;

  if (!COMMIT_SHA_PATTERN.test(headSha) || status === null) {
    return unavailableState();
  }

  return Object.freeze({
    status: status.length === 0 ? "clean" : "dirty",
    headSha,
  });
}

function unavailableState() {
  return Object.freeze({
    status: "unavailable",
    headSha: null,
  });
}
