import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url);

test("M5 pilot gate reads provider binding evidence from canonical owner inputs", async () => {
  const source = await readFile(workflowUrl, "utf8");
  assert.match(
    source,
    /bundle\?\.ownerInputs\?\.providerBoundEvidenceInput\?\.resourceBindingEvidence/,
  );
  assert.doesNotMatch(
    source,
    /bundle\?\.providerBoundEvidenceInput\?\.resourceBindingEvidence/,
  );
  assert.match(source, /validMs - observedMs !== 15 \* 60 \* 1000/);
  assert.match(source, /name: ulc-linz-m5-production-gate/);
  assert.match(source, /productionReleaseAuthorized: false/);
});
