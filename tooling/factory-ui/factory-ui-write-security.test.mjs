import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startFactoryServer } from "./server.mjs";

test("factory write UI blocks framing and rejects unsafe creation input", async (t) => {
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
  const pageBody = await page.text();
  const formStart = pageBody.indexOf('<form id="create-form"');
  const createButton = pageBody.indexOf('id="create-app-button"', formStart);
  const status = pageBody.indexOf('id="factory-status"', createButton);
  const formEnd = pageBody.indexOf("</form>", formStart);
  const preview = pageBody.indexOf('class="factory-preview ab-surface"', formEnd);
  assert.ok(formStart >= 0);
  assert.ok(createButton > formStart);
  assert.ok(status > createButton);
  assert.ok(status < formEnd);
  assert.ok(preview > formEnd);

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

  const overlongAppId = `a${"b".repeat(63)}`;
  assert.equal(overlongAppId.length, 64);
  const overlong = await fetch(`${baseUrl}/api/factory/apps`, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: overlongAppId,
      displayName: "Too Long",
      modules: [],
      platformServices: [],
    }),
  });
  assert.equal(overlong.status, 400);
  assert.equal((await overlong.json()).error.code, "INVALID_APP_REQUEST");
  await assert.rejects(
    readFile(
      join(fixtureRoot, "apps", overlongAppId, "appbasis.app.json"),
      "utf8",
    ),
    (error) => error?.code === "ENOENT",
  );
});