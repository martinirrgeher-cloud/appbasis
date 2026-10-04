import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  ATHLETES_EXCHANGE_ID_HEADER,
  ATHLETES_IMPORT_MAX_FILE_BYTES,
  applyAthletesImportPreview,
  buildAthletesExchangeSheets,
  createAthletesImportPreviewToken,
  createAthletesWorkbook,
  previewAthletesImport,
} from "../src/index";

const groups = [
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
];

const anna = {
  id: "athlete-1",
  organizationId: "verein-1",
  firstName: "Anna",
  lastName: "Muster",
  birthYear: 2012,
  notes: null,
  isActive: true,
};

const baseSnapshot = {
  trainingGroups: groups,
  athletes: [anna],
  trainers: [],
  athleteGroupMemberships: [
    {
      organizationId: "verein-1",
      athleteId: "athlete-1",
      groupId: "group-1",
      startedOn: "2025-01-01",
      endedOn: null,
    },
  ],
  trainerGroupMemberships: [],
};

describe("athletes XLSX import", () => {
  it("previews the one-sheet template as a create with a selected group", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.summary).toMatchObject({
      rows: 1,
      create: 1,
      update: 0,
      errors: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      action: "create",
      reason: "new",
      sourceId: null,
      draft: {
        firstName: "Max",
        lastName: "Mustermann",
        birthYear: 2012,
      },
    });
    expect(preview.rows[0]?.draft.memberships).toEqual([
      expect.objectContaining({
        groupId: "group-1",
        groupName: "Sprint",
        action: "create",
      }),
    ]);
  });

  it("keeps an unchanged export as skip", async () => {
    const workbook = createAthletesWorkbook(baseSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary).toMatchObject({
      rows: 1,
      create: 0,
      update: 0,
      skip: 1,
      errors: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "unchanged",
      matchedAthleteId: "athlete-1",
    });
  });

  it("detects scalar updates through the hidden athlete ID", async () => {
    const changed = {
      ...baseSnapshot,
      athletes: [{ ...anna, notes: "Neue Notiz" }],
    };
    const workbook = createAthletesWorkbook(changed, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.update).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      action: "update",
      matchedAthleteId: "athlete-1",
      draft: {
        notes: "Neue Notiz",
        scalarChanged: true,
      },
    });
  });

  it("matches a row without hidden ID by name and birth year", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          id: "athlete-max",
          firstName: "Max",
          lastName: "Mustermann",
        },
      ],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(current, "export");
    const workbook = clearAthleteId(stored, current, 2);
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]).toMatchObject({
      matchedAthleteId: "athlete-max",
      action: "skip",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MATCHED_BY_PERSON_KEY" }),
      ]),
    );
  });

  it("blocks a blank-ID create when a same-name athlete has no birth year", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          id: "athlete-unknown-year",
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: null,
        },
      ],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "invalid",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "POTENTIAL_DUPLICATE_REQUIRES_ID",
        }),
      ]),
    );
  });

  it("blocks duplicate blank-ID people inside one workbook", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(current, "template");
    const workbook = duplicateAthleteRow(stored, 2, 10);
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.rows).toHaveLength(2);
    expect(preview.summary.errors).toBeGreaterThanOrEqual(2);
    for (const row of preview.rows) {
      expect(row).toMatchObject({ action: "skip", reason: "invalid" });
      expect(row.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
        ]),
      );
    }
  });

  it("blocks an ID-based rename colliding with a blank-ID row", async () => {
    const workbookSnapshot = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: 2012,
        },
        {
          ...anna,
          id: "athlete-placeholder",
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: 2012,
        },
      ],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(workbookSnapshot, "export");
    const workbook = clearAthleteId(stored, workbookSnapshot, 3);
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.rows).toHaveLength(2);
    expect(preview.summary.errors).toBeGreaterThanOrEqual(2);
    for (const row of preview.rows) {
      expect(row.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
        ]),
      );
    }
  });

  it("allows distinct existing athletes with the same name and birth year", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          id: "athlete-twin-1",
          firstName: "Max",
          lastName: "Mustermann",
        },
        {
          ...anna,
          id: "athlete-twin-2",
          firstName: "Max",
          lastName: "Mustermann",
        },
      ],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "export");
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.summary.errors).toBe(0);
    expect(preview.summary.skip).toBe(2);
  });

  it("adds only new group selections and never removes existing groups", async () => {
    const changed = {
      ...baseSnapshot,
      athleteGroupMemberships: [
        ...baseSnapshot.athleteGroupMemberships,
        {
          organizationId: "verein-1",
          athleteId: "athlete-1",
          groupId: "group-2",
          startedOn: "2026-09-01",
          endedOn: null,
        },
      ],
    };
    const workbook = createAthletesWorkbook(changed, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.update).toBe(1);
    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]?.draft.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: "group-1", action: "skip" }),
        expect.objectContaining({ groupId: "group-2", action: "create" }),
      ]),
    );
  });

  it("warns and ignores removal of an existing group", async () => {
    const stored = createAthletesWorkbook(baseSnapshot, "export");
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet1.xml",
      (xml) => replaceInlineCell(xml, "E2", ""),
    );
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.errors).toBe(0);
    expect(preview.summary.warnings).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "unchanged",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GROUP_REMOVAL_IGNORED" }),
      ]),
    );
  });

  it("fails closed when a visible group name is ambiguous", async () => {
    const snapshot = {
      trainingGroups: [
        {
          ...groups[0]!,
          id: "group-a",
          name: "U12",
          shortName: null,
        },
        {
          ...groups[1]!,
          id: "group-b",
          name: "U12",
          shortName: null,
        },
      ],
      athletes: [],
      trainers: [],
      athleteGroupMemberships: [],
      trainerGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(snapshot, "template");
    const preview = await previewAthletesImport(workbook, snapshot);

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AMBIGUOUS_GROUP_NAME" }),
      ]),
    );
  });

  it("accepts deflate-compressed XLSX containers like files saved by Excel", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(
      deflateStoredZip(stored),
      current,
    );

    expect(preview.summary).toMatchObject({
      rows: 1,
      create: 1,
      errors: 0,
    });
  });

  it("enforces the 5 MB input limit before XLSX parsing", async () => {
    const oversized = new Uint8Array(ATHLETES_IMPORT_MAX_FILE_BYTES + 1);
    await expect(
      previewAthletesImport(oversized, {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      }),
    ).rejects.toMatchObject({ code: "IMPORT_FILE_TOO_LARGE" });
  });

  it("enforces the 1,000-athlete row limit", async () => {
    const athletes = Array.from({ length: 1_001 }, (_, index) => ({
      id: "athlete-" + String(index + 1),
      organizationId: "verein-1",
      firstName: "Vorname" + String(index + 1),
      lastName: "Nachname" + String(index + 1),
      birthYear: 2000,
      notes: null,
      isActive: true,
    }));
    const workbook = createAthletesWorkbook(
      {
        trainingGroups: [],
        athletes,
        trainers: [],
        athleteGroupMemberships: [],
        trainerGroupMemberships: [],
      },
      "export",
    );

    await expect(
      previewAthletesImport(workbook, {
        trainingGroups: [],
        athletes: [],
        trainers: [],
        athleteGroupMemberships: [],
        trainerGroupMemberships: [],
      }),
    ).rejects.toMatchObject({ code: "IMPORT_ROW_LIMIT_EXCEEDED" });
  });

  it("binds the preview token to file, organization and current state", async () => {
    const workbook = createAthletesWorkbook(baseSnapshot, "export");
    const token = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-1",
    );
    const changed = await createAthletesImportPreviewToken(
      workbook,
      {
        ...baseSnapshot,
        athletes: [{ ...anna, notes: "Drift" }],
      },
      "verein-1",
    );
    const otherOrg = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-2",
    );

    expect(token).toMatch(/^e6f4b-v1\.[0-9a-f]{64}$/);
    expect(changed).not.toBe(token);
    expect(otherOrg).not.toBe(token);
  });

  it("applies new athletes and group memberships with the apply date", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(workbook, current);
    const token = await createAthletesImportPreviewToken(
      workbook,
      current,
      "verein-1",
    );
    const calls: unknown[] = [];

    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      service: {
        async createAthlete(organizationId, input) {
          calls.push({ type: "athlete", organizationId, input });
          return {
            id: "athlete-created",
            organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            birthYear: input.birthYear ?? null,
            notes: input.notes ?? null,
            isActive: true,
          };
        },
        async updateAthleteIfUnchanged() {
          throw new Error("unexpected update");
        },
        async createAthleteGroupMembership(organizationId, input) {
          calls.push({ type: "membership", organizationId, input });
          return { organizationId, ...input, endedOn: input.endedOn ?? null };
        },
      },
      now: () => new Date("2026-10-04T10:15:00.000Z"),
    });

    expect(result.summary).toMatchObject({ created: 1, failed: 0 });
    expect(calls).toEqual([
      expect.objectContaining({ type: "athlete" }),
      expect.objectContaining({
        type: "membership",
        input: expect.objectContaining({
          groupId: "group-1",
          startedOn: "2026-10-04",
          endedOn: null,
        }),
      }),
    ]);
  });

  it("refuses a stale preview before the first write", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(workbook, current);
    const token = await createAthletesImportPreviewToken(
      workbook,
      current,
      "verein-1",
    );
    let mutations = 0;

    await expect(
      applyAthletesImportPreview({
        preview,
        expectedPreviewToken: token,
        actualPreviewToken: "e6f4b-v1." + "0".repeat(64),
        organizationId: "verein-1",
        service: {
          async createAthlete() {
            mutations += 1;
            throw new Error("unexpected");
          },
          async updateAthleteIfUnchanged() {
            mutations += 1;
            throw new Error("unexpected");
          },
          async createAthleteGroupMembership() {
            mutations += 1;
            throw new Error("unexpected");
          },
        },
      }),
    ).rejects.toMatchObject({ code: "STALE_IMPORT_PREVIEW" });

    expect(mutations).toBe(0);
  });

  it("fails only the row when an existing athlete changed concurrently", async () => {
    const changed = {
      ...baseSnapshot,
      athletes: [{ ...anna, notes: "Neue Notiz" }],
    };
    const workbook = createAthletesWorkbook(changed, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-1",
    );

    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      service: {
        async createAthlete() {
          throw new Error("unexpected create");
        },
        async updateAthleteIfUnchanged() {
          return null;
        },
        async createAthleteGroupMembership() {
          throw new Error("unexpected membership");
        },
      },
      now: () => new Date("2026-10-04T10:15:00.000Z"),
    });

    expect(result.summary.failed).toBe(1);
    expect(result.rows[0]).toMatchObject({
      outcome: "failed",
      code: "STALE_IMPORT_ROW",
    });
  });

  it("keeps CSV logs safe from spreadsheet formula injection", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(current, "template");
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet1.xml",
      (xml) =>
        replaceInlineCell(xml, "B2", "=2+2"),
    );
    const preview = await previewAthletesImport(workbook, current);
    const token = await createAthletesImportPreviewToken(
      workbook,
      current,
      "verein-1",
    );

    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      service: {
        async createAthlete(organizationId, input) {
          return {
            id: "athlete-created",
            organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            birthYear: input.birthYear ?? null,
            notes: input.notes ?? null,
            isActive: true,
          };
        },
        async updateAthleteIfUnchanged() {
          throw new Error("unexpected update");
        },
        async createAthleteGroupMembership(organizationId, input) {
          return { organizationId, ...input, endedOn: input.endedOn ?? null };
        },
      },
      now: () => new Date("2026-10-04T10:15:00.000Z"),
    });

    expect(result.logCsv).toContain("'=2+2");
  });
});

