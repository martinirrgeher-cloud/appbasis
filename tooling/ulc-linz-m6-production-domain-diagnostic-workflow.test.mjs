import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL("../.github/workflows/m6-ulc-production-domain-diagnostic.yml", import.meta.url);

test("M6 production domain diagnostic is explicit, read-only and non-release-authorizing", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "DIAGNOSE-ULC-M6-PRODUCTION-DOMAIN",
    "refs/heads/main",
    "group: m6-ulc-production-runtime-config",
    "app.ulc-linz.at",
    "ulc-linz.at",
    "appbasis-ulc-linz-production",
    "/workers/domains?hostname=$TARGET_HOSTNAME",
    "/zones?name=$TARGET_ZONE&status=active&per_page=5",
    "No active ulc-linz.at zone is visible to CLOUDFLARE_API_TOKEN",
    "belongs to a different Cloudflare account than CLOUDFLARE_ACCOUNT_ID",
    "/dns_records?name=$TARGET_HOSTNAME&per_page=100",
    "already has a CNAME DNS record",
    "mode: read-only provider preflight",
    "active zone visible to read token: verified",
    "zone account matches worker account: verified",
    "provider mutation: none",
    "M6 Production Ready: not established by this run",
    "final production release: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing diagnostic guard: ${marker}`);
  }

  assert.equal(
    source.includes("/zones?name=$TARGET_ZONE&account.id=$CLOUDFLARE_ACCOUNT_ID"),
    false,
    "diagnostic must inspect token-visible zone ownership before enforcing the expected account",
  );

  for (const forbidden of [
    "CLOUDFLARE_API_WRITE_TOKEN",
    "--request PUT",
    "--request POST",
    "--request PATCH",
    "--request DELETE",
    "--data ",
    "releaseAuthorized: true",
    "releaseProduction",
  ]) {
    assert.equal(source.includes(forbidden), false, `read-only diagnostic contains forbidden mutation marker: ${forbidden}`);
  }
});
