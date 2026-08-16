import assert from "node:assert/strict";
import test from "node:test";

import {
  M3PreviewAcceptanceConfigurationError,
  readM3PreviewAcceptanceEnvironment,
  runM3PreviewAcceptanceSmoke,
} from "./m3-preview-acceptance-smoke.mjs";

const BASE_URL = "https://appbasis-m3-preview.example.workers.dev";
const ENV = Object.freeze({
  APPBASIS_GENERATED_PREVIEW_URL: BASE_URL,
  APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD: "allowed-temporary-000000000000",
  APPBASIS_SMOKE_ALLOWED_PASSWORD: "allowed-final-00000000000000000",
  APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD: "denied-temporary-0000000000000",
  APPBASIS_SMOKE_DENIED_PASSWORD: "denied-final-000000000000000000",
});

function session(username, identityId, access = "full") {
  return {
    access,
    identity: {
      identityId,
      username,
      accountStatus: "active",
      mustChangePassword: access === "password-change-required",
    },
  };
}

function jsonResponse(payload, { status = 200, cookie } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie !== undefined) headers.set("set-cookie", `${cookie}; Path=/; HttpOnly`);
  return new Response(JSON.stringify(payload), { status, headers });
}

function sequenceFetch(steps) {
  const pending = [...steps];
  const fetchImpl = async (url, options) => {
    const step = pending.shift();
    assert.ok(step, `unexpected request ${options.method} ${url}`);
    assert.equal(new URL(url).pathname, step.path);
    assert.equal(options.method, step.method ?? "GET");
    return step.response();
  };
  fetchImpl.assertDone = () => assert.equal(pending.length, 0);
  return fetchImpl;
}

function task(status = "open") {
  return {
    id: "task-1",
    title: "M3 acceptance marker-1",
    description: "AppBasis generated preview acceptance marker-1.",
    status,
  };
}

function principalSignInSteps({ username, identityId, passwordChange = false }) {
  if (!passwordChange) {
    return [
      {
        path: "/api/auth/sign-in",
        method: "POST",
        response: () =>
          jsonResponse(session(username, identityId), {
            cookie: `session=${identityId}`,
          }),
      },
    ];
  }
  return [
    {
      path: "/api/auth/sign-in",
      method: "POST",
      response: () =>
        jsonResponse(
          { error: { code: "AUTHENTICATION_FAILED", message: "invalid" } },
          { status: 401 },
        ),
    },
    {
      path: "/api/auth/sign-in",
      method: "POST",
      response: () =>
        jsonResponse(session(username, identityId, "password-change-required"), {
          cookie: `session=${identityId}-temporary`,
        }),
    },
    {
      path: "/api/auth/change-required-password",
      method: "POST",
      response: () =>
        jsonResponse(session(username, identityId), {
          cookie: `session=${identityId}-final`,
        }),
    },
  ];
}

function successfulSteps({
  allowedPasswordChange = false,
  deniedPasswordChange = false,
} = {}) {
  return [
    ...principalSignInSteps({
      username: "m3.smoke.denied",
      identityId: "denied-id",
      passwordChange: deniedPasswordChange,
    }),
    {
      path: "/api/auth/session",
      response: () => jsonResponse(session("m3.smoke.denied", "denied-id")),
    },
    {
      path: "/api/tasks",
      response: () =>
        jsonResponse(
          { error: { code: "PERMISSION_DENIED", message: "denied" } },
          { status: 403 },
        ),
    },
    ...principalSignInSteps({
      username: "m3.smoke.allowed",
      identityId: "allowed-id",
      passwordChange: allowedPasswordChange,
    }),
    {
      path: "/api/auth/session",
      response: () => jsonResponse(session("m3.smoke.allowed", "allowed-id")),
    },
    { path: "/api/tasks", response: () => jsonResponse({ tasks: [] }) },
    {
      path: "/api/tasks",
      method: "POST",
      response: () => jsonResponse({ task: task("open") }),
    },
    { path: "/api/tasks", response: () => jsonResponse({ tasks: [task("open")] }) },
    {
      path: "/api/tasks/task-1/toggle",
      method: "POST",
      response: () => jsonResponse({ task: task("completed") }),
    },
    {
      path: "/api/tasks",
      response: () => jsonResponse({ tasks: [task("completed")] }),
    },
  ];
}

