import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  APP_THEME_FILE,
  createAppTheme,
  parseAppTheme,
  readAppTheme,
  renderAppTheme,
} from "./app-theme.mjs";

test("app theme normalizes the persisted FC1 branding contract", () => {
  assert.deepEqual(
    createAppTheme({
      displayName: "Sportverein Linz",
      brandMark: "sl",
      accentColor: "#2A6FD6",
    }),
    {
      schemaVersion: 1,
      brandMark: "SL",
      accentColor: "#2a6fd6",
    },
  );

  assert.deepEqual(
    createAppTheme({ displayName: "Übungs-App" }),
    {
      schemaVersion: 1,
      brandMark: "Ü",
      accentColor: "#2563eb",
    },
  );

  assert.equal(
    renderAppTheme({
      schemaVersion: 1,
      brandMark: "A",
      accentColor: "#2563eb",
    }),
    '{\n  "schemaVersion": 1,\n  "brandMark": "A",\n  "accentColor": "#2563eb"\n}\n',
  );
});

test("app theme fails closed for unknown fields and malformed branding", () => {
  for (const invalid of [
    null,
    [],
    { schemaVersion: 2, brandMark: "A", accentColor: "#2563eb" },
    { schemaVersion: 1, brandMark: "", accentColor: "#2563eb" },
    { schemaVersion: 1, brandMark: "ABC", accentColor: "#2563eb" },
    { schemaVersion: 1, brandMark: " A", accentColor: "#2563eb" },
    { schemaVersion: 1, brandMark: "A", accentColor: "blue" },
    { schemaVersion: 1, brandMark: "A", accentColor: "#12345" },
    {
      schemaVersion: 1,
      brandMark: "A",
      accentColor: "#2563eb",
      releaseProduction: true,
    },
  ]) {
    assert.throws(() => parseAppTheme(invalid));
  }
});

test("app theme reader uses defaults only when the manifest is absent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "appbasis-theme-"));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const definition = {
    appId: "demo",
    displayName: "Demo",
  };
  await mkdir(join(root, "apps", "demo"), { recursive: true });

  assert.deepEqual(await readAppTheme(root, definition), {
    schemaVersion: 1,
    brandMark: "D",
    accentColor: "#2563eb",
  });

  await writeFile(
    join(root, "apps", "demo", APP_THEME_FILE),
    JSON.stringify({
      schemaVersion: 1,
      brandMark: "dm",
      accentColor: "#0F766E",
    }),
  );
  assert.deepEqual(await readAppTheme(root, definition), {
    schemaVersion: 1,
    brandMark: "DM",
    accentColor: "#0f766e",
  });

  await writeFile(
    join(root, "apps", "demo", APP_THEME_FILE),
    "{ invalid-json\n",
  );
  await assert.rejects(
    readAppTheme(root, definition),
    /appbasis\.theme\.json is not valid JSON/,
  );
});
