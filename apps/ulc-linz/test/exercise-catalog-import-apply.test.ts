import { describe, expect, it } from "vitest";

import {
  createUlcExerciseCatalogWorkbook,
} from "../worker/exercise-catalog-exchange";
import {
  createUlcExerciseCatalogImportPreviewToken,
  previewUlcExerciseCatalogImport,
} from "../worker/exercise-catalog-import";
import {
  UlcExerciseCatalogImportApplyError,
  applyUlcExerciseCatalogImportPreview,
} from "../worker/exercise-catalog-import-apply";

const group = Object.freeze({
  id: "group-1",
  name: "Sprint",
  shortName: "SP",
  sortOrder: 10,
});

const existingItem = Object.freeze({
  id: "exercise-1",
  organizationId: "verein-1",
  name: "Fliegende 30 m",
  categoryKey: "max_velocity" as const,
  subcategory: "Fliegend",
  difficultyKey: null,
  goal: "Maximalgeschwindigkeit",
  description: "20 m Anlauf, anschließend 30 m maximal schnell bei sauberer Technik.",
  coachingCues: "Locker bleiben und aktiv nach hinten arbeiten.",
  commonMistakes: "Verkrampfte Schultern; zu frühes Abbremsen.",
  equipment: Object.freeze(["Hütchen", "Markierungen"]),
  videoUrl: null,
  videoUrls: Object.freeze([]),
  groupIds: Object.freeze(["group-1"]),
  similarExerciseIds: Object.freeze([]),
  parameters: Object.freeze([
    Object.freeze({
      key: "distance_m" as const,
      label: "Distanz",
      unit: "m",
      inputType: "number" as const,
      defaultValue: "30",
      minValue: 10,
      maxValue: 80,
      stepValue: 5,
      isRequired: true,
      sortOrder: 10,
    }),
  ]),
  isActive: true,
  isFavorite: false,
});

