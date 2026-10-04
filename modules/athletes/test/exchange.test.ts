import { describe, expect, it } from "vitest";

import {
  ATHLETES_EXCHANGE_ACTIVE_HEADER,
  ATHLETES_EXCHANGE_CONTRACT_HEADER,
  ATHLETES_EXCHANGE_GROUP_LIST_HEADER,
  ATHLETES_EXCHANGE_ID_HEADER,
  ATHLETES_EXCHANGE_VERSION,
  ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS,
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
      name: "Sprung",
      shortName: "SJ",
      description: null,
      isActive: true,
      sortOrder: 20,
    },
    {
      id: "group-3",
      organizationId: "verein-1",
      name: "Archivgruppe",
      shortName: null,
      description: null,
      isActive: false,
      sortOrder: 30,
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
      athleteId: "athlete-1",
      groupId: "group-2",
      startedOn: "2026-01-01",
      endedOn: null,
    },
    {
      organizationId: "verein-1",
      athleteId: "athlete-2",
      groupId: "group-3",
      startedOn: "2024-01-01",
      endedOn: "2025-06-30",
    },
  ],
  trainerGroupMemberships: [],
};

describe("athletes exchange", () => {
  it("uses exactly one user-facing worksheet without visible technical IDs", () => {
    const sheets = buildAthletesExchangeSheets(snapshot, "export");

    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe("Athleten");

    const header = sheets[0]!.rows[0]!;
    expect(header.slice(0, 4)).toEqual(ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS);
    expect(header).toEqual(
      expect.arrayContaining([
        "Trainingsgruppe 1",
        "Trainingsgruppe 2",
        "Trainingsgruppe 3",
        ATHLETES_EXCHANGE_ID_HEADER,
        ATHLETES_EXCHANGE_ACTIVE_HEADER,
        ATHLETES_EXCHANGE_CONTRACT_HEADER,
        ATHLETES_EXCHANGE_GROUP_LIST_HEADER,
      ]),
    );

    const visibleHeader = header.slice(
      0,
      header.indexOf(ATHLETES_EXCHANGE_ID_HEADER),
    );
    expect(visibleHeader).not.toContain("ID");
    expect(visibleHeader).not.toContain("Datensatz-Schlüssel");
    expect(visibleHeader).not.toContain("Gruppen-ID");
  });

  it("places current group memberships on the same athlete row", () => {
    const rows = buildAthletesExchangeSheets(snapshot, "export")[0]!.rows;
    const header = rows[0]!;
    const idIndex = header.indexOf(ATHLETES_EXCHANGE_ID_HEADER);
    const anna = rows.find((row) => row[idIndex] === "athlete-1");

    expect(anna).toBeDefined();
    expect(anna?.slice(0, 4)).toEqual([
      "Anna",
      "Muster",
      "2012",
      "Sprint",
    ]);
    expect(anna).toEqual(expect.arrayContaining(["Sprint", "Sprung"]));
  });

  it("creates a simple example row with a group dropdown source", () => {
    const rows = buildAthletesExchangeSheets(snapshot, "template")[0]!.rows;
    const header = rows[0]!;
    const contractIndex = header.indexOf(ATHLETES_EXCHANGE_CONTRACT_HEADER);
    const groupListIndex = header.indexOf(ATHLETES_EXCHANGE_GROUP_LIST_HEADER);

    expect(rows[1]?.slice(0, 4)).toEqual([
      "Max",
      "Mustermann",
      "2012",
      "Beispieldatensatz – vor echtem Import ersetzen oder löschen.",
    ]);
    expect(rows[1]?.[4]).toBe("Sprint");
    expect(rows[1]?.[contractIndex]).toBe(ATHLETES_EXCHANGE_VERSION);
    expect(rows.slice(1).map((row) => row[groupListIndex])).toEqual(
      expect.arrayContaining(["Sprint", "Sprung"]),
    );
    expect(rows.slice(1).map((row) => row[groupListIndex])).not.toContain(
      "Archivgruppe",
    );
  });

  it("emits one XLSX worksheet with hidden technical columns and group validation", () => {
    const bytes = createAthletesWorkbook(snapshot, "template");
    const text = new TextDecoder().decode(bytes);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).not.toContain("xl/worksheets/sheet2.xml");
    expect(text).toContain('sheet name="Athleten"');
    expect(text).toContain('hidden="1"');
    expect(text).toContain("<dataValidations");
    expect(text).toContain('type="list"');
    expect(text).toContain("Trainingsgruppe 1");
    expect(text).toContain(ATHLETES_EXCHANGE_VERSION);
  });

  it("replaces XML 1.0-forbidden control characters before serialization", () => {
    const unsafe = {
      ...snapshot,
      athletes: [
        {
          ...snapshot.athletes[0]!,
          firstName: "An\u0001na",
          notes: "Zeile 1\nZeile 2\u0000Ende",
        },
      ],
      athleteGroupMemberships: [],
    };

    const text = new TextDecoder().decode(
      createAthletesWorkbook(unsafe, "export"),
    );

    expect(text).not.toContain("An\u0001na");
    expect(text).not.toContain("Zeile 2\u0000Ende");
    expect(text).toContain("An�na");
    expect(text).toContain("Zeile 1\nZeile 2�Ende");
  });
});
