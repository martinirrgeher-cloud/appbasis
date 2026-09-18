import assert from "node:assert/strict";
import test from "node:test";

import { renderGeneratedPreviewWorker } from "./generated-preview-worker-template.mjs";

test("renders an app-specific preview database health wrapper", () => {
  const source = renderGeneratedPreviewWorker({ appId: "checklist" });
  assert.match(source, /appId: "checklist"/);
  assert.match(source, /\/api\/health\/database/);
  assert.match(source, /SELECT 1::integer AS appbasis_database_health/);
  assert.match(source, /createGeneratedPreviewWorker/);
  assert.match(source, /DATABASE_NOT_CONFIGURED/);
  assert.match(source, /DATABASE_UNAVAILABLE/);
});

test("rejects invalid generated preview app ids", () => {
  assert.throws(
    () => renderGeneratedPreviewWorker({ appId: "Checklist" }),
    /appId must match/,
  );
});
