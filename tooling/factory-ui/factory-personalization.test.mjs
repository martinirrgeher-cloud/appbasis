import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));

test("Factory draft offers curated design presets and configurable bottom navigation without extending the generator request", async () => {
  const [source, targetFlowCss] = await Promise.all([
    readFile(join(directory, "create-app.js"), "utf8"),
    readFile(join(directory, "target-flow.css"), "utf8"),
  ]);

  assert.match(source, /STYLE_PRESETS/);
  assert.match(source, /id: "clear", label: "Klar"/);
  assert.match(source, /id: "soft", label: "Soft"/);
  assert.match(source, /id: "compact", label: "Compact"/);
  assert.match(source, /MAX_DIRECT_NAVIGATION_ITEMS = 5/);
  assert.match(source, /dataset\.flowStep = "navigation"/);
  assert.match(source, /Bottom-Menü/);
  assert.match(source, /preview-bottom-nav/);
  assert.match(source, /Weitere Bereiche landen unter „Mehr“/);
  assert.match(source, /\$\{item\.label\} nach links verschieben/);
  assert.match(source, /\$\{item\.label\} nach rechts verschieben/);
  assert.match(
    targetFlowCss,
    /@media \(min-width: 920px\)[\s\S]*?grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/,
  );

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

test("Factory navigation keeps explicit hidden choices, reserves Mehr, and only defaults new areas", async () => {
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  globalThis.document = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.MutationObserver = class {
    observe() {}
  };

  try {
    const { directNavigationCapacity, reconcileNavigationDraftState } = await import(
      `./create-app.js?navigation-state-test=${Date.now()}`
    );

    assert.equal(directNavigationCapacity(5), 5);
    assert.equal(directNavigationCapacity(6), 4);

    const initial = reconcileNavigationDraftState({
      candidateIds: ["overview", "module:tasks"],
      currentOrder: ["overview"],
      directIds: ["overview"],
    });
    assert.deepEqual(initial.navigationOrder, ["overview", "module:tasks"]);
    assert.deepEqual(initial.directNavigationItems, ["overview", "module:tasks"]);

    const hiddenTasks = reconcileNavigationDraftState({
      candidateIds: ["overview", "module:tasks"],
      currentOrder: initial.navigationOrder,
      directIds: ["overview"],
    });
    assert.deepEqual(hiddenTasks.directNavigationItems, ["overview"]);

    const newRoles = reconcileNavigationDraftState({
      candidateIds: ["overview", "module:tasks", "roles"],
      currentOrder: hiddenTasks.navigationOrder,
      directIds: hiddenTasks.directNavigationItems,
    });
    assert.deepEqual(newRoles.navigationOrder, ["overview", "module:tasks", "roles"]);
    assert.deepEqual(newRoles.directNavigationItems, ["overview", "roles"]);

    const candidates = ["overview", "one", "two", "three", "four", "five"];
    const overflowCapacity = directNavigationCapacity(candidates.length);
    const overflow = reconcileNavigationDraftState({
      candidateIds: candidates,
      currentOrder: candidates,
      directIds: ["overview", "one", "two", "three", "four"],
      maxDirectItems: overflowCapacity,
    });
    assert.deepEqual(overflow.directNavigationItems, [
      "overview",
      "one",
      "two",
      "three",
    ]);

    const swapped = reconcileNavigationDraftState({
      candidateIds: candidates,
      currentOrder: overflow.navigationOrder,
      directIds: ["overview", "one", "two", "five"],
      maxDirectItems: overflowCapacity,
    });
    assert.deepEqual(swapped.directNavigationItems, [
      "overview",
      "one",
      "two",
      "five",
    ]);
    assert.equal(swapped.directNavigationItems.includes("three"), false);
    assert.equal(swapped.directNavigationItems.includes("four"), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousMutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = previousMutationObserver;
  }
});