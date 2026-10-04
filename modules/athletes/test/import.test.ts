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
      matchedAthleteId: null,
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "POTENTIAL_DUPLICATE_REQUIRES_ID",
        }),
      ]),
    );
  });

  it("blocks mixed-year duplicate blank-ID rows with the same name", async () => {
    const stored = createAthletesWorkbook(
      {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      },
      "template",
    );
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet1.xml",
      (xml) => {
        const match = /(<row r="2"[\s\S]*?<\/row>)/.exec(xml);
        expect(match).not.toBeNull();
        const duplicate = match![1]!
          .replaceAll('r="2"', 'r="3"')
          .replaceAll("beispiel-1", "beispiel-2")
          .replace(
            '<t xml:space="preserve">2012</t>',
            '<t xml:space="preserve"></t>',
          );
        return xml.replace("</sheetData>", duplicate + "</sheetData>");
      },
    );

    const preview = await previewAthletesImport(workbook, {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    });

    expect(preview.summary.errors).toBeGreaterThanOrEqual(2);
    expect(preview.rows).toHaveLength(2);
    for (const row of preview.rows) {
      expect(row).toMatchObject({ action: "skip", reason: "invalid" });
      expect(row.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
        ]),
      );
    }
  });

  it("blocks a blank-ID create that collides with an ID-based rename", async () => {
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
          id: "athlete-new-placeholder",
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: 2012,
        },
      ],
      athleteGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(workbookSnapshot, "export");
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet1.xml",
      (xml) =>
        xml.replace(
          '<t xml:space="preserve">athlete-new-placeholder</t>',
          '<t xml:space="preserve"></t>',
        ),
    );

    const preview = await previewAthletesImport(workbook, baseSnapshot);

    expect(preview.summary.errors).toBeGreaterThanOrEqual(2);
    expect(preview.rows).toHaveLength(2);
    for (const row of preview.rows) {
      expect(row).toMatchObject({ action: "skip", reason: "invalid" });
      expect(row.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
        ]),
      );
    }
  });

  it.each([
    ["ID row without birth year", null, 2012],
    ["blank-ID row without birth year", 2012, null],
  ])(
    "blocks an ID rename colliding with a blank-ID row when %s",
    async (_label, idBirthYear, blankBirthYear) => {
      const workbookSnapshot = {
        ...baseSnapshot,
        athletes: [
          {
            ...anna,
            firstName: "Max",
            lastName: "Mustermann",
            birthYear: idBirthYear,
          },
          {
            ...anna,
            id: "athlete-new-placeholder",
            firstName: "Max",
            lastName: "Mustermann",
            birthYear: blankBirthYear,
          },
        ],
        athleteGroupMemberships: [],
      };
      const stored = createAthletesWorkbook(workbookSnapshot, "export");
      const workbook = rewriteStoredWorkbookEntry(
        stored,
        "xl/worksheets/sheet1.xml",
        (xml) =>
          xml.replace(
            '<t xml:space="preserve">athlete-new-placeholder</t>',
            '<t xml:space="preserve"></t>',
          ),
      );

      const preview = await previewAthletesImport(workbook, baseSnapshot);

      expect(preview.summary.errors).toBeGreaterThanOrEqual(2);
      expect(preview.rows).toHaveLength(2);
      for (const row of preview.rows) {
        expect(row).toMatchObject({ action: "skip", reason: "invalid" });
        expect(row.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
          ]),
        );
      }
    },
  );

  it("allows distinct ID-based athletes with the same name and birth year", async () => {
    const current = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          id: "athlete-twin-1",
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: 2012,
        },
        {
          ...anna,
          id: "athlete-twin-2",
          firstName: "Max",
          lastName: "Mustermann",
          birthYear: 2012,
        },
      ],
      athleteGroupMemberships: [],
    };
    const workbook = createAthletesWorkbook(current, "export");
    const preview = await previewAthletesImport(workbook, current);

    expect(preview.summary.errors).toBe(0);
    expect(preview.summary.skip).toBe(2);
    expect(preview.rows).toHaveLength(2);
    for (const row of preview.rows) {
      expect(row).toMatchObject({ action: "skip", reason: "unchanged" });
      expect(row.issues).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "DUPLICATE_PERSON_IN_FILE" }),
        ]),
      );
    }
  });

  it("normalizes Excel numeric date serials in membership cells", async () => {
    const stored = createAthletesWorkbook(
      {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      },
      "template",
    );
    const withDateStyle = rewriteStoredWorkbookEntry(
      stored,
      "xl/styles.xml",
      addTestDateStyle,
    );
    const workbook = rewriteStoredWorkbookEntry(
      withDateStyle,
      "xl/worksheets/sheet2.xml",
      (xml) =>
        xml.replace(
          /<c r="F2"[^>]*>[\s\S]*?<\/c>/,
          '<c r="F2" s="2"><v>46023</v></c>',
        ),
    );

    const preview = await previewAthletesImport(workbook, {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    });

    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]?.draft.memberships[0]).toMatchObject({
      startedOn: "2026-01-01",
      action: "create",
    });
  });

  it("rejects an unformatted digit-only membership date instead of reinterpreting it as an Excel serial", async () => {
    const stored = createAthletesWorkbook(
      {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      },
      "template",
    );
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet2.xml",
      (xml) =>
        xml.replace(
          /<c r="F2"[^>]*>[\s\S]*?<\/c>/,
          '<c r="F2"><v>2024</v></c>',
        ),
    );

    const preview = await previewAthletesImport(workbook, {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    });

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MEMBERSHIP_VALIDATION_ERROR" }),
      ]),
    );
  });

  it("honors the workbook 1904 date system for date-formatted numeric cells", async () => {
    const stored = createAthletesWorkbook(
      {
        ...baseSnapshot,
        athletes: [],
        athleteGroupMemberships: [],
      },
      "template",
    );
    const withDateStyle = rewriteStoredWorkbookEntry(
      stored,
      "xl/styles.xml",
      addTestDateStyle,
    );
    const withDateSystem = rewriteStoredWorkbookEntry(
      withDateStyle,
      "xl/workbook.xml",
      (xml) => xml.replace("<sheets>", '<workbookPr date1904="1"/><sheets>'),
    );
    const workbook = rewriteStoredWorkbookEntry(
      withDateSystem,
      "xl/worksheets/sheet2.xml",
      (xml) =>
        xml.replace(
          /<c r="F2"[^>]*>[\s\S]*?<\/c>/,
          '<c r="F2" s="2"><v>44561</v></c>',
        ),
    );

    const preview = await previewAthletesImport(workbook, {
      ...baseSnapshot,
      athletes: [],
      athleteGroupMemberships: [],
    });

    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]?.draft.memberships[0]).toMatchObject({
      startedOn: "2026-01-01",
      action: "create",
    });
  });

  it("deduplicates a group's identical name and short-name during fallback matching", async () => {
    const snapshot = {
      trainingGroups: [
        {
          id: "group-u12",
          organizationId: "verein-1",
          name: "U12",
          shortName: "U12",
          description: null,
          isActive: true,
          sortOrder: 10,
        },
      ],
      athletes: [],
      trainers: [],
      athleteGroupMemberships: [],
      trainerGroupMemberships: [],
    };
    const stored = createAthletesWorkbook(snapshot, "template");
    const workbook = rewriteStoredWorkbookEntry(
      stored,
      "xl/worksheets/sheet2.xml",
      (xml) =>
        xml.replace(
          /<c r="D2"[^>]*>[\s\S]*?<\/c>/,
          '<c r="D2" t="inlineStr"><is><t></t></is></c>',
        ),
    );

    const preview = await previewAthletesImport(workbook, snapshot);

    expect(preview.summary.errors).toBe(0);
    expect(preview.rows[0]?.draft.memberships[0]).toMatchObject({
      groupId: "group-u12",
      action: "create",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MATCHED_GROUP_BY_NAME" }),
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

  it("blocks scalar updates to archived athletes during preview", async () => {
    const currentArchived = {
      ...baseSnapshot,
      athletes: [{ ...anna, isActive: false }],
    };
    const changedArchived = {
      ...currentArchived,
      athletes: [
        {
          ...anna,
          isActive: false,
          notes: "Geänderte Archivnotiz",
        },
      ],
    };
    const workbook = createAthletesWorkbook(changedArchived, "export");
    const preview = await previewAthletesImport(workbook, currentArchived);

    expect(preview.summary.errors).toBeGreaterThan(0);
    expect(preview.rows[0]).toMatchObject({
      action: "skip",
      reason: "invalid",
      matchedAthleteId: "athlete-1",
    });
    expect(preview.rows[0]?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INACTIVE_ATHLETE_UPDATE_UNSUPPORTED",
        }),
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
        async updateAthleteIfUnchanged() {
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

  it("applies scalar updates only through compare-and-update expected state", async () => {
    const changedSnapshot = {
      ...baseSnapshot,
      athletes: [{ ...anna, notes: "Neue Notiz" }],
    };
    const workbook = createAthletesWorkbook(changedSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-1",
    );
    let received: unknown = null;

    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      service: {
        async createAthlete() {
          throw new Error("unexpected create");
        },
        async updateAthleteIfUnchanged(
          organizationId,
          athleteId,
          expected,
          input,
        ) {
          received = { organizationId, athleteId, expected, input };
          return {
            id: athleteId,
            organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            birthYear: input.birthYear,
            notes: input.notes,
            isActive: true,
          };
        },
        async createAthleteGroupMembership() {
          throw new Error("unexpected membership");
        },
      },
    });

    expect(received).toEqual({
      organizationId: "verein-1",
      athleteId: "athlete-1",
      expected: {
        firstName: "Anna",
        lastName: "Muster",
        birthYear: 2012,
        notes: null,
      },
      input: {
        firstName: "Anna",
        lastName: "Muster",
        birthYear: 2012,
        notes: "Neue Notiz",
      },
    });
    expect(result.summary).toEqual({
      rows: 1,
      created: 0,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.rows[0]).toMatchObject({
      outcome: "updated",
      athleteId: "athlete-1",
      code: null,
    });
  });

  it("fails a concurrent scalar update without overwriting newer athlete state", async () => {
    const changedSnapshot = {
      ...baseSnapshot,
      athletes: [{ ...anna, notes: "Neue Notiz" }],
    };
    const workbook = createAthletesWorkbook(changedSnapshot, "export");
    const preview = await previewAthletesImport(workbook, baseSnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      baseSnapshot,
      "verein-1",
    );
    let compareCalls = 0;

    const result = await applyAthletesImportPreview({
      preview,
      expectedPreviewToken: token,
      actualPreviewToken: token,
      organizationId: "verein-1",
      service: {
        async createAthlete() {
          throw new Error("unexpected create");
        },
        async updateAthleteIfUnchanged(
          _organizationId,
          _athleteId,
          expected,
          input,
        ) {
          compareCalls += 1;
          expect(expected).toEqual({
            firstName: "Anna",
            lastName: "Muster",
            birthYear: 2012,
            notes: null,
          });
          expect(input.notes).toBe("Neue Notiz");
          return null;
        },
        async createAthleteGroupMembership() {
          throw new Error("unexpected membership");
        },
      },
    });

    expect(compareCalls).toBe(1);
    expect(result.summary).toEqual({
      rows: 1,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
    });
    expect(result.rows[0]).toMatchObject({
      outcome: "failed",
      athleteId: "athlete-1",
      code: "STALE_IMPORT_ROW",
    });
  });

  it("neutralizes spreadsheet formulas in the CSV import protocol", async () => {
    const formulaSnapshot = {
      ...baseSnapshot,
      athletes: [
        {
          ...anna,
          lastName: "=2+2",
        },
      ],
    };
    const workbook = createAthletesWorkbook(formulaSnapshot, "export");
    const preview = await previewAthletesImport(workbook, formulaSnapshot);
    const token = await createAthletesImportPreviewToken(
      workbook,
      formulaSnapshot,
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
          throw new Error("unexpected update");
        },
        async createAthleteGroupMembership() {
          throw new Error("unexpected membership");
        },
      },
    });

    expect(result.summary.skipped).toBe(1);
    expect(result.logCsv).toContain("'=2+2, Anna");
    expect(result.logCsv).not.toContain(";=2+2, Anna;");
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
});

function addTestDateStyle(xml: string): string {
  return xml
    .replace(
      "<fonts",
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>\n  <fonts',
    )
    .replace('cellXfs count="2"', 'cellXfs count="3"')
    .replace(
      "</cellXfs>",
      '    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>\n  </cellXfs>',
    );
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

  return buildStoredTestZip(entries);
}

function buildStoredTestZip(
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

  const parts = [...localParts, ...centralParts, end];
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(total);
  let writeOffset = 0;
  for (const part of parts) {
    result.set(part, writeOffset);
    writeOffset += part.byteLength;
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

function testCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
