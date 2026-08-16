import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertM3PreviewInitialVersionPreconditions,
  M3_PREVIEW_INITIAL_VERSION,
  resolveM3PreviewInitialVersionForDeploy,
  verifyCurrentM3PreviewInitialVersionDeployment,
  verifyM3PreviewInitialVersionDeployment,
  verifyM3PreviewInitialVersionUpload,
  writeM3PreviewInitialSecretsFile,
} from "./m3-preview-initial-version.mjs";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const API_TOKEN = "cloudflare-test-token-000000000000";
const VERSION_ID = "182bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e";
const OTHER_VERSION_ID = "282bd5e5-6e1a-4fe4-a799-aa6d9a6ab26e";
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

function workerPayload(deployedOn = null) {
  return Response.json({
    success: true,
    result: {
      id: "abcdef0123456789abcdef0123456789",
      name: M3_PREVIEW_INITIAL_VERSION.workerName,
      deployed_on: deployedOn,
    },
  });
}

function deploymentsPayload(deployments = []) {
  return Response.json({
    success: true,
    result: { deployments },
  });
}

function providerFetch({ versions = [], deployedOn = null, deployments = [] } = {}) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.match(options.headers.authorization, /^Bearer /);
    const target = String(url);
    if (target.includes("/versions?")) return versionsPayload(versions);
    if (target.endsWith("/deployments")) return deploymentsPayload(deployments);
    if (target.endsWith("/workers/appbasis-m3-preview")) {
      return workerPayload(deployedOn);
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

function initialVersion(id = VERSION_ID, sourceSha = M3_PREVIEW_INITIAL_VERSION.sourceSha) {
  return {
    id,
    annotations: {
      "workers/tag": M3_PREVIEW_INITIAL_VERSION.tag,
      "workers/message": `AppBasis m3-preview initial version ${sourceSha}`,
    },
  };
}

function initialDeployment({ versionId = VERSION_ID, percentage = 100 } = {}) {
  return {
    id: "deployment-1",
    versions: [{ version_id: versionId, percentage }],
  };
}

test("pins the one-time m3-preview initial version contract", () => {
  assert.deepEqual(M3_PREVIEW_INITIAL_VERSION, {
    workerName: "appbasis-m3-preview",
    tag: "m3-preview-initial-v1",
    sourceSha: "a359d6e6c39771e9d0dae3f73ba9918290356580",
    secretName: "BETTER_AUTH_SECRET",
  });
  assert.equal(Object.isFrozen(M3_PREVIEW_INITIAL_VERSION), true);
});

test("accepts only a Worker with no versions that has never been deployed", async () => {
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
        deployedOn: "2026-08-16T05:00:00.000Z",
      }),
    }),
    /never been deployed/,
  );
});

test("accepts only the exact tagged uploaded version while traffic remains undeployed", async () => {
  const version = initialVersion();
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
        versions: [version, initialVersion(OTHER_VERSION_ID)],
      }),
    }),
    /exact expected initial version/,
  );

  await assert.rejects(
    verifyM3PreviewInitialVersionUpload({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      versionId: VERSION_ID,
      fetchImpl: providerFetch({
        versions: [version],
        deployedOn: "2026-08-16T05:00:00.000Z",
      }),
    }),
    /deployed traffic/,
  );
});

