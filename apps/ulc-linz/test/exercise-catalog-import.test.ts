import { deflateRawSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  createUlcExerciseCatalogWorkbook,
} from "../worker/exercise-catalog-exchange";
import {
  ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES,
  UlcExerciseCatalogImportFileError,
  previewUlcExerciseCatalogImport,
} from "../worker/exercise-catalog-import";

const group = Object.freeze({
  id: "group-1",
  name: "Sprint",
  shortName: "SP",
  sortOrder: 10,
});

const existingTemplateItem = Object.freeze({
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

describe("ULC E6F2 exercise catalog import preview", () => {
  it("previews the E6F1 template as a create without mutating data", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );

    const preview = await previewUlcExerciseCatalogImport(
      workbook,
      { items: [], trainingGroups: [group] },
    );

    expect(preview.applyAvailable).toBe(false);
    expect(preview.summary).toEqual({
      rows: 1,
      create: 1,
      update: 0,
      skip: 0,
      errors: 0,
      warnings: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      recordKey: "beispiel-1",
      sourceId: null,
      matchedExerciseId: null,
      action: "create",
      reason: "new",
      draft: {
        name: "Fliegende 30 m",
        categoryKey: "max_velocity",
        groupIds: ["group-1"],
        isActive: true,
      },
    });
    expect(preview.rows[0]?.draft.parameters).toHaveLength(1);
    expect(preview.rows[0]?.draft.parameters[0]).toMatchObject({
      key: "distance_m",
      defaultValue: "30",
    });
  });

  it("recognizes an existing exercise by normalized name and skips an unchanged row", async () => {
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );

    const preview = await previewUlcExerciseCatalogImport(
      workbook,
      { items: [existingTemplateItem], trainingGroups: [group] },
    );

    expect(preview.rows[0]).toMatchObject({
      matchedExerciseId: "exercise-1",
      action: "skip",
      reason: "unchanged",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          code: "MATCHED_BY_NAME",
        }),
      ]),
    );
  });

  it("recognizes an existing exercise by id and previews changed data as update", async () => {
    const source = {
      ...existingTemplateItem,
      goal: "Neue Zielbeschreibung",
      isFavorite: true,
    };
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [source], trainingGroups: [group] },
      "export",
    );

    const preview = await previewUlcExerciseCatalogImport(
      workbook,
      { items: [existingTemplateItem], trainingGroups: [group] },
    );

    expect(preview.summary.update).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      sourceId: "exercise-1",
      matchedExerciseId: "exercise-1",
      action: "update",
      reason: "changed",
      draft: {
        goal: "Neue Zielbeschreibung",
      },
    });
    expect(preview.rows[0]?.issues).toEqual([]);
  });

  it("fails closed when a relation contains a group outside the authorized resolver", async () => {
    const foreignGroup = {
      id: "group-foreign",
      name: "Fremd",
      shortName: null,
      sortOrder: 20,
    };
    const source = {
      ...existingTemplateItem,
      id: "exercise-foreign",
      name: "Neue Gruppenübung",
      groupIds: ["group-foreign"],
      parameters: [],
    };
    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [source], trainingGroups: [foreignGroup] },
      "export",
    );

    const preview = await previewUlcExerciseCatalogImport(
      workbook,
      { items: [], trainingGroups: [group] },
    );

    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "invalid",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          code: "UNKNOWN_GROUP",
        }),
        expect.objectContaining({
          level: "error",
          code: "UNKNOWN_EXERCISE_ID",
        }),
      ]),
    );
  });

  it("accepts deflate-compressed XLSX containers like normal Excel files", async () => {
    const stored = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups: [group] },
      "template",
    );
    const deflated = deflateStoredZip(stored);

    const preview = await previewUlcExerciseCatalogImport(
      deflated,
      { items: [], trainingGroups: [group] },
    );

    expect(preview.summary).toMatchObject({
      rows: 1,
      create: 1,
      errors: 0,
    });
  });

  it("enforces the 5 MB input limit before parsing", async () => {
    const oversized = new Uint8Array(
      ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES + 1,
    );

    await expect(
      previewUlcExerciseCatalogImport(
        oversized,
        { items: [], trainingGroups: [] },
      ),
    ).rejects.toMatchObject({
      name: "UlcExerciseCatalogImportFileError",
      code: "IMPORT_FILE_TOO_LARGE",
    });
  });

  it("rejects files that are not valid XLSX containers", async () => {
    await expect(
      previewUlcExerciseCatalogImport(
        new TextEncoder().encode("not an xlsx"),
        { items: [], trainingGroups: [] },
      ),
    ).rejects.toBeInstanceOf(UlcExerciseCatalogImportFileError);
  });

  it("enforces the historic 1,000 exercise-row limit", async () => {
    const items = Array.from({ length: 1_001 }, (_, index) => ({
      id: "exercise-" + String(index + 1),
      organizationId: "verein-1",
      name: "Übung " + String(index + 1).padStart(4, "0"),
      categoryKey: "other" as const,
      subcategory: null,
      difficultyKey: null,
      goal: null,
      description: null,
      coachingCues: null,
      commonMistakes: null,
      equipment: [],
      videoUrl: null,
      videoUrls: [],
      groupIds: [],
      similarExerciseIds: [],
      parameters: [],
      isActive: true,
      isFavorite: false,
    }));
    const workbook = createUlcExerciseCatalogWorkbook(
      { items, trainingGroups: [] },
      "export",
    );

    await expect(
      previewUlcExerciseCatalogImport(
        workbook,
        { items: [], trainingGroups: [] },
      ),
    ).rejects.toMatchObject({
      code: "IMPORT_ROW_LIMIT_EXCEEDED",
    });
  });
});

function deflateStoredZip(bytes: Uint8Array): Uint8Array {
  const entries: Array<{
    name: Uint8Array;
    crc: number;
    data: Uint8Array;
  }> = [];

  let offset = 0;
  while (offset + 4 <= bytes.byteLength && readUint32(bytes, offset) === 0x04034b50) {
    const method = readUint16(bytes, offset + 8);
    const crc = readUint32(bytes, offset + 14);
    const compressedSize = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
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

function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}
