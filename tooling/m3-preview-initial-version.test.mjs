import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertM3PreviewInitialVersionPreconditions,
  M3_PREVIEW_INITIAL_VERSION,
  verifyM3PreviewInitialVersionUpload,
  writeM3PreviewInitialSecretsFile,
} from "./m3-preview-initial-version.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const VERSION_ID = "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e";
const SECRET = "m3-preview-secret-value-0000000000000000";

function versionsPayload(versions = []) {
  return Response.json({
    success: true,
    result: versions,
    result_info: {
      count: versions.length,
      page: 1,
      per_page: 100,
      total_count: versions.length,
      total_pages: versions.length === 0 ? 0 : 1,
    },
  });
}

function deploymentsPayload(deployments = []) {
  return Response.json({
    success: true,
    result: { deployments },
  });
}

function providerFetch({ versions = [], deployments = [] } = {}) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.match(options.headers.authorization, /^Bearer /);
    if (String(url).includes("/versions?")) return versionsPayload(versions);
    if (String(url).endsWith("/deployments")) {
      return deploymentsPayload(deployments);
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

test("pins the one-time m3-preview initial version contract", () => {
  assert.deepEqual(M3_PREVIEW_INITIAL_VERSION, {
    workerName: "appbasis-m3-preview",
    tag: "m3-preview-initial-v1",
    secretName: "BETTER_AUTH_SECRET",
  });
  assert.equal(Object.isFrozen(M3_PREVIEW_INITIAL_VERSION), true);
});

test("accepts only a Worker with no versions and no deployments", async () => {
  await assert.doesNotReject(
    assertM3PreviewInitialVersionPreconditions({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch(),
    }),
  );

  await assert.rejects(
    assertM3PreviewInitialVersionPreconditions({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({ versions: [{ id: VERSION_ID }] }),
    }),
    /no existing versions/,
  );

  await assert.rejects(
    assertM3PreviewInitialVersionPreconditions({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        deployments: [{ id: "deployment-id" }],
      }),
    }),
    /no existing deployments/,
  );
});

test("accepts only the exact tagged uploaded version while traffic remains undeployed", async () => {
  const version = {
    id: VERSION_ID,
    annotations: {
      "workers/tag": M3_PREVIEW_INITIAL_VERSION.tag,
    },
  };
  const result = await verifyM3PreviewInitialVersionUpload({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    versionId: VERSION_ID,
    fetchImpl: providerFetch({ versions: [version] }),
  });

  assert.deepEqual(result, {
    status: "initial-version-uploaded",
    versionId: VERSION_ID,
  });

  await assert.rejects(
    verifyM3PreviewInitialVersionUpload({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      versionId: VERSION_ID,
      fetchImpl: providerFetch({
        versions: [version, { ...version, id: "282bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e" }],
      }),
    }),
    /exact expected Worker version/,
  );

  await assert.rejects(
    verifyM3PreviewInitialVersionUpload({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      versionId: VERSION_ID,
      fetchImpl: providerFetch({
        versions: [version],
        deployments: [{ id: "deployment-id" }],
      }),
    }),
    /unexpectedly created a deployment/,
  );
});

test("writes only the required secret to a new owner-only file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "appbasis-m3-initial-"));
  const outputPath = join(directory, "secrets.json");
  try {
    await writeM3PreviewInitialSecretsFile({ outputPath, secret: SECRET });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), {
      BETTER_AUTH_SECRET: SECRET,
    });
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);

    await assert.rejects(
      writeM3PreviewInitialSecretsFile({ outputPath, secret: SECRET }),
      /EEXIST/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects invalid auth secrets before writing a file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "appbasis-m3-secret-"));
  const outputPath = join(directory, "secrets.json");
  try {
    for (const secret of ["short", ` ${SECRET}`, `${SECRET} `]) {
      await assert.rejects(
        writeM3PreviewInitialSecretsFile({ outputPath, secret }),
        /runtime contract/,
      );
    }
    await assert.rejects(stat(outputPath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sanitizes provider errors without exposing response messages", async () => {
  await assert.rejects(
    assertM3PreviewInitialVersionPreconditions({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: async () =>
        Response.json(
          {
            success: false,
            errors: [
              {
                code: 10001,
                message: "postgresql://secret-host/private",
              },
            ],
          },
          { status: 403 },
        ),
    }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.match(error.message, /codes 10001/);
      assert.doesNotMatch(error.message, /secret-host/);
      return true;
    },
  );
});

test("does not overwrite an existing file even if it was created separately", async () => {
  const directory = await mkdtemp(join(tmpdir(), "appbasis-m3-existing-"));
  const outputPath = join(directory, "secrets.json");
  try {
    await writeFile(outputPath, "existing", { mode: 0o600 });
    await assert.rejects(
      writeM3PreviewInitialSecretsFile({ outputPath, secret: SECRET }),
      /EEXIST/,
    );
    assert.equal(await readFile(outputPath, "utf8"), "existing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
