import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PREVIEW_EXERCISE_CATEGORY_KEY,
  readUlcTrainingPlansPreviewAcceptanceEnvironment,
  runUlcTrainingPlansPreviewAcceptance,
  UlcTrainingPlansPreviewAcceptanceError,
} from "./ulc-linz-training-plans-preview-acceptance.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

test("E7B9 acceptance requires only the isolated preview origin and protected preview-admin credential", () => {
  assert.deepEqual(
    readUlcTrainingPlansPreviewAcceptanceEnvironment({
      APPBASIS_GENERATED_PREVIEW_URL:
        "https://appbasis-ulc-linz.example.workers.dev",
      APPBASIS_PREVIEW_USER_PASSWORD: "protected-preview-password",
    }),
    {
      baseURL:
        "https://appbasis-ulc-linz.example.workers.dev",
      username: "preview.admin",
      password: "protected-preview-password",
    },
  );

  assert.throws(
    () =>
      readUlcTrainingPlansPreviewAcceptanceEnvironment({
        APPBASIS_GENERATED_PREVIEW_URL:
          "https://appbasis-ulc-linz.example.workers.dev",
      }),
    UlcTrainingPlansPreviewAcceptanceError,
  );
  assert.throws(
    () =>
      readUlcTrainingPlansPreviewAcceptanceEnvironment({
        APPBASIS_GENERATED_PREVIEW_URL:
          "http://appbasis-ulc-linz.example.workers.dev",
        APPBASIS_PREVIEW_USER_PASSWORD: "x",
      }),
    /canonical HTTPS origin/,
  );
});


test("E7B9 acceptance fixture uses a configured ULC exercise category", async () => {
  const domainSource = await readFile(
    resolve(
      repositoryRoot,
      "apps/ulc-linz/worker/exercise-catalog-domain.ts",
    ),
    "utf8",
  );

  assert.ok(
    domainSource.includes(
      `{ key: "${PREVIEW_EXERCISE_CATEGORY_KEY}", label:`,
    ),
    "Acceptance exercise category must exist in the ULC catalog definition.",
  );
});