function clearAthleteId(
  bytes: Uint8Array,
  snapshot: typeof baseSnapshot,
  rowNumber: number,
): Uint8Array {
  const header = buildAthletesExchangeSheets(snapshot, "export")[0]!.rows[0]!;
  const idIndex = header.indexOf(ATHLETES_EXCHANGE_ID_HEADER);
  const reference = columnName(idIndex) + String(rowNumber);
  return rewriteStoredWorkbookEntry(
    bytes,
    "xl/worksheets/sheet1.xml",
    (xml) => replaceInlineCell(xml, reference, ""),
  );
}

function duplicateAthleteRow(
  bytes: Uint8Array,
  sourceRow: number,
  targetRow: number,
): Uint8Array {
  return rewriteStoredWorkbookEntry(
    bytes,
    "xl/worksheets/sheet1.xml",
    (xml) => {
      const match = new RegExp(
        '(<row r="' + String(sourceRow) + '"[\\s\\S]*?<\\/row>)',
      ).exec(xml);
      expect(match).not.toBeNull();
      const source = match![1]!;
      const duplicate = source
        .replace(
          'row r="' + String(sourceRow) + '"',
          'row r="' + String(targetRow) + '"',
        )
        .replace(
          new RegExp('r="([A-Z]+)' + String(sourceRow) + '"', "g"),
          'r="$1' + String(targetRow) + '"',
        );
      return xml.replace("</sheetData>", duplicate + "</sheetData>");
    },
  );
}

