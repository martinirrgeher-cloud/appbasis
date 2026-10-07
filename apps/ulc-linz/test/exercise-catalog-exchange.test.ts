import { describe, expect, it } from "vitest";

import {
  ULC_EXERCISE_CATALOG_EXCHANGE_VERSION,
  buildUlcExerciseCatalogExchangeSheets,
  createUlcExerciseCatalogWorkbook,
} from "../worker/exercise-catalog-exchange";

const catalog = {
  items: [
    {
      id: "exercise-1",
      organizationId: "verein-1",
      name: "Fliegende 30",
      categoryKey: "max_velocity" as const,
      subcategory: "Fliegend",
      difficultyKey: "medium",
      goal: "Maximalgeschwindigkeit",
      description: "Sauber beschleunigen und locker bleiben.",
      coachingCues: "Schultern locker.",
      commonMistakes: "Verkrampfen.",
      equipment: ["Hütchen", "Markierungen"],
      videoUrl: "https://example.test/video",
      videoUrls: ["https://example.test/video", "https://example.test/video-2"],
      groupIds: ["group-1"],
      similarExerciseIds: ["exercise-2"],
      parameters: [
        {
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
        },
      ],
      isActive: true,
      isFavorite: true,
    },
  ],
  trainingGroups: [
    {
      id: "group-1",
      name: "Sprint",
      shortName: "SP",
      sortOrder: 10,
    },
  ],
};

describe("ULC E6F1 exercise catalog exchange", () => {
  it("exports a stable workbook contract without organization or personal favorite scope", () => {
    const sheets = buildUlcExerciseCatalogExchangeSheets(catalog, "export");
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Übungen",
      "Gruppen",
      "Parameter",
      "Erweiterungen",
      "Listen",
      "Hinweise",
    ]);

    const exercises = sheets[0]!.rows;
    expect(exercises[0]).toEqual([
      "Datensatz-Schlüssel",
      "ID",
      "Name",
      "Kategorie-Key",
      "Kategorie",
      "Unterkategorie",
      "Trainingsziel",
      "Beschreibung / Ausführung",
      "Trainerhinweise",
      "Typische Fehler",
      "Material",
      "Video- / Weblink",
      "Aktiv",
    ]);
    expect(exercises[1]!.slice(0, 5)).toEqual([
      "row-0001",
      "exercise-1",
      "Fliegende 30",
      "max_velocity",
      "Maximalgeschwindigkeit",
    ]);

    const serialized = JSON.stringify(sheets);
    expect(serialized).toContain("group-1");
    expect(serialized).toContain("distance_m");
    expect(serialized).toContain("exercise-2");
    expect(serialized).toContain("https://example.test/video-2");
    expect(serialized).toContain(ULC_EXERCISE_CATALOG_EXCHANGE_VERSION);
    expect(serialized).not.toContain("organizationId");
    expect(serialized).not.toContain("isFavorite");
  });

  it("builds an import template with example data and current authorized lists", () => {
    const sheets = buildUlcExerciseCatalogExchangeSheets(catalog, "template");
    const exercises = sheets.find((sheet) => sheet.name === "Übungen")!;
    const groups = sheets.find((sheet) => sheet.name === "Gruppen")!;
    const parameters = sheets.find((sheet) => sheet.name === "Parameter")!;
    const extensions = sheets.find((sheet) => sheet.name === "Erweiterungen")!;
    const lists = sheets.find((sheet) => sheet.name === "Listen")!;

    expect(exercises.rows[1]).toContain("Fliegende 30 m");
    expect(groups.rows[1]).toEqual([
      "beispiel-1",
      "",
      "Fliegende 30 m",
      "group-1",
      "Sprint",
    ]);
    expect(parameters.rows[1]).toContain("distance_m");
    expect(extensions.rows[1]).toEqual([
      "beispiel-1",
      "medium",
      "",
      "",
    ]);
    expect(JSON.stringify(lists.rows)).toContain("max_velocity");
    expect(JSON.stringify(lists.rows)).toContain("Schwierigkeit");
    expect(JSON.stringify(lists.rows)).toContain("Sprint");
  });

  it("emits a real XLSX ZIP container with workbook and worksheet XML", () => {
    const bytes = createUlcExerciseCatalogWorkbook(catalog, "export");
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("Fliegende 30");
    expect(text).toContain("Übungen");
  });
});
