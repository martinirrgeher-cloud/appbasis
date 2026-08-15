import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));

test("Factory draft offers curated design presets and configurable bottom navigation without extending the generator request", async () => {
  const source = await readFile(join(directory, "create-app.js"), "utf8");

  assert.match(source, /STYLE_PRESETS/);
  assert.match(source, /id: "clear", label: "Klar"/);
  assert.match(source, /id: "soft", label: "Soft"/);
  assert.match(source, /id: "compact", label: "Compact"/);
  assert.match(source, /MAX_DIRECT_NAVIGATION_ITEMS = 5/);
  assert.match(source, /dataset\.flowStep = "navigation"/);
  assert.match(source, /Bottom-Menü/);
  assert.match(source, /preview-bottom-nav/);
  assert.match(source, /Weitere Bereiche landen unter „Mehr“/);

  const createInput = source.match(/function currentCreateInput\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(createInput, /appId:/);
  assert.match(createInput, /displayName:/);
  assert.match(createInput, /modules:/);
  assert.match(createInput, /platformServices:/);
  assert.doesNotMatch(createInput, /stylePreset:/);
  assert.doesNotMatch(createInput, /navigation:/);

  assert.match(
    source,
    /Gestaltung und Navigation sind aktuell Entwurfswerte; Preview und Produktion bleiben getrennt gesperrt/,
  );
});
