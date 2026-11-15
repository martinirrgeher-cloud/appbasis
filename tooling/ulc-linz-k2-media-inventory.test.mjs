import test from "node:test";
import assert from "node:assert/strict";
import { reconcileK2PrivateMedia as check, K2MediaInventoryError } from "./ulc-linz-k2-media-inventory.mjs";

const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const key = "exercise-catalog/ulc-linz/exercise-1/media-1";
const metadata = [{ key, size: 24, sha256: hash }];
const objects = [{ key, size: 24, sha256: hash }];
const good = () => ({ metadata, objects, metadataSnapshot: "fence-1", objectSnapshot: "fence-1", versionFenceVerified: true });
const fail = (args) => assert.throws(() => check(args), K2MediaInventoryError);

test("exact independent snapshot parity, no promotion claim", () => {
  assert.deepEqual(check(good()), {
    status: "inventory-parity-only", verified: true, metadataCount: 1,
    objectCount: 1, missing: 0, unexpected: 0,
    sizeMismatch: 0, digestMismatch: 0,
    mediaRestoreVerified: false, legalDeletionApproved: false,
    productionReady: false,
  });
});
test("missing provider object fails closed", () => {
  const result = check({ ...good(), objects: [] });
  assert.equal(result.verified, false);
  assert.equal(result.missing, 1);
});
test("orphan provider object fails closed", () => {
  const result = check({ ...good(), metadata: [] });
  assert.equal(result.verified, false);
  assert.equal(result.unexpected, 1);
});
test("size mismatch fails closed", () => {
  assert.equal(check({ ...good(), objects: [{ ...objects[0], size: 25 }] }).sizeMismatch, 1);
});
test("content digest mismatch fails closed", () => {
  assert.equal(check({ ...good(), objects: [{ ...objects[0], sha256: otherHash }] }).digestMismatch, 1);
});
test("duplicates in either inventory fail closed", () => {
  fail({ ...good(), metadata: [...metadata, ...metadata] });
  fail({ ...good(), objects: [...objects, ...objects] });
});
test("unfenced and inconsistent snapshots fail closed", () => {
  fail({ ...good(), versionFenceVerified: false });
  fail({ ...good(), objectSnapshot: "fence-2" });
  fail({ ...good(), metadataSnapshot: "" });
});
test("invalid keys and path traversal fail closed", () => {
  for (const bad of [
    "../exercise-catalog/a/b/c",
    "exercise-catalog/a/b",
    "exercise-catalog/a/../b",
    "exercise-catalog/a/%2F/b",
    "exercise-catalog/a/%2f/b",
    "exercise-catalog/a/%00/b",
    "exercise-catalog/a/%252F/b",
    "exercise-catalog/a/b/c/extra",
  ]) {
    fail({ ...good(), metadata: [{ ...metadata[0], key: bad }] });
  }
});
test("invalid sizes and digests fail closed", () => {
  for (const size of [-1, 1.1, NaN, Infinity, 100 * 1024 * 1024 + 1]) {
    fail({ ...good(), objects: [{ ...objects[0], size }] });
  }
  for (const sha256 of ["etag", "A".repeat(64), "", undefined]) {
    fail({ ...good(), objects: [{ ...objects[0], sha256 }] });
  }
});
test("bad input shape and record limits fail closed", () => {
  fail({ ...good(), metadata: {} });
  fail({ ...good(), objects: [null] });
  fail({ ...good(), metadata: new Array(100001) });
});
test("empty inventories only establish empty parity", () => {
  const result = check({ ...good(), metadata: [], objects: [] });
  assert.equal(result.verified, true);
  assert.equal(result.mediaRestoreVerified, false);
});