describe("ULC E6F3 controlled exercise catalog import apply", () => {
  it("binds the apply token to both XLSX bytes and the current authorized catalog state", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );
    const emptyCatalog = { items: [], trainingGroups: [group] };
    const token = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      emptyCatalog,
      "verein-1",
    );
    const same = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      emptyCatalog,
      "verein-1",
    );
    const changedCatalog = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      { items: [existingItem], trainingGroups: [group] },
      "verein-1",
    );
    const otherOrganization = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      emptyCatalog,
      "verein-2",
    );

    expect(token).toMatch(/^e6f3-v1\.[0-9a-f]{64}$/);
    expect(same).toBe(token);
    expect(changedCatalog).not.toBe(token);
    expect(otherOrganization).not.toBe(token);
  });

  it("creates only after an exact matching preview token and emits a CSV protocol", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );
    const catalog = { items: [], trainingGroups: [group] };
    const preview = await previewUlcExerciseCatalogImport(workbook, catalog);
    const token = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      catalog,
      "verein-1",
    );
    const calls: unknown[] = [];

    const result = await applyUlcExerciseCatalogImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      actorPrincipalId: "identity-1",
      service: {
        async create(organizationId, identityId, input) {
          calls.push({ type: "create", organizationId, identityId, input });
          return { id: "created-1", name: input.name };
        },
        async update() {
          throw new Error("unexpected update");
        },
      },
      now: () => new Date("2026-10-03T08:00:00.000Z"),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      type: "create",
      organizationId: "verein-1",
      identityId: "identity-1",
      input: {
        name: "Fliegende 30 m",
        categoryKey: "max_velocity",
        groupIds: ["group-1"],
      },
    });
    expect(result.summary).toEqual({
      rows: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(result.rows[0]).toMatchObject({
      requestedAction: "create",
      outcome: "created",
      exerciseId: "created-1",
    });
    expect(result.appliedAt).toBe("2026-10-03T08:00:00.000Z");
    expect(result.logCsv).toContain("Excel-Zeile;Datensatz-Schlüssel;Aktion;Ergebnis");
    expect(result.logCsv).toContain("beispiel-1;create;created;created-1");
  });

  it("updates through the normal catalog service contract and keeps unchanged rows as skip", async () => {
    const changed = {
      ...existingItem,
      goal: "Neue Zielbeschreibung",
    };
    const changedWorkbook = createUlcExerciseCatalogWorkbook(
      { items: [changed], trainingGroups: [group] },
      "export",
    );
    const catalog = { items: [existingItem], trainingGroups: [group] };
    const changedPreview = await previewUlcExerciseCatalogImport(
      changedWorkbook,
      catalog,
    );
    const changedToken = await createUlcExerciseCatalogImportPreviewToken(
      changedWorkbook,
      catalog,
      "verein-1",
    );
    const calls: unknown[] = [];

    const updated = await applyUlcExerciseCatalogImportPreview({
      preview: changedPreview,
      expectedPreviewToken: changedToken,
      actualPreviewToken: changedToken,
      organizationId: "verein-1",
      actorPrincipalId: "identity-1",
      service: {
        async create() {
          throw new Error("unexpected create");
        },
        async update(organizationId, identityId, exerciseId, input) {
          calls.push({
            organizationId,
            identityId,
            exerciseId,
            input,
          });
          return { id: exerciseId, name: input.name };
        },
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      organizationId: "verein-1",
      identityId: "identity-1",
      exerciseId: "exercise-1",
      input: { goal: "Neue Zielbeschreibung" },
    });
    expect(updated.summary.updated).toBe(1);

    const unchangedWorkbook = createUlcExerciseCatalogWorkbook(
      { items: [existingItem], trainingGroups: [group] },
      "export",
    );
    const unchangedPreview = await previewUlcExerciseCatalogImport(
      unchangedWorkbook,
      catalog,
    );
    const unchangedToken = await createUlcExerciseCatalogImportPreviewToken(
      unchangedWorkbook,
      catalog,
      "verein-1",
    );
    let mutationCalls = 0;
    const skipped = await applyUlcExerciseCatalogImportPreview({
      preview: unchangedPreview,
      expectedPreviewToken: unchangedToken,
      actualPreviewToken: unchangedToken,
      organizationId: "verein-1",
      actorPrincipalId: "identity-1",
      service: {
        async create() {
          mutationCalls += 1;
          return { id: "unexpected", name: "unexpected" };
        },
        async update() {
          mutationCalls += 1;
          return { id: "unexpected", name: "unexpected" };
        },
      },
    });

    expect(mutationCalls).toBe(0);
    expect(skipped.summary.skipped).toBe(1);
    expect(skipped.rows[0]).toMatchObject({
      outcome: "skipped",
      code: "UNCHANGED",
    });
  });

  it("neutralizes spreadsheet formulas in the CSV protocol", async () => {
    const formulaItem = {
      ...existingItem,
      name: "=2+2",
    };
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [formulaItem], trainingGroups: [group] },
      "export",
    );
    const catalog = { items: [formulaItem], trainingGroups: [group] };
    const preview = await previewUlcExerciseCatalogImport(workbook, catalog);
    const token = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      catalog,
      "verein-1",
    );

    const result = await applyUlcExerciseCatalogImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      actorPrincipalId: "identity-1",
      service: {
        async create() {
          throw new Error("unexpected create");
        },
        async update() {
          throw new Error("unexpected update");
        },
      },
    });

    expect(result.summary.skipped).toBe(1);
    expect(result.logCsv).toContain("'=2+2");
    expect(result.logCsv).not.toContain(";=2+2;");
  });

  it("rejects stale tokens before the first mutation", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );
    const catalog = { items: [], trainingGroups: [group] };
    const preview = await previewUlcExerciseCatalogImport(workbook, catalog);
    const token = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      catalog,
      "verein-1",
    );
    let mutationCalls = 0;

    await expect(
      applyUlcExerciseCatalogImportPreview({
        preview,
        expectedPreviewToken: token,
        actualPreviewToken: "e6f3-v1." + "0".repeat(64),
        organizationId: "verein-1",
        actorPrincipalId: "identity-1",
        service: {
          async create() {
            mutationCalls += 1;
            return { id: "unexpected", name: "unexpected" };
          },
          async update() {
            mutationCalls += 1;
            return { id: "unexpected", name: "unexpected" };
          },
        },
      }),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogImportApplyError);
    expect(mutationCalls).toBe(0);
  });

  it("records a row-level conflict without hiding the rest of the protocol", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );
    const catalog = { items: [], trainingGroups: [group] };
    const preview = await previewUlcExerciseCatalogImport(workbook, catalog);
    const token = await createUlcExerciseCatalogImportPreviewToken(
      workbook,
      catalog,
      "verein-1",
    );

    const result = await applyUlcExerciseCatalogImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      actorPrincipalId: "identity-1",
      service: {
        async create() {
          throw new Error("database unavailable");
        },
        async update() {
          throw new Error("unexpected update");
        },
      },
    });

    expect(result.summary.failed).toBe(1);
    expect(result.rows[0]).toMatchObject({
      outcome: "failed",
      code: "IMPORT_APPLY_FAILED",
    });
    expect(result.logCsv).toContain("IMPORT_APPLY_FAILED");
  });

  it("blocks inactive creates or changes instead of silently changing archive state", async () => {
    const archived = {
      ...existingItem,
      id: "archived-new",
      name: "Archivierte Neuübung",
      isActive: false,
    };
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [archived], trainingGroups: [group] },
      "export",
    );

    const preview = await previewUlcExerciseCatalogImport(
      workbook,
      { items: [], trainingGroups: [group] },
    );

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "invalid",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_EXERCISE_ID",
        }),
      ]),
    );
  });
});
