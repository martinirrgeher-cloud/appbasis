import assert from "node:assert/strict";
import test from "node:test";

import { observeGeneratedPreviewRepositoryState } from "./generated-preview-repository-state.mjs";

const HEAD = "a".repeat(40);

function execFixture({ head = HEAD, status = "" } = {}) {
  const calls = [];
  return {
    calls,
    execFileImpl: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === "rev-parse") return { stdout: `${head}\n` };
      if (args[0] === "status") return { stdout: status };
      throw new Error("unexpected git command");
    },
  };
}

test("generated preview repository state requires an exact clean git worktree", async () => {
  const fixture = execFixture();
  const state = await observeGeneratedPreviewRepositoryState("/repo", fixture);

  assert.deepEqual(state, {
    status: "clean",
    headSha: HEAD,
  });
  assert.deepEqual(
    fixture.calls.map(({ command, args, options }) => ({
      command,
      args,
      cwd: options.cwd,
      encoding: options.encoding,
    })),
    [
      {
        command: "git",
        args: ["rev-parse", "--verify", "HEAD^{commit}"],
        cwd: "/repo",
        encoding: "utf8",
      },
      {
        command: "git",
        args: ["status", "--porcelain=v1", "--untracked-files=all"],
        cwd: "/repo",
        encoding: "utf8",
      },
    ],
  );
});

test("generated preview repository state treats tracked and untracked changes as dirty", async () => {
  const tracked = await observeGeneratedPreviewRepositoryState(
    "/repo",
    execFixture({ status: " M tooling/file.mjs\n" }),
  );
  assert.deepEqual(tracked, {
    status: "dirty",
    headSha: HEAD,
  });

  const untracked = await observeGeneratedPreviewRepositoryState(
    "/repo",
    execFixture({ status: "?? apps/new-app/appbasis.app.json\n" }),
  );
  assert.deepEqual(untracked, {
    status: "dirty",
    headSha: HEAD,
  });
});

test("generated preview repository state fails closed on unavailable or malformed git evidence", async () => {
  assert.deepEqual(
    await observeGeneratedPreviewRepositoryState("/repo", {
      execFileImpl: async () => {
        throw new Error("git unavailable");
      },
    }),
    { status: "unavailable", headSha: null },
  );

  assert.deepEqual(
    await observeGeneratedPreviewRepositoryState(
      "/repo",
      execFixture({ head: "not-a-commit" }),
    ),
    { status: "unavailable", headSha: null },
  );
});