function replaceInlineCell(
  xml: string,
  reference: string,
  value: string,
): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
  return xml.replace(
    new RegExp(
      '<c r="' + reference + '"[^>]*>[\\s\\S]*?<\\/c>',
    ),
    '<c r="' +
      reference +
      '" t="inlineStr"><is><t xml:space="preserve">' +
      escaped +
      "</t></is></c>",
  );
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function rewriteStoredWorkbookEntry(
  bytes: Uint8Array,
  targetName: string,
  transform: (xml: string) => string,
): Uint8Array {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const entries: Array<{ name: Uint8Array; data: Uint8Array }> = [];
  let offset = 0;

  while (
    offset + 4 <= bytes.byteLength &&
    readTestUint32(bytes, offset) === 0x04034b50
  ) {
    const method = readTestUint16(bytes, offset + 8);
    const compressedSize = readTestUint32(bytes, offset + 18);
    const nameLength = readTestUint16(bytes, offset + 26);
    const extraLength = readTestUint16(bytes, offset + 28);
    expect(method).toBe(0);

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = bytes.slice(nameStart, nameStart + nameLength);
    const decodedName = decoder.decode(name);
    const sourceData = bytes.slice(dataStart, dataEnd);
    entries.push({
      name,
      data:
        decodedName === targetName
          ? encoder.encode(transform(decoder.decode(sourceData)))
          : sourceData,
    });
    offset = dataEnd;
  }

  return buildStoredZip(entries);
}

