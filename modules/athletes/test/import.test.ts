import { describe, expect, it } from "vitest";

import {
  ATHLETES_IMPORT_MAX_FILE_BYTES,
  applyAthletesImportPreview,
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
  it("previews the E6F4A template as a create", async () => {
    const workbook = createAthletesWorkbook(
      {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      },
      "template",
    );
    const preview = await previewAthletesImport(workbook, {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    });

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
        isActive: true,
      },
    });
    expect(preview.rows[0]?.draft.memberships).toEqual([
      expect.objectContaining({
        groupId: "group-1",
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

  it("detects scalar updates through the exported athlete ID", async () => {
    const changedSnapshot = {
      ...baseSnapshot,
      athletes: [{ ...anna, notes: "Neue Notiz" }],
    };
    const workbook = createAthletesWorkbook(changedSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.update).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      action: "update",
      reason: "changed",
      matchedAthleteId: "athlete-1",
      draft: {
        notes: "Neue Notiz",
        scalarChanged: true,
      },
    });
  });

  it("matches a blank-ID row only when name and birth year identify exactly one athlete", async () => {
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
    const workbook = createAthletesWorkbook(current, "template");
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.rows[0]).toMatchObject({
      matchedAthleteId: "athlete-max",
      action: "update",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MATCHED_BY_PERSON_KEY" }),
      ]),
    );
  });

  it("allows only additive membership history", async () => {
    const workbookSnapshot = {
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
    const workbook = createAthletesWorkbook(workbookSnapshot, "export");
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

  it("blocks changing an existing membership end date", async () => {
    const changedSnapshot = {
      ...baseSnapshot,
      athleteGroupMemberships: [
        {
          ...baseSnapshot.athleteGroupMemberships[0]!,
          endedOn: "2026-09-30",
        },
      ],
    };
    const workbook = createAthletesWorkbook(changedSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "invalid",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MEMBERSHIP_CHANGE_UNSUPPORTED" }),
      ]),
    );
  });

  it("blocks active/archive state changes", async () => {
    const archivedSnapshot = {
      ...baseSnapshot,
      athletes: [{ ...anna, isActive: false }],
    };
    const workbook = createAthletesWorkbook(archivedSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ACTIVE_STATUS_CHANGE_UNSUPPORTED" }),
      ]),
    );
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

  it("binds the preview token to file, organization and current athlete state", async () => {
    const workbook = createAthletesWorkbook(baseSnapshot, "export");
    const token = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-1",
    );
    const same = await createAthletesImportPreviewToken(
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
    expect(same).toBe(token);
    expect(changed).not.toBe(token);
    expect(otherOrg).not.toBe(token);
  });

  it("applies create and additive membership through the module mutation service", async () => {
    const emptySnapshot = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(emptySnapshot, "template");
    const preview = await previewAthletesImport(workbook, emptySnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      emptySnapshot,
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
          calls.push({ type: "create-athlete", organizationId, input });
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
        async updateAthlete() {
          throw new Error("unexpected update");
        },
        async createAthleteGroupMembership(organizationId, input) {
          calls.push({ type: "create-membership", organizationId, input });
          return { organizationId, ...input, endedOn: input.endedOn ?? null };
        },
      },
      now: () => new Date("2026-10-03T10:00:00.000Z"),
    });

    expect(calls).toEqual([
      expect.objectContaining({
        type: "create-athlete",
        organizationId: "verein-1",
        input: expect.objectContaining({
          firstName: "Max",
          lastName: "Mustermann",
        }),
      }),
      expect.objectContaining({
        type: "create-membership",
        organizationId: "verein-1",
        input: expect.objectContaining({
          athleteId: "athlete-created",
          groupId: "group-1",
        }),
      }),
    ]);
    expect(result.summary).toEqual({
      rows: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    expect(result.logCsv).toContain("athlete-created");
  });

  it("rejects a stale preview before any mutation", async () => {
    const emptySnapshot = {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(emptySnapshot, "template");
    const preview = await previewAthletesImport(workbook, emptySnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      emptySnapshot,
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
          async updateAthlete() {
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
});
