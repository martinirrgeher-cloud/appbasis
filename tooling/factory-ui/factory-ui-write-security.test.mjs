import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startFactoryServer } from "./server.mjs";

test("factory write UI cannot be framed and unsupported services are client errors", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "appbasis-factory-write-review-"));
  await mkdir(join(fixtureRoot, "apps", "demo"), { recursive: true });
  await mkdir(join(fixtureRoot, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "apps", "demo", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "demo",
        displayName: "Demo",
        modules: ["tasks"],
        platformServices: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const server = await startFactoryServer({ repositoryRoot: fixtureRoot, port: 0 });
  t.after(async () => {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal(
    page.headers.get("content-security-policy"),
    "frame-ancestors 'none'",
  );

  const unsupportedService = await fetch(`${baseUrl}/api/factory/apps`, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "unsupported-service",
      displayName: "Unsupported Service",
      modules: [],
      platformServices: ["not-real"],
    }),
  });
  assert.equal(unsupportedService.status, 400);
  assert.equal(
    (await unsupportedService.json()).error.code,
    "INVALID_APP_REQUEST",
  );
  await assert.rejects(
    readFile(
      join(fixtureRoot, "apps", "unsupported-service", "appbasis.app.json"),
      "utf8",
    ),
    (error) => error?.code === "ENOENT",
  );
});