function deflateStoredZip(bytes: Uint8Array): Uint8Array {
  const entries: Array<{ name: Uint8Array; crc: number; data: Uint8Array }> = [];
  let offset = 0;
  while (
    offset + 4 <= bytes.byteLength &&
    readTestUint32(bytes, offset) === 0x04034b50
  ) {
    const method = readTestUint16(bytes, offset + 8);
    const crc = readTestUint32(bytes, offset + 14);
    const compressedSize = readTestUint32(bytes, offset + 18);
    const nameLength = readTestUint16(bytes, offset + 26);
    const extraLength = readTestUint16(bytes, offset + 28);
    expect(method).toBe(0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    entries.push({
      name: bytes.slice(nameStart, nameStart + nameLength),
      crc,
      data: bytes.slice(dataStart, dataEnd),
    });
    offset = dataEnd;
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const compressedBuffer = deflateRawSync(entry.data);
    const compressed = new Uint8Array(
      compressedBuffer.buffer,
      compressedBuffer.byteOffset,
      compressedBuffer.byteLength,
    );
    const localHeader = new Uint8Array(30 + entry.name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(14, entry.crc, true);
    localView.setUint32(18, compressed.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, entry.name.length, true);
    localHeader.set(entry.name, 30);
    localParts.push(localHeader, compressed);

    const centralHeader = new Uint8Array(46 + entry.name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(16, entry.crc, true);
    centralView.setUint32(20, compressed.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, entry.name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(entry.name, 46);
    centralParts.push(centralHeader);
    centralSize += centralHeader.byteLength;
    localOffset += localHeader.byteLength + compressed.byteLength;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  return concat([...localParts, ...centralParts, end]);
}

function buildStoredZip(
  entries: readonly { name: Uint8Array; data: Uint8Array }[],
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const crc = testCrc32(entry.data);
    const localHeader = new Uint8Array(30 + entry.name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, entry.name.length, true);
    localHeader.set(entry.name, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + entry.name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, entry.name.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(entry.name, 46);
    centralParts.push(centralHeader);
    centralSize += centralHeader.byteLength;
    localOffset += localHeader.byteLength + entry.data.byteLength;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  return concat([...localParts, ...centralParts, end]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function readTestUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    2,
  ).getUint16(0, true);
}

function readTestUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    4,
  ).getUint32(0, true);
}

const TEST_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) === 1
          ? (value >>> 1) ^ 0xedb88320
          : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function testCrc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value =
      (value >>> 8) ^ TEST_CRC32_TABLE[(value ^ byte) & 0xff]!;
  }
  return (value ^ 0xffffffff) >>> 0;
}
