import { describe, expect, it } from "vitest";

import {
  ATHLETES_EXCHANGE_VERSION,
  buildAthletesExchangeSheets,
  createAthletesWorkbook,
} from "../src/index";

const snapshot = {
  trainingGroups: [
    {
      id: "group-1",
      organizationId: "verein-1",
      name: "Sprint",
      shortName: "SP",
      description: null,
      isActive: true,
      sortOrder: 10,
    },
    {
      id: "group-2",
      organizationId: "verein-1",
      name: "Archivgruppe",
      shortName: null,
      description: null,
      isActive: false,
      sortOrder: 20,
    },
  ],
  athletes: [
    {
      id: "athlete-1",
      organizationId: "verein-1",
      firstName: "Anna",
      lastName: "Muster",
      birthYear: 2012,
      notes: "Sprint",
      isActive: true,
    },
    {
      id: "athlete-2",
      organizationId: "verein-1",
      firstName: "Berta",
      lastName: "Alt",
      birthYear: null,
      notes: null,
      isActive: false,
    },
  ],
  trainers: [],
  athleteGroupMemberships: [
    {
      organizationId: "verein-1",
      athleteId: "athlete-1",
      groupId: "group-1",
      startedOn: "2025-01-01",
      endedOn: null,
    },
    {
      organizationId: "verein-1",
      athleteId: "athlete-2",
      groupId: "group-2",
      startedOn: "2024-01-01",
      endedOn: "2025-06-30",
    },
  ],
  trainerGroupMemberships: [],
};

describe("athletes exchange", () => {
  it("exports athletes and memberships without organization or user scope", () => {
    const sheets = buildAthletesExchangeSheets(snapshot, "export");

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Athleten",
      "Gruppen",
      "Listen",
      "Hinweise",
    ]);
    expect(sheets[0]!.rows[0]).toEqual([
      "Datensatz-Schlüssel",
      "ID",
      "Vorname",
      "Nachname",
      "Geburtsjahr",
      "Notizen",
      "Aktiv",
    ]);
    expect(sheets[0]!.rows[1]).toEqual([
      "row-0001",
      "athlete-1",
      "Anna",
      "Muster",
      "2012",
      "Sprint",
      "ja",
    ]);
    expect(sheets[0]!.rows[2]).toEqual([
      "row-0002",
      "athlete-2",
      "Berta",
      "Alt",
      "",
      "",
      "nein",
    ]);
    expect(sheets[1]!.rows).toEqual([
      [
        "Datensatz-Schlüssel",
        "Athleten-ID",
        "Athlet",
        "Gruppen-ID",
        "Trainingsgruppe",
        "Beginn",
        "Ende",
      ],
      [
        "row-0001",
        "athlete-1",
        "Muster, Anna",
        "group-1",
        "Sprint",
        "2025-01-01",
        "",
      ],
      [
        "row-0002",
        "athlete-2",
        "Alt, Berta",
        "group-2",
        "Archivgruppe",
        "2024-01-01",
        "2025-06-30",
      ],
    ]);

    const serialized = JSON.stringify(sheets);
    expect(serialized).toContain(ATHLETES_EXCHANGE_VERSION);
    expect(serialized).not.toContain("organizationId");
    expect(serialized).not.toContain("actor");
    expect(serialized).not.toContain("trainer");
    expect(serialized).not.toContain("identity");
  });

  it("creates a template with one example athlete and only an active group assignment", () => {
    const sheets = buildAthletesExchangeSheets(snapshot, "template");
    const athletes = sheets.find((sheet) => sheet.name === "Athleten")!;
    const groups = sheets.find((sheet) => sheet.name === "Gruppen")!;
    const lists = sheets.find((sheet) => sheet.name === "Listen")!;

    expect(athletes.rows[1]).toEqual([
      "beispiel-1",
      "",
      "Max",
      "Mustermann",
      "2012",
      "Beispieldatensatz – vor echtem Import ersetzen oder löschen.",
      "ja",
    ]);
    expect(groups.rows[1]).toEqual([
      "beispiel-1",
      "",
      "Mustermann, Max",
      "group-1",
      "Sprint",
      "2026-01-01",
      "",
    ]);
    expect(JSON.stringify(lists.rows)).toContain("Sprint");
    expect(JSON.stringify(lists.rows)).toContain("Archivgruppe");
    expect(JSON.stringify(lists.rows)).toContain("inaktiv");
  });

  it("documents the live E6F4B preview/apply workflow without stale E6F4A guidance", () => {
    const template = buildAthletesExchangeSheets(snapshot, "template");
    const exported = buildAthletesExchangeSheets(snapshot, "export");
    const templateNotes = JSON.stringify(
      template.find((sheet) => sheet.name === "Hinweise")!.rows,
    );
    const exportNotes = JSON.stringify(
      exported.find((sheet) => sheet.name === "Hinweise")!.rows,
    );

    expect(templateNotes).toContain("E6F4B");
    expect(templateNotes).toContain("Import prüfen");
    expect(templateNotes).toContain("ausdrücklich anwenden");
    expect(templateNotes).toContain("primäre Match-Key");
    expect(templateNotes).toContain("Aktiv-/Archivstatus nicht");
    expect(templateNotes).not.toContain("E6F4A");
    expect(templateNotes).not.toContain("Vorschau und Apply folgen separat");
    expect(templateNotes).not.toContain("schreibt noch keine Daten");

    expect(exportNotes).toContain("E6F4B");
    expect(exportNotes).toContain("Importvorschau und Apply");
    expect(exportNotes).not.toContain("E6F4A");
  });

  it("replaces XML 1.0-forbidden control characters before workbook serialization", () => {
    const unsafeSnapshot = {
      ...snapshot,
      trainingGroups: [
        {
          ...snapshot.trainingGroups[0]!,
          name: "Spr\u0008int",
        },
      ],
      athletes: [
        {
          ...snapshot.athletes[0]!,
          firstName: "An\u0001na",
          notes: "Zeile 1\nZeile 2\u0000Ende",
        },
      ],
      athleteGroupMemberships: [
        {
          ...snapshot.athleteGroupMemberships[0]!,
        },
      ],
    };

    const bytes = createAthletesWorkbook(unsafeSnapshot, "export");
    const text = new TextDecoder().decode(bytes);

    expect(text).not.toContain("An\u0001na");
    expect(text).not.toContain("Spr\u0008int");
    expect(text).not.toContain("Zeile 2\u0000Ende");
    expect(text).toContain("An�na");
    expect(text).toContain("Spr�int");
    expect(text).toContain("Zeile 1\nZeile 2�Ende");
  });

  it("emits a real XLSX ZIP container", () => {
    const bytes = createAthletesWorkbook(snapshot, "export");
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("[Content_Types].xml");
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain("Athleten");
    expect(text).toContain("Muster");
  });
});