test("E7B9 acceptance uses only public HTTP contracts and never accepts client-owned organization scope", async () => {
  const source = await readFile(
    resolve(
      repositoryRoot,
      "tooling/ulc-linz-training-plans-preview-acceptance.mjs",
    ),
    "utf8",
  );

  for (const route of [
    "/api/auth/sign-in",
    "/api/modules/kindertraining",
    "/api/modules/kindertraining/session",
    "/api/modules/athletes/masterdata/training-groups",
    "/api/modules/athletes/masterdata/athletes",
    "/api/modules/athletes/masterdata/athlete-group-memberships",
    "/api/modules/exercise-catalog",
    "/api/modules/training-blocks",
    "/api/modules/training-plans",
    "/api/modules/training-plans/week",
    "/api/modules/training-plans/block-templates",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(source, /organizationId\s*:/);
  assert.match(source, /TRAINING_PLAN_CONFLICT/);
  assert.match(source, /sourceBlockRevision !== 1/);
  assert.match(source, /usageCount/);
  assert.match(source, /lastUsedAt/);
  assert.match(source, /status === "present"/);
  assert.match(source, /currentRevision !== 1/);
});


test("E7B9 acceptance executes the complete isolated public-HTTP happy path", async () => {
  const calls = [];
  let planDate = null;
  let blockName = null;
  let exerciseName = null;

  const json = (payload, status = 200, headers = {}) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
    });

  const planItem = () => ({
    kind: "block",
    itemId: "plan-block-1",
    sourceBlockId: "block-1",
    sourceBlockRevision: 1,
    name: blockName,
    durationMinutes: 25,
    note: "E7B9 preview source template",
    exercises: [
      {
        itemId: "plan-exercise-1",
        sourceExerciseId: "exercise-1",
        name: exerciseName,
        sets: null,
        repetitions: null,
        amount: null,
        unit: null,
        comment: "E7B9 preview exercise occurrence",
      },
    ],
  });

  const planSnapshot = (revision) => ({
    id: "plan-1",
    currentRevision: revision,
    revision: {
      items: [planItem()],
    },
  });

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, search: url.search, body });

    if (method === "POST" && url.pathname === "/api/auth/sign-in") {
      return json(
        {
          access: "full",
          identity: { username: "preview.admin" },
        },
        200,
        { "set-cookie": "session=e7b9; Path=/; HttpOnly" },
      );
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/athletes/masterdata/training-groups"
    ) {
      assert.match(body.name, /^E7B9 Preview Group [a-f0-9]{12}$/);
      assert.equal(body.shortName, "E7B9");
      return json({ trainingGroup: { id: "group-1" } }, 201);
    }

    if (method === "GET" && url.pathname === "/api/modules/kindertraining") {
      return json({ trainingGroups: [{ id: "group-1", name: "E7B9" }] });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/athletes/masterdata/athletes"
    ) {
      return json({ athlete: { id: "athlete-1" } }, 201);
    }

    if (
      method === "POST" &&
      url.pathname ===
        "/api/modules/athletes/masterdata/athlete-group-memberships"
    ) {
      assert.equal(body.athleteId, "athlete-1");
      assert.equal(body.groupId, "group-1");
      planDate = body.startedOn;
      return json({ membership: { athleteId: "athlete-1" } }, 201);
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/exercise-catalog"
    ) {
      assert.equal(body.categoryKey, PREVIEW_EXERCISE_CATEGORY_KEY);
      assert.deepEqual(body.groupIds, ["group-1"]);
      exerciseName = body.name;
      return json({ item: { id: "exercise-1" } }, 201);
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/training-blocks"
    ) {
      assert.equal(body.audienceId, "group-1");
      blockName = body.name;
      return json(
        {
          block: {
            id: "block-1",
            currentRevision: 1,
            revision: {
              exercises: [{ itemId: "block-exercise-1" }],
            },
          },
        },
        201,
      );
    }

    if (
      method === "GET" &&
      url.pathname ===
        "/api/modules/training-plans/block-templates/block-1"
    ) {
      assert.equal(url.search, "?revision=1");
      return json({
        template: {
          id: "block-1",
          currentRevision: 1,
          item: { kind: "block" },
        },
      });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/training-plans"
    ) {
      assert.equal(body.subjectId, "athlete-1");
      assert.equal(body.planDate, planDate);
      return json({ plan: planSnapshot(1) }, 201);
    }

    if (
      method === "GET" &&
      url.pathname === "/api/modules/kindertraining/session"
    ) {
      assert.equal(url.searchParams.get("groupId"), "group-1");
      assert.equal(url.searchParams.get("sessionDate"), planDate);
      return json({
        snapshot: {
          session: null,
          participants: [
            {
              athleteId: "athlete-1",
              status: "open",
            },
          ],
        },
      });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/kindertraining/session"
    ) {
      assert.equal(body.groupId, "group-1");
      assert.ok(
        body.attendance.some(
          (entry) =>
            entry.athleteId === "athlete-1" &&
            entry.status === "present",
        ),
      );
      return json({ snapshot: {} });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/training-blocks/block-1/update"
    ) {
      assert.equal(body.expectedRevision, 1);
      assert.equal(body.audienceId, "group-1");
      return json({ block: {} });
    }

    if (
      method === "GET" &&
      url.pathname === "/api/modules/training-plans/week"
    ) {
      assert.equal(url.searchParams.get("subjectId"), "athlete-1");
      assert.equal(url.searchParams.get("weekStart"), planDate);
      return json({
        plans: [planSnapshot(1)],
        attendance: [{ sessionDate: planDate, status: "present" }],
      });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/training-plans/plan-1/update"
    ) {
      if (body.note === "E7B9 stale write") {
        return json(
          { error: { code: "TRAINING_PLAN_CONFLICT" } },
          409,
        );
      }
      assert.equal(body.expectedRevision, 1);
      return json({ plan: planSnapshot(2) });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/training-plans/block-templates"
    ) {
      assert.equal(body.planId, "plan-1");
      assert.equal(body.blockItemId, "plan-block-1");
      assert.equal(body.expectedRevision, 2);
      assert.equal(body.audienceId, "group-1");
      return json(
        { template: { id: "saved-template-1", currentRevision: 1 } },
        201,
      );
    }

    if (
      method === "GET" &&
      url.pathname === "/api/modules/training-blocks"
    ) {
      return json({
        blocks: [
          {
            id: "block-1",
            usageCount: 1,
            lastUsedAt: "2026-10-18T06:00:00.000Z",
          },
          {
            id: "saved-template-1",
            currentRevision: 1,
          },
        ],
      });
    }

    throw new Error(`Unexpected E7B9 request: ${method} ${url.pathname}${url.search}`);
  };

  const result = await runUlcTrainingPlansPreviewAcceptance(
    {
      baseURL: "https://appbasis-ulc-linz.example.workers.dev",
      username: "preview.admin",
      password: "protected-preview-password",
    },
    {
      fetchImpl,
      randomUUID: () => "01234567-89ab-cdef-0123-456789abcdef",
    },
  );

  assert.equal(result.status, "ok");
  assert.equal(result.groupId, "group-1");
  assert.deepEqual(result.checks, [
    "login",
    "week-view",
    "attendance",
    "autosave",
    "block-template-adoption",
    "independent-snapshot",
    "save-back",
    "usage-metadata",
    "optimistic-concurrency",
  ]);

  const groupCreate = calls.findIndex(
    (call) =>
      call.method === "POST" &&
      call.path ===
        "/api/modules/athletes/masterdata/training-groups",
  );
  const kindertrainingRead = calls.findIndex(
    (call) =>
      call.method === "GET" &&
      call.path === "/api/modules/kindertraining",
  );
  const membershipCreate = calls.findIndex(
    (call) =>
      call.method === "POST" &&
      call.path ===
        "/api/modules/athletes/masterdata/athlete-group-memberships",
  );
  assert.ok(groupCreate > 0);
  assert.ok(kindertrainingRead > groupCreate);
  assert.ok(membershipCreate > kindertrainingRead);
});
