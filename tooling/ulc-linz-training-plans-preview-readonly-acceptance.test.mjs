import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runUlcTrainingPlansPreviewReadOnlyAcceptance } from "./ulc-linz-training-plans-preview-readonly-acceptance.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

test("persistent preview acceptance never creates new training plans, groups, athletes, exercises or blocks", async () => {
  const workflow = await readFile(resolve(ROOT, ".github/workflows/ulc-linz-e7b9-preview.yml"), "utf8");
  assert.match(workflow, /run: node \.\/tooling\/ulc-linz-training-plans-preview-readonly-acceptance\.mjs/);
  assert.doesNotMatch(workflow, /run: node \.\/tooling\/ulc-linz-training-plans-preview-acceptance\.mjs/);
  assert.doesNotMatch(workflow, /run: node \.\/tooling\/ulc-linz-preview-group-cleanup\.mjs/);
});

test("read-only acceptance checks public HTTP contracts and makes only login POST", async () => {
  const calls = [];
  const response = (data, headers = {}) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
  const result = await runUlcTrainingPlansPreviewReadOnlyAcceptance({
    baseURL: "https://ulc-preview.example.workers.dev",
    username: "preview.admin",
    password: "private-secret",
  }, {
    now: () => new Date("2026-10-31T12:00:00Z"),
    fetchImpl: async (url, init) => {
      const u = new URL(url);
      calls.push({ method: init.method, path: u.pathname, search: u.search });
      if (u.pathname === "/api/auth/sign-in") {
        assert.equal(init.method, "POST");
        return response({ access: "full", identity: { username: "preview.admin" } },
          { "set-cookie": "preview_session=signed; Path=/; HttpOnly" });
      }
      assert.equal(init.method, "GET", "persistent preview data must only be read");
      assert.equal(init.headers.get("cookie"), "preview_session=signed");
      if (u.pathname === "/api/modules/athletes/masterdata") {
        return response({ masterdata: {
          trainingGroups: [{ id: "group-1", name: "Preview Selbstanmeldung", isActive: true }],
          athletes: [{ id: "athlete-1", firstName: "Preview", lastName: "Athlet", isActive: true }],
        } });
      }
      if (u.pathname === "/api/modules/training-plans/week") {
        assert.equal(u.searchParams.get("weekStart"), "2026-10-26");
        assert.equal(u.searchParams.get("subjectId"), "athlete-1");
        return response({ plans: [], attendance: [] });
      }
      if (u.pathname === "/api/modules/training-plans/overview") {
        assert.equal(u.searchParams.get("weekStart"), "2026-10-26");
        assert.equal(u.searchParams.get("groupId"), "group-1");
        return response({ overview: { rows: [] } });
      }
      if (u.pathname === "/api/modules/training-blocks") return response({ blocks: [] });
      throw new Error("Unexpected route " + u.pathname);
    },
  });
  assert.equal(result.status, "ok");
  assert.equal(result.mode, "read-only");
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(x => x.method), ["POST", "GET", "GET", "GET", "GET"]);
});

test("read-only preview fail-closes without the stable protected athlete and group", async () => {
  const response = (data, headers = {}) =>
    new Response(JSON.stringify(data), { status: 200, headers });
  await assert.rejects(
    runUlcTrainingPlansPreviewReadOnlyAcceptance({
      baseURL: "https://ulc-preview.example.workers.dev",
      username: "preview.admin",
      password: "private-secret",
    }, {
      fetchImpl: async (url) =>
        new URL(url).pathname === "/api/auth/sign-in"
          ? response({ access: "full", identity: { username: "preview.admin" } },
            { "set-cookie": "session=signed; Path=/; HttpOnly" })
          : response({ masterdata: { trainingGroups: [], athletes: [] } }),
    }),
    /Stable attendance preview group or athlete missing/,
  );
});