test("resolves only the exact pristine initial version for first deployment", async () => {
  const result = await resolveM3PreviewInitialVersionForDeploy({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    fetchImpl: providerFetch({ versions: [initialVersion()] }),
  });
  assert.deepEqual(result, {
    status: "initial-version-deployable",
    versionId: VERSION_ID,
  });

  for (const versions of [[], [initialVersion(), initialVersion(OTHER_VERSION_ID)]]) {
    await assert.rejects(
      resolveM3PreviewInitialVersionForDeploy({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        fetchImpl: providerFetch({ versions }),
      }),
      /exactly one Worker version/,
    );
  }

  await assert.rejects(
    resolveM3PreviewInitialVersionForDeploy({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        versions: [
          {
            id: VERSION_ID,
            annotations: {
              "workers/tag": "unexpected",
              "workers/message": `AppBasis m3-preview initial version ${M3_PREVIEW_INITIAL_VERSION.sourceSha}`,
            },
          },
        ],
      }),
    }),
    /exact expected initial version/,
  );

  await assert.rejects(
    resolveM3PreviewInitialVersionForDeploy({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        versions: [initialVersion()],
        deployedOn: "2026-08-16T06:00:00.000Z",
      }),
    }),
    /never been deployed/,
  );
});

test("verifies exactly one 100 percent deployment of the initial version", async () => {
  const result = await verifyM3PreviewInitialVersionDeployment({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    versionId: VERSION_ID,
    fetchImpl: providerFetch({
      versions: [initialVersion()],
      deployedOn: "2026-08-16T06:00:00.000Z",
      deployments: [initialDeployment()],
    }),
  });
  assert.deepEqual(result, {
    status: "initial-version-deployed",
    versionId: VERSION_ID,
  });

  await assert.rejects(
    verifyM3PreviewInitialVersionDeployment({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      versionId: VERSION_ID,
      fetchImpl: providerFetch({
        versions: [initialVersion()],
        deployments: [initialDeployment()],
      }),
    }),
    /did not mark the Worker as deployed/,
  );

  for (const deployments of [
    [],
    [initialDeployment(), { ...initialDeployment(), id: "deployment-2" }],
  ]) {
    await assert.rejects(
      verifyM3PreviewInitialVersionDeployment({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        versionId: VERSION_ID,
        fetchImpl: providerFetch({
          versions: [initialVersion()],
          deployedOn: "2026-08-16T06:00:00.000Z",
          deployments,
        }),
      }),
      /exactly one deployment/,
    );
  }

  for (const deployment of [
    initialDeployment({ versionId: OTHER_VERSION_ID }),
    initialDeployment({ percentage: 50 }),
  ]) {
    await assert.rejects(
      verifyM3PreviewInitialVersionDeployment({
        accountId: ACCOUNT_ID,
        apiToken: API_TOKEN,
        versionId: VERSION_ID,
        fetchImpl: providerFetch({
          versions: [initialVersion()],
          deployedOn: "2026-08-16T06:00:00.000Z",
          deployments: [deployment],
        }),
      }),
      /exactly 100 percent/,
    );
  }
});

test("recovery verifies the unique deployed version and original source SHA", async () => {
  const validProvider = {
    versions: [initialVersion()],
    deployedOn: "2026-08-16T06:00:00.000Z",
    deployments: [initialDeployment()],
  };
  const result = await verifyCurrentM3PreviewInitialVersionDeployment({
    accountId: ACCOUNT_ID,
    apiToken: API_TOKEN,
    fetchImpl: providerFetch(validProvider),
  });
  assert.deepEqual(result, {
    status: "initial-version-deployed",
    versionId: VERSION_ID,
  });

  await assert.rejects(
    verifyCurrentM3PreviewInitialVersionDeployment({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        ...validProvider,
        versions: [initialVersion(VERSION_ID, "0000000000000000000000000000000000000000")],
      }),
    }),
    /exact expected initial version/,
  );

  await assert.rejects(
    verifyCurrentM3PreviewInitialVersionDeployment({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        ...validProvider,
        versions: [initialVersion(), initialVersion(OTHER_VERSION_ID)],
      }),
    }),
    /exactly one Worker version/,
  );

  await assert.rejects(
    verifyCurrentM3PreviewInitialVersionDeployment({
      accountId: ACCOUNT_ID,
      apiToken: API_TOKEN,
      fetchImpl: providerFetch({
        ...validProvider,
        deployments: [initialDeployment({ percentage: 50 })],
      }),
    }),
    /exactly 100 percent/,
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