function defaultUuidFetch() {
  let createdTask = null;
  return async (url, options) => {
    const path = new URL(url).pathname;
    const method = options.method ?? "GET";
    const cookie = options.headers.get("cookie");

    if (path === "/api/auth/sign-in" && method === "POST") {
      const body = JSON.parse(options.body);
      const identityId = body.username === "m3.smoke.denied" ? "denied-id" : "allowed-id";
      return jsonResponse(session(body.username, identityId), {
        cookie: `session=${identityId}`,
      });
    }

    if (path === "/api/auth/session" && method === "GET") {
      if (cookie === "session=denied-id") {
        return jsonResponse(session("m3.smoke.denied", "denied-id"));
      }
      assert.equal(cookie, "session=allowed-id");
      return jsonResponse(session("m3.smoke.allowed", "allowed-id"));
    }

    if (path === "/api/tasks" && method === "GET" && cookie === "session=denied-id") {
      return jsonResponse(
        { error: { code: "PERMISSION_DENIED", message: "denied" } },
        { status: 403 },
      );
    }

    if (path === "/api/tasks" && method === "GET") {
      assert.equal(cookie, "session=allowed-id");
      return jsonResponse({ tasks: createdTask === null ? [] : [createdTask] });
    }

    if (path === "/api/tasks" && method === "POST") {
      assert.equal(cookie, "session=allowed-id");
      const body = JSON.parse(options.body);
      const marker = body.title.replace("M3 acceptance ", "");
      assert.match(marker, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(body.title, `M3 acceptance ${marker}`);
      assert.equal(
        body.description,
        `AppBasis generated preview acceptance ${marker}.`,
      );
      createdTask = {
        id: "task-default-uuid",
        title: body.title,
        description: body.description,
        status: "open",
      };
      return jsonResponse({ task: createdTask });
    }

    if (path === "/api/tasks/task-default-uuid/toggle" && method === "POST") {
      assert.equal(cookie, "session=allowed-id");
      createdTask = { ...createdTask, status: "completed" };
      return jsonResponse({ task: createdTask });
    }

    throw new Error(`unexpected request ${method} ${path}`);
  };
}

test("pins canonical and distinct m3-preview acceptance credentials", () => {
  assert.deepEqual(readM3PreviewAcceptanceEnvironment(ENV), {
    baseURL: BASE_URL,
    allowedTemporaryPassword: ENV.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
    allowedPassword: ENV.APPBASIS_SMOKE_ALLOWED_PASSWORD,
    deniedTemporaryPassword: ENV.APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD,
    deniedPassword: ENV.APPBASIS_SMOKE_DENIED_PASSWORD,
  });

  assert.throws(
    () =>
      readM3PreviewAcceptanceEnvironment({
        ...ENV,
        APPBASIS_SMOKE_DENIED_PASSWORD: ENV.APPBASIS_SMOKE_ALLOWED_PASSWORD,
      }),
    M3PreviewAcceptanceConfigurationError,
  );
});

test("proves auth, explicit permission denial and persistent tasks behavior", async () => {
  const fetchImpl = sequenceFetch(successfulSteps());
  const result = await runM3PreviewAcceptanceSmoke(
    readM3PreviewAcceptanceEnvironment(ENV),
    { fetchImpl, randomUUID: () => "marker-1" },
  );
  fetchImpl.assertDone();
  assert.deepEqual(result, {
    status: "ok",
    deniedIdentityId: "denied-id",
    allowedIdentityId: "allowed-id",
  });
});

test("uses the real default UUID generator with its Crypto receiver intact", async () => {
  const result = await runM3PreviewAcceptanceSmoke(
    readM3PreviewAcceptanceEnvironment(ENV),
    { fetchImpl: defaultUuidFetch() },
  );
  assert.deepEqual(result, {
    status: "ok",
    deniedIdentityId: "denied-id",
    allowedIdentityId: "allowed-id",
  });
});

test("replaces allowed bootstrap temporary password before module smoke", async () => {
  const fetchImpl = sequenceFetch(successfulSteps({ allowedPasswordChange: true }));
  await assert.doesNotReject(
    runM3PreviewAcceptanceSmoke(readM3PreviewAcceptanceEnvironment(ENV), {
      fetchImpl,
      randomUUID: () => "marker-1",
    }),
  );
  fetchImpl.assertDone();
});

test("replaces denied bootstrap temporary password before permission smoke", async () => {
  const fetchImpl = sequenceFetch(successfulSteps({ deniedPasswordChange: true }));
  await assert.doesNotReject(
    runM3PreviewAcceptanceSmoke(readM3PreviewAcceptanceEnvironment(ENV), {
      fetchImpl,
      randomUUID: () => "marker-1",
    }),
  );
  fetchImpl.assertDone();
});

test("fails closed if the denied principal can read tasks", async () => {
  const steps = successfulSteps();
  const deniedTasksIndex = steps.findIndex(
    (step) => step.path === "/api/tasks" && (step.method ?? "GET") === "GET",
  );
  steps[deniedTasksIndex] = {
    path: "/api/tasks",
    response: () => jsonResponse({ tasks: [] }),
  };
  const fetchImpl = sequenceFetch(steps);
  await assert.rejects(
    runM3PreviewAcceptanceSmoke(readM3PreviewAcceptanceEnvironment(ENV), {
      fetchImpl,
      randomUUID: () => "marker-1",
    }),
    /permission boundary/,
  );
});
