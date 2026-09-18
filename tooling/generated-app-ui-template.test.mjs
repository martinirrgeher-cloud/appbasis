import assert from "node:assert/strict";
import test from "node:test";

import { renderGeneratedAppUiModule } from "./generated-app-ui-template.mjs";

test("generated app UI persists branding into executable static responses", () => {
  const source = renderGeneratedAppUiModule({
    appId: "checklist",
    displayName: "Checklist & Team",
    brandMark: "ct",
    accentColor: "#0F766E",
    modules: ["tasks"],
    platformServices: ["identity", "permissions"],
  });

  assert.match(source, /export const GENERATED_APP_HTML/);
  assert.match(source, /Checklist &amp; Team/);
  assert.match(source, />CT</);
  assert.match(source, /--app-accent: #0f766e/);
  assert.match(source, /const HAS_TASKS = true/);
  assert.match(source, /Aufgaben verwalten/);
  assert.match(source, /generatedUiResponse/);
  assert.match(source, /content-security-policy/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.doesNotMatch(source, /<script[^>]*>[^<]/);
});

test("generated app UI omits task controls when tasks are not permission-backed", () => {
  const source = renderGeneratedAppUiModule({
    appId: "identity-only",
    displayName: "Identity Only",
    modules: ["tasks"],
    platformServices: ["identity"],
  });

  assert.match(source, /const HAS_TASKS = false/);
  assert.match(source, /Für diese App ist noch kein Fachmodul aktiviert/);
  assert.doesNotMatch(source, /Aufgaben verwalten/);
});

test("generated app UI fails closed on invalid branding", () => {
  assert.throws(
    () =>
      renderGeneratedAppUiModule({
        appId: "demo",
        displayName: "Demo",
        brandMark: "ABC",
        accentColor: "#2563eb",
      }),
    /brandMark/,
  );
  assert.throws(
    () =>
      renderGeneratedAppUiModule({
        appId: "demo",
        displayName: "Demo",
        brandMark: "D",
        accentColor: "blue",
      }),
    /accentColor/,
  );
});
