import assert from "node:assert/strict";
import test from "node:test";
import { deriveFc1LifecycleStatus, FC1_LIFECYCLE_STATUSES } from "./fc1-lifecycle-status.mjs";

test("FC1 exposes the required lifecycle status set", () => {
  assert.deepEqual([...FC1_LIFECYCLE_STATUSES], [
    "draft",
    "repository-created",
    "preview-prepared",
    "preview-deployed",
    "preview-accepted",
    "production-ready",
    "production-released",
  ]);
});

test("FC1 derives each lifecycle state and next action monotonically", () => {
  const steps = [
    [{}, "draft", "create-repository"],
    [{ repositoryCreated: true }, "repository-created", "prepare-preview"],
    [{ repositoryCreated: true, previewPrepared: true }, "preview-prepared", "deploy-preview"],
    [{ repositoryCreated: true, previewPrepared: true, previewDeployed: true }, "preview-deployed", "accept-preview"],
    [{ repositoryCreated: true, previewPrepared: true, previewDeployed: true, previewAccepted: true }, "preview-accepted", "prepare-production"],
    [{ repositoryCreated: true, previewPrepared: true, previewDeployed: true, previewAccepted: true, productionReady: true }, "production-ready", "release-production"],
    [{ repositoryCreated: true, previewPrepared: true, previewDeployed: true, previewAccepted: true, productionReady: true, productionReleased: true }, "production-released", null],
  ];
  for (const [evidence, status, nextAction] of steps) {
    assert.deepEqual(deriveFc1LifecycleStatus(evidence), { status, nextAction });
  }
});

test("FC1 fails closed on skipped lifecycle transitions", () => {
  assert.throws(() => deriveFc1LifecycleStatus({ previewPrepared: true }), /requires repositoryCreated/);
  assert.throws(() => deriveFc1LifecycleStatus({ repositoryCreated: true, previewDeployed: true }), /requires previewPrepared/);
  assert.throws(() => deriveFc1LifecycleStatus({ repositoryCreated: true, previewPrepared: true, previewDeployed: true, productionReady: true }), /requires previewAccepted/);
  assert.throws(() => deriveFc1LifecycleStatus({ repositoryCreated: true, previewPrepared: true, previewDeployed: true, previewAccepted: true, productionReleased: true }), /requires productionReady/);
});

test("FC1 rejects unknown and non-boolean evidence", () => {
  assert.throws(() => deriveFc1LifecycleStatus({ providerId: "secret" }), /Unknown FC1 lifecycle evidence key/);
  assert.throws(() => deriveFc1LifecycleStatus({ repositoryCreated: 1 }), /must be boolean/);
});
