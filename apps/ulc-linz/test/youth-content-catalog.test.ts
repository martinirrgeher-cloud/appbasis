import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ULC_YOUTH_CONTENT_CATALOG,
  normalizeUlcYouthContentItems,
  youthContentItemsForLegacyTitles,
} from "../worker/training-content-catalog";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import { ULC_U12_HTML, ULC_U12_SCRIPT, ULC_U12_CSS } from "../worker/u12-ui";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("ULC youth training category catalog v13", () => {
  it("offers stable distinct machine identifiers for all youth groups", () => {
    expect(ULC_YOUTH_CONTENT_CATALOG.length).toBeGreaterThanOrEqual(9);
    expect(new Set(ULC_YOUTH_CONTENT_CATALOG.map((x) => x.code)).size)
      .toBe(ULC_YOUTH_CONTENT_CATALOG.length);
    expect(new Set(ULC_YOUTH_CONTENT_CATALOG.map((x) => x.label)).size)
      .toBe(ULC_YOUTH_CONTENT_CATALOG.length);
    expect(ULC_YOUTH_CONTENT_CATALOG.every((x) =>
      /^[a-z]+$/.test(x.code) && x.label.length > 0 && x.label.length <= 120)).toBe(true);
    expect(ULC_YOUTH_CONTENT_CATALOG).toContainEqual({ code: "sprint", label: "Sprint / Schnelligkeit" });
  });

  it("validates stable identifiers independent from later renamed labels", () => {
    const titles = ["Sprint / Schnelligkeit", "Freies Alttraining"];
    const valid = normalizeUlcYouthContentItems(titles, [
      { code: "sprint", detail: "4 × 30 m" },
      { code: "", detail: "Alte Bezeichnung beibehalten" },
    ]);
    expect(valid).toEqual([
      { code: "sprint", detail: "4 × 30 m" },
      { code: "", detail: "Alte Bezeichnung beibehalten" },
    ]);
    expect(Object.isFrozen(valid)).toBe(true);
    for (const bad of [
      [{ code: "sprint", detail: " 4 × 30 m" }, { code: "", detail: "" }],
      [{ code: "Bad id", detail: "" }, { code: "", detail: "" }],
      [{ code: "x".repeat(81), detail: "" }, { code: "", detail: "" }],
      [{ code: "sprint", detail: "x".repeat(201) }, { code: "", detail: "" }],
      [{ code: "sprint", detail: "\n" }, { code: "", detail: "" }],
      [{ code: "sprint", detail: "", injected: 1 }, { code: "", detail: "" }],
      [{ code: "sprint", detail: "" }],
    ]) {
      expect(() => normalizeUlcYouthContentItems(titles, bad as never))
        .toThrow(UlcTrainingValidationError);
    }
  });

  it("keeps historic free-text sessions unchanged and unclassified", () => {
    expect(youthContentItemsForLegacyTitles(["Sprint", "Spiel"]))
      .toEqual([{ code: "", detail: "" }, { code: "", detail: "" }]);
    expect(youthContentItemsForLegacyTitles([])).toEqual([]);
  });

  it("adds metadata to existing session rows without touching attendance assignments", async () => {
    const root = appRoot;
    const sql = await readFile(
      resolve(root, "migrations/0012_ulc_linz_youth_training_catalog.sql"), "utf8",
    );
    const configuration = JSON.parse(await readFile(resolve(root, "appbasis.database.json"), "utf8"));
    expect(sql).toContain("ADD COLUMN training_content_items jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(sql).toContain("jsonb_array_length(training_content_items) <= 5");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|CREATE TABLE/);
    expect(JSON.stringify(configuration))
      .toContain("apps/ulc-linz/migrations/0012_ulc_linz_youth_training_catalog.sql");
  });

  it("keeps classification and notes in the existing U12 editor, overlay and save payload", () => {
    expect(ULC_U12_HTML).toContain('id="u12-content-card"');
    expect(ULC_U12_HTML).toContain('id="u12-content-assign"');
    expect(ULC_U12_SCRIPT).toContain("let U12_STANDARD_CONTENT_CATALOG = [];");
    expect(ULC_U12_SCRIPT).toContain('category.dataset.u12CodeIndex = String(index)');
    expect(ULC_U12_SCRIPT).toContain('detail.dataset.u12DetailIndex = String(index)');
    expect(ULC_U12_SCRIPT).toContain('detail.maxLength = 200');
    expect(ULC_U12_SCRIPT).toContain('contentItems: u12ContentItems.map((meta) => ({');
    expect(ULC_U12_SCRIPT).toContain('u12ContentItems = u12Snapshot.contentItems.map((meta) => ({ ...meta }))');
    expect(ULC_U12_SCRIPT).toContain('u12ContentItems.splice(index, 1)');
    expect(ULC_U12_SCRIPT).toContain('u12ContentItems.push({ code: "", detail: "" })');
    expect(ULC_U12_SCRIPT).toContain('chip.textContent = slot + ". "');
    expect(ULC_U12_CSS).toContain('.u12-content-fields');
    expect(ULC_U12_SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB|innerHTML/);
  });

  it("uses an authorized U12 save path with unchanged CAS semantics", async () => {
    const root = resolve(appRoot, "worker");
    const [http, service, repository] = await Promise.all([
      readFile(resolve(root, "index.ts"), "utf8"),
      readFile(resolve(root, "u12-service.ts"), "utf8"),
      readFile(resolve(root, "training-session-postgres.ts"), "utf8"),
    ]);
    expect(http).toContain('"contentItems",');
    expect(http).toContain("contentItems: body.contentItems as UlcYouthContentItem[]");
    expect(service).toContain("normalizeUlcYouthContentItems(input.contentTitles, input.contentItems)");
    expect(service).toContain("youthContentItemsForLegacyTitles(contentTitles)");
    expect(repository).toContain("training_content_items = CASE");
    expect(repository).toContain("WHEN $11::jsonb IS NOT NULL THEN $11::jsonb");
    expect(repository).toContain("trainingContentItems: readTrainingContentItems(");
    expect(repository).toContain("xmin::text = $9::text");
    expect(repository).toContain("training_content_slots");
  });
});
