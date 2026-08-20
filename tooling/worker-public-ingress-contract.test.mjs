import assert from "node:assert/strict";
import test from "node:test";

import { verifyReferenceRoleAdminPublicIngress } from "./reference-role-admin-ingress.mjs";
import {
  assertNoPublicWorkerIngressEvidence,
  createNoPublicWorkerIngressEvidence,
} from "./worker-public-ingress-contract.mjs";

const worker = "appbasis-reference-role-admin";

function successResponse(result, resultInfo) {
  const payload = { success: true, result };
  if (resultInfo !== undefined) payload.result_info = resultInfo;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("pins the shared no-public-ingress contract to the established protected Reference verifier output", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith(`/workers/scripts/${worker}/subdomain`)) {
      return successResponse({ enabled: false, previews_enabled: false });
    }
    if (url.includes("/workers/domains?")) {
      return successResponse([], { count: 0 });
    }
    if (url.endsWith("/workers/scripts")) {
      return successResponse([{ id: worker, routes: [] }]);
    }
    return new Response("not found", { status: 404 });
  };

  const referenceEvidence = await verifyReferenceRoleAdminPublicIngress({
    accountId: "account-id",
    apiToken: "token-value",
    fetchImpl,
  });

  assert.deepEqual(
    assertNoPublicWorkerIngressEvidence(referenceEvidence),
    createNoPublicWorkerIngressEvidence(),
  );
});

test("shared ingress evidence accepts only the exact established private-worker snapshot", () => {
  assert.deepEqual(
    assertNoPublicWorkerIngressEvidence({
      workersDevEnabled: false,
      previewUrlsEnabled: false,
      customDomainCount: 0,
      routeCount: 0,
    }),
    createNoPublicWorkerIngressEvidence(),
  );

  for (const evidence of [
    {
      workersDevEnabled: true,
      previewUrlsEnabled: false,
      customDomainCount: 0,
      routeCount: 0,
    },
    {
      workersDevEnabled: false,
      previewUrlsEnabled: false,
      customDomainCount: 1,
      routeCount: 0,
    },
    {
      workersDevEnabled: false,
      previewUrlsEnabled: false,
      customDomainCount: 0,
      routeCount: 0,
      hostname: "admin.example.test",
    },
  ]) {
    assert.throws(
      () => assertNoPublicWorkerIngressEvidence(evidence),
      /public-ingress evidence is invalid|public ingress/,
    );
  }
});
