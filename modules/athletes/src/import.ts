import {
  XlsxReadError,
  readXlsxWorkbook,
  type XlsxSheetRow,
} from "@appbasis/xlsx";

import {
  MasterdataValidationError,
  createAthlete,
  createAthleteGroupMembership,
  type Athlete,
  type AthleteGroupMembership,
  type CreateAthleteInput,
  type UpdateAthleteInput,
} from "./domain/masterdata";
import {
  ATHLETES_EXCHANGE_ACTIVE_HEADER,
  ATHLETES_EXCHANGE_CONTRACT_HEADER,
  ATHLETES_EXCHANGE_GROUP_HEADER_PREFIX,
  ATHLETES_EXCHANGE_GROUP_LIST_HEADER,
  ATHLETES_EXCHANGE_ID_HEADER,
  ATHLETES_EXCHANGE_VERSION,
  ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS,
} from "./exchange";
import type {
  AthleteMasterdataSnapshot,
} from "./postgres-masterdata-repository";

export const ATHLETES_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ATHLETES_IMPORT_MAX_ATHLETES = 1_000;

const REQUIRED_SHEETS = Object.freeze(["Athleten"]);

export type AthletesImportAction = "create" | "update" | "skip";

export interface AthletesImportIssue {
  readonly level: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly sheet: string;
  readonly row: number | null;
  readonly field: string | null;
}

export interface AthletesImportMembershipDraft {
  readonly groupId: string;
  readonly groupName: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
  readonly action: "create" | "skip";
}

export interface AthletesImportDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly scalarChanged: boolean;
  readonly memberships: readonly AthletesImportMembershipDraft[];
}

export interface AthletesImportExpectedAthleteState {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly notes: string | null;
}

export interface AthletesImportPreviewRow {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly sourceId: string | null;
  readonly matchedAthleteId: string | null;
  readonly expectedAthlete: AthletesImportExpectedAthleteState | null;
  readonly action: AthletesImportAction;
  readonly reason: "new" | "changed" | "unchanged" | "invalid";
  readonly draft: AthletesImportDraft;
  readonly issues: readonly AthletesImportIssue[];
}

export interface AthletesImportPreview {
  readonly contractVersion: typeof ATHLETES_EXCHANGE_VERSION;
  readonly applyAvailable: false;
  readonly summary: {
    readonly rows: number;
    readonly create: number;
    readonly update: number;
    readonly skip: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly issues: readonly AthletesImportIssue[];
  readonly rows: readonly AthletesImportPreviewRow[];
}

export class AthletesImportFileError extends Error {
  readonly code:
    | "IMPORT_FILE_TOO_LARGE"
    | "INVALID_XLSX"
    | "INVALID_EXCHANGE_CONTRACT"
    | "IMPORT_ROW_LIMIT_EXCEEDED";

  constructor(
    code:
      | "IMPORT_FILE_TOO_LARGE"
      | "INVALID_XLSX"
      | "INVALID_EXCHANGE_CONTRACT"
      | "IMPORT_ROW_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "AthletesImportFileError";
    this.code = code;
  }
}

export const ATHLETES_IMPORT_RESULT_VERSION =
  "appbasis.athletes.import-result/v1";

export interface AthletesImportResultRow {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly requestedAction: AthletesImportAction;
  readonly outcome: "created" | "updated" | "skipped" | "failed";
  readonly athleteId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly message: string;
}

export interface AthletesImportResult {
  readonly contractVersion: typeof ATHLETES_IMPORT_RESULT_VERSION;
  readonly previewToken: string;
  readonly appliedAt: string;
  readonly summary: {
    readonly rows: number;
    readonly created: number;
    readonly updated: number;
    readonly skipped: number;
    readonly failed: number;
  };
  readonly rows: readonly AthletesImportResultRow[];
  readonly logCsv: string;
}

export interface AthletesImportMutationService {
  createAthlete(
    organizationId: string,
    input: CreateAthleteInput,
  ): Promise<Athlete>;
  updateAthleteIfUnchanged(
    organizationId: string,
    athleteId: string,
    expected: AthletesImportExpectedAthleteState,
    input: UpdateAthleteInput,
  ): Promise<Athlete | null>;
  createAthleteGroupMembership(
    organizationId: string,
    input: Omit<
      Parameters<typeof createAthleteGroupMembership>[0],
      "organizationId"
    >,
  ): Promise<AthleteGroupMembership>;
}

class AthletesImportConcurrentUpdateError extends Error {
  constructor() {
    super("The athlete changed after import preview validation.");
    this.name = "AthletesImportConcurrentUpdateError";
  }
}

export class AthletesImportApplyError extends Error {
  readonly code:
    | "STALE_IMPORT_PREVIEW"
    | "INVALID_IMPORT_PREVIEW"
    | "INVALID_IMPORT_TOKEN";

  constructor(
    code:
      | "STALE_IMPORT_PREVIEW"
      | "INVALID_IMPORT_PREVIEW"
      | "INVALID_IMPORT_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "AthletesImportApplyError";
    this.code = code;
  }
}

type SheetRow = XlsxSheetRow;

interface AthleteSheetLayout {
  readonly groupIndexes: readonly number[];
  readonly idIndex: number;
  readonly activeIndex: number;
  readonly contractIndex: number;
  readonly groupListIndex: number;
}

interface AthleteSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly sourceId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly groupNames: readonly string[];
  readonly issues: AthletesImportIssue[];
}

interface ZipEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localOffset: number;
}

export async function previewAthletesImport(
  bytes: Uint8Array,
  snapshot: AthleteMasterdataSnapshot,
): Promise<AthletesImportPreview> {
  if (bytes.byteLength === 0) {
    throw new AthletesImportFileError("INVALID_XLSX", "Die XLSX-Datei ist leer.");
  }
  if (bytes.byteLength > ATHLETES_IMPORT_MAX_FILE_BYTES) {
    throw new AthletesImportFileError(
      "IMPORT_FILE_TOO_LARGE",
      "Die XLSX-Datei überschreitet 5 MB.",
    );
  }

  const workbook = await readWorkbook(bytes);
  const athleteSheet = workbook.get("Athleten");
  if (athleteSheet === undefined) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Das erforderliche Blatt Athleten fehlt.",
    );
  }
  const layout = validateWorkbookContract(athleteSheet);
  const athleteRows = dataRowsWithLayout(athleteSheet, layout);
  if (athleteRows.length > ATHLETES_IMPORT_MAX_ATHLETES) {
    throw new AthletesImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält mehr als 1.000 Athleten.",
    );
  }

  const globalIssues: AthletesImportIssue[] = [];
  const sources = athleteRows.map((row) => parseAthleteSource(row, layout));

  const sourcesByName = new Map<string, AthleteSource[]>();
  for (const source of sources) {
    const key = personNameKey(source.firstName, source.lastName);
    const values = sourcesByName.get(key) ?? [];
    values.push(source);
    sourcesByName.set(key, values);
  }
  for (const values of sourcesByName.values()) {
    const blankIdValues = values.filter((source) => source.sourceId === null);
    if (blankIdValues.length === 0) continue;

    if (
      values.length > 1 &&
      values.some((source) => source.birthYear === null)
    ) {
      for (const source of values) {
        source.issues.push(
          issue(
            "error",
            "DUPLICATE_PERSON_IN_FILE",
            "Mehrere Importzeilen verwenden denselben Namen und mindestens eine davon hat keinen Jahrgang. Bitte die Personendaten eindeutig machen oder mit einem aktuellen Export arbeiten.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      }
      continue;
    }

    const byBirthYear = new Map<number, AthleteSource[]>();
    for (const source of values) {
      if (source.birthYear === null) continue;
      const sameYear = byBirthYear.get(source.birthYear) ?? [];
      sameYear.push(source);
      byBirthYear.set(source.birthYear, sameYear);
    }
    for (const sameYear of byBirthYear.values()) {
      if (
        sameYear.length <= 1 ||
        !sameYear.some((source) => source.sourceId === null)
      ) {
        continue;
      }
      for (const source of sameYear) {
        source.issues.push(
          issue(
            "error",
            "DUPLICATE_PERSON_IN_FILE",
            "Mehrere Importzeilen würden dieselbe Person mit identischem Namen und Jahrgang ergeben. Bitte die Personendaten eindeutig machen oder mit einem aktuellen Export arbeiten.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      }
    }
  }

  const existingById = new Map(
    snapshot.athletes.map((athlete) => [athlete.id, athlete] as const),
  );
  const existingByPersonKey = new Map<string, Athlete[]>();
  const existingByName = new Map<string, Athlete[]>();
  for (const athlete of snapshot.athletes) {
    const nameKey = personNameKey(athlete.firstName, athlete.lastName);
    existingByName.set(nameKey, [...(existingByName.get(nameKey) ?? []), athlete]);
    if (athlete.birthYear !== null) {
      const key = personKey(athlete.firstName, athlete.lastName, athlete.birthYear);
      existingByPersonKey.set(
        key,
        [...(existingByPersonKey.get(key) ?? []), athlete],
      );
    }
  }

  const rows: AthletesImportPreviewRow[] = [];
  const claimedExistingIds = new Set<string>();
  for (const source of sources) {
    const rowIssues = [...source.issues];
    let normalized: ReturnType<typeof createAthlete> | null = null;
    try {
      normalized = createAthlete(
        {
          firstName: source.firstName,
          lastName: source.lastName,
          birthYear: source.birthYear,
          notes: source.notes,
        },
        { id: "import-preview", organizationId: "import-preview" },
      );
    } catch (error) {
      rowIssues.push(
        issue(
          "error",
          "ATHLETE_VALIDATION_ERROR",
          germanValidationMessage(error),
          "Athleten",
          source.rowNumber,
          null,
        ),
      );
    }

    let existing: Athlete | null = null;
    if (source.sourceId !== null) {
      existing = existingById.get(source.sourceId) ?? null;
      if (existing === null) {
        rowIssues.push(
          issue(
            "error",
            "UNKNOWN_ATHLETE_ID",
            "Die technische Zuordnung dieser Zeile ist nicht mehr gültig. Bitte einen aktuellen Export verwenden.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      }
    } else if (normalized !== null && source.birthYear !== null) {
      const nameKey = personNameKey(normalized.firstName, normalized.lastName);
      const candidates =
        existingByPersonKey.get(
          personKey(normalized.firstName, normalized.lastName, source.birthYear),
        ) ?? [];
      const unknownBirthYearCandidates =
        (existingByName.get(nameKey) ?? []).filter(
          (athlete) => athlete.birthYear === null,
        );
      if (unknownBirthYearCandidates.length > 0) {
        rowIssues.push(
          issue(
            "error",
            "POTENTIAL_DUPLICATE_REQUIRES_ID",
            "Mindestens ein Athlet mit demselben Namen hat keinen Jahrgang. Eine sichere automatische Zuordnung ist daher nicht möglich. Bitte die Personendaten eindeutig machen oder mit einem aktuellen Export arbeiten.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      } else if (candidates.length === 1) {
        existing = candidates[0]!;
        rowIssues.push(
          issue(
            "warning",
            "MATCHED_BY_PERSON_KEY",
            "Der bestehende Athlet wurde über Vorname, Nachname und Geburtsjahr erkannt.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      } else if (candidates.length > 1) {
        rowIssues.push(
          issue(
            "error",
            "AMBIGUOUS_PERSON_KEY",
            "Vorname, Nachname und Geburtsjahr sind nicht eindeutig. Bitte mit einem aktuellen Export arbeiten, damit die technische Zuordnung erhalten bleibt.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      }
    } else if (normalized !== null) {
      const sameName =
        existingByName.get(personNameKey(normalized.firstName, normalized.lastName)) ?? [];
      if (sameName.length > 0) {
        rowIssues.push(
          issue(
            "error",
            "POTENTIAL_DUPLICATE_REQUIRES_ID",
            "Ein Athlet mit demselben Namen existiert bereits. Ohne Geburtsjahr ist kein sicherer automatischer Abgleich möglich.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      }
    }

    if (existing !== null) {
      if (claimedExistingIds.has(existing.id)) {
        rowIssues.push(
          issue(
            "error",
            "DUPLICATE_TARGET_ATHLETE",
            "Mehrere Importzeilen würden denselben bestehenden Athleten verändern. Bitte doppelte Zeilen entfernen.",
            "Athleten",
            source.rowNumber,
            null,
          ),
        );
      } else {
        claimedExistingIds.add(existing.id);
      }
    }

    if (normalized !== null) {
      if (existing === null && !source.isActive) {
        rowIssues.push(
          issue(
            "error",
            "INACTIVE_CREATE_UNSUPPORTED",
            "Neue Athleten können über den Import nicht direkt archiviert angelegt werden.",
            "Athleten",
            source.rowNumber,
            "Aktiv",
          ),
        );
      }
      if (existing !== null && existing.isActive !== source.isActive) {
        rowIssues.push(
          issue(
            "error",
            "ACTIVE_STATUS_CHANGE_UNSUPPORTED",
            "Aktiv-/Archivstatus wird über den Import nicht geändert.",
            "Athleten",
            source.rowNumber,
            "Aktiv",
          ),
        );
      }
    }

    const resolvedMemberships = resolveMemberships(
      source.groupNames,
      source,
      existing,
      snapshot,
      rowIssues,
    );

    const scalarChanged =
      normalized !== null &&
      existing !== null &&
      !sameAthlete(existing, normalized);

    if (existing !== null && !existing.isActive && scalarChanged) {
      rowIssues.push(
        issue(
          "error",
          "INACTIVE_ATHLETE_UPDATE_UNSUPPORTED",
          "Archivierte Athleten können über den Import nicht fachlich geändert werden.",
          "Athleten",
          source.rowNumber,
          null,
        ),
      );
    }

    if (
      existing !== null &&
      !existing.isActive &&
      resolvedMemberships.some((membership) => membership.action === "create")
    ) {
      rowIssues.push(
        issue(
          "error",
          "INACTIVE_ATHLETE_MEMBERSHIP_UNSUPPORTED",
          "Für archivierte Athleten können keine neuen Gruppenzuordnungen importiert werden.",
          "Athleten",
          source.rowNumber,
          "Trainingsgruppe",
        ),
      );
    }

    const hasErrors = rowIssues.some((candidate) => candidate.level === "error");
    const newMemberships = resolvedMemberships.some(
      (membership) => membership.action === "create",
    );
    let action: AthletesImportAction;
    let reason: AthletesImportPreviewRow["reason"];
    if (hasErrors || normalized === null) {
      action = "skip";
      reason = "invalid";
    } else if (existing === null) {
      action = "create";
      reason = "new";
    } else if (!scalarChanged && !newMemberships) {
      action = "skip";
      reason = "unchanged";
    } else {
      action = "update";
      reason = "changed";
    }

    rows.push(
      Object.freeze({
        rowNumber: source.rowNumber,
        recordKey: source.recordKey,
        sourceId: source.sourceId,
        matchedAthleteId: existing?.id ?? null,
        expectedAthlete:
          existing === null
            ? null
            : Object.freeze({
                firstName: existing.firstName,
                lastName: existing.lastName,
                birthYear: existing.birthYear,
                notes: existing.notes,
              }),
        action,
        reason,
        draft: Object.freeze({
          firstName: normalized?.firstName ?? source.firstName,
          lastName: normalized?.lastName ?? source.lastName,
          birthYear: normalized?.birthYear ?? source.birthYear,
          notes: normalized?.notes ?? source.notes,
          isActive: source.isActive,
          scalarChanged,
          memberships: Object.freeze(resolvedMemberships),
        }),
        issues: Object.freeze(rowIssues),
      }),
    );
  }

  const allIssues = [
    ...globalIssues,
    ...rows.flatMap((row) => row.issues),
  ];
  return Object.freeze({
    contractVersion: ATHLETES_EXCHANGE_VERSION,
    applyAvailable: false as const,
    summary: Object.freeze({
      rows: rows.length,
      create: rows.filter((row) => row.action === "create").length,
      update: rows.filter((row) => row.action === "update").length,
      skip: rows.filter((row) => row.action === "skip").length,
      errors: allIssues.filter((candidate) => candidate.level === "error").length,
      warnings: allIssues.filter((candidate) => candidate.level === "warning").length,
    }),
    issues: Object.freeze(globalIssues),
    rows: Object.freeze(rows),
  });
}

export async function createAthletesImportPreviewToken(
  bytes: Uint8Array,
  snapshot: AthleteMasterdataSnapshot,
  organizationId: string,
): Promise<string> {
  const fileDigest = await sha256Hex(bytes);
  const state = JSON.stringify({
    organizationId,
    athletes: [...snapshot.athletes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((athlete) => ({
        id: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        birthYear: athlete.birthYear,
        notes: athlete.notes,
        isActive: athlete.isActive,
      })),
    trainingGroups: [...snapshot.trainingGroups]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((group) => ({
        id: group.id,
        name: group.name,
        shortName: group.shortName,
        isActive: group.isActive,
        sortOrder: group.sortOrder,
      })),
    memberships: [...snapshot.athleteGroupMemberships]
      .sort(
        (left, right) =>
          left.athleteId.localeCompare(right.athleteId) ||
          left.groupId.localeCompare(right.groupId) ||
          left.startedOn.localeCompare(right.startedOn),
      )
      .map((membership) => ({
        athleteId: membership.athleteId,
        groupId: membership.groupId,
        startedOn: membership.startedOn,
        endedOn: membership.endedOn,
      })),
  });
  const stateDigest = await sha256Hex(new TextEncoder().encode(state));
  return (
    "e6f4b-v1." +
    (await sha256Hex(
      new TextEncoder().encode(
        "appbasis.athletes.import-apply/v1\n" +
          fileDigest +
          "\n" +
          stateDigest,
      ),
    ))
  );
}

export async function applyAthletesImportPreview({
  preview,
  expectedPreviewToken,
  actualPreviewToken,
  organizationId,
  service,
  now = () => new Date(),
}: {
  preview: AthletesImportPreview;
  expectedPreviewToken: string;
  actualPreviewToken: string;
  organizationId: string;
  service: AthletesImportMutationService;
  now?: () => Date;
}): Promise<AthletesImportResult> {
  if (!/^e6f4b-v1\.[0-9a-f]{64}$/.test(expectedPreviewToken)) {
    throw new AthletesImportApplyError(
      "INVALID_IMPORT_TOKEN",
      "Der Import-Token ist ungültig.",
    );
  }
  if (expectedPreviewToken !== actualPreviewToken) {
    throw new AthletesImportApplyError(
      "STALE_IMPORT_PREVIEW",
      "Die Importvorschau ist nicht mehr aktuell. Bitte Datei erneut prüfen.",
    );
  }
  if (
    preview.summary.errors !== 0 ||
    preview.issues.some((candidate) => candidate.level === "error") ||
    preview.rows.some(
      (row) =>
        row.reason === "invalid" ||
        row.issues.some((candidate) => candidate.level === "error"),
    )
  ) {
    throw new AthletesImportApplyError(
      "INVALID_IMPORT_PREVIEW",
      "Die Importvorschau enthält Fehler und darf nicht angewendet werden.",
    );
  }

  const appliedDate = now();
  const membershipStartDate = appliedDate.toISOString().slice(0, 10);
  const results: AthletesImportResultRow[] = [];
  for (const row of preview.rows) {
    if (row.action === "skip") {
      results.push(
        resultRow(
          row,
          "skipped",
          row.matchedAthleteId,
          "UNCHANGED",
          "Unverändert; keine Datenmutation erforderlich.",
        ),
      );
      continue;
    }

    let athleteId = row.matchedAthleteId;
    let mutationApplied = false;
    try {
      if (row.action === "create") {
        const created = await service.createAthlete(
          organizationId,
          athleteInput(row.draft),
        );
        athleteId = created.id;
        mutationApplied = true;
      } else if (row.draft.scalarChanged) {
        if (athleteId === null) {
          throw new Error("missing matched athlete");
        }
        if (row.expectedAthlete === null) {
          throw new AthletesImportConcurrentUpdateError();
        }
        const updated = await service.updateAthleteIfUnchanged(
          organizationId,
          athleteId,
          row.expectedAthlete,
          athleteInput(row.draft),
        );
        if (updated === null) {
          throw new AthletesImportConcurrentUpdateError();
        }
        mutationApplied = true;
      }

      if (athleteId === null) throw new Error("missing athlete id");
      for (const membership of row.draft.memberships) {
        if (membership.action !== "create") continue;
        await service.createAthleteGroupMembership(organizationId, {
          athleteId,
          groupId: membership.groupId,
          startedOn:
            membership.startedOn.length === 0
              ? membershipStartDate
              : membership.startedOn,
          endedOn: membership.endedOn,
        });
        mutationApplied = true;
      }

      results.push(
        resultRow(
          row,
          row.action === "create" ? "created" : "updated",
          athleteId,
          null,
          row.action === "create"
            ? "Athlet und neue Gruppenzuordnungen wurden angelegt."
            : "Athlet bzw. neue Gruppenzuordnungen wurden aktualisiert.",
        ),
      );
    } catch (error) {
      const concurrentUpdate =
        error instanceof AthletesImportConcurrentUpdateError;
      results.push(
        resultRow(
          row,
          "failed",
          athleteId,
          concurrentUpdate
            ? "STALE_IMPORT_ROW"
            : mutationApplied
              ? "IMPORT_APPLY_PARTIAL"
              : "IMPORT_APPLY_FAILED",
          concurrentUpdate
            ? "Der Athlet wurde seit der Vorschau geändert. Diese Zeile wurde nicht überschrieben; bitte Import neu prüfen."
            : mutationApplied
              ? "Der Athlet wurde bereits geschrieben, aber eine nachgelagerte Gruppenzuordnung ist fehlgeschlagen. Bitte Import neu prüfen."
              : "Die Zeile konnte nicht angewendet werden. Bitte Import neu prüfen.",
        ),
      );
    }
  }

  const appliedAt = appliedDate.toISOString();
  const result = Object.freeze({
    contractVersion: ATHLETES_IMPORT_RESULT_VERSION,
    previewToken: actualPreviewToken,
    appliedAt,
    summary: Object.freeze({
      rows: results.length,
      created: results.filter((row) => row.outcome === "created").length,
      updated: results.filter((row) => row.outcome === "updated").length,
      skipped: results.filter((row) => row.outcome === "skipped").length,
      failed: results.filter((row) => row.outcome === "failed").length,
    }),
    rows: Object.freeze(results),
    logCsv: createImportLogCsv(results),
  });
  return result;
}

function athleteInput(
  draft: AthletesImportDraft,
): CreateAthleteInput & UpdateAthleteInput {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    birthYear: draft.birthYear,
    notes: draft.notes,
  };
}

function resultRow(
  row: AthletesImportPreviewRow,
  outcome: AthletesImportResultRow["outcome"],
  athleteId: string | null,
  code: string | null,
  message: string,
): AthletesImportResultRow {
  return Object.freeze({
    rowNumber: row.rowNumber,
    recordKey: row.recordKey,
    requestedAction: row.action,
    outcome,
    athleteId,
    name: [row.draft.lastName, row.draft.firstName].filter(Boolean).join(", "),
    code,
    message,
  });
}

function parseAthleteSource(
  row: SheetRow,
  layout: AthleteSheetLayout,
): AthleteSource {
  const issues: AthletesImportIssue[] = [];
  const birthYear = parseOptionalIntegerCell(
    row.cells[2] ?? "",
    "Athleten",
    row.rowNumber,
    "Geburtsjahr",
    issues,
  );
  const active = parseBooleanCell(
    row.cells[layout.activeIndex] ?? "",
    true,
    "Athleten",
    row.rowNumber,
    "Aktiv",
    issues,
  );
  const groupNames = layout.groupIndexes
    .map((index) => normalizedCell(row.cells[index] ?? ""))
    .filter((value) => value.length > 0);

  return {
    rowNumber: row.rowNumber,
    recordKey: "row-" + String(row.rowNumber).padStart(4, "0"),
    sourceId: optionalCell(row.cells[layout.idIndex] ?? ""),
    firstName: normalizedCell(row.cells[0] ?? ""),
    lastName: normalizedCell(row.cells[1] ?? ""),
    birthYear,
    notes: optionalCell(row.cells[3] ?? ""),
    isActive: active ?? true,
    groupNames: Object.freeze(groupNames),
    issues,
  };
}

function parseOptionalIntegerCell(
  value: string,
  sheet: string,
  row: number,
  field: string,
  issues: AthletesImportIssue[],
): number | null {
  const normalized = normalizedCell(value);
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    issues.push(
      issue(
        "error",
        "INVALID_INTEGER",
        "Der Wert in " + field + " muss eine ganze Zahl sein.",
        sheet,
        row,
        field,
      ),
    );
    return null;
  }
  return parsed;
}

function resolveMemberships(
  groupNames: readonly string[],
  athleteSource: AthleteSource,
  existingAthlete: Athlete | null,
  snapshot: AthleteMasterdataSnapshot,
  rowIssues: AthletesImportIssue[],
): AthletesImportMembershipDraft[] {
  const result: AthletesImportMembershipDraft[] = [];
  const groupsByName = new Map<
    string,
    (typeof snapshot.trainingGroups)[number][]
  >();
  for (const group of snapshot.trainingGroups) {
    for (const label of [group.name, group.shortName].filter(
      (value): value is string => value !== null,
    )) {
      const key = normalizedName(label);
      const current = groupsByName.get(key) ?? [];
      if (!current.some((candidate) => candidate.id === group.id)) {
        groupsByName.set(key, [...current, group]);
      }
    }
  }

  const existingMemberships = snapshot.athleteGroupMemberships.filter(
    (membership) => membership.athleteId === existingAthlete?.id,
  );
  const seenGroupIds = new Set<string>();

  for (const groupName of groupNames) {
    const candidates = groupsByName.get(normalizedName(groupName)) ?? [];
    if (candidates.length === 0) {
      rowIssues.push(
        issue(
          "error",
          "UNKNOWN_GROUP",
          "Die ausgewählte Trainingsgruppe ist in der aktuellen Organisation nicht verfügbar.",
          "Athleten",
          athleteSource.rowNumber,
          "Trainingsgruppe",
        ),
      );
      continue;
    }
    if (candidates.length > 1) {
      rowIssues.push(
        issue(
          "error",
          "AMBIGUOUS_GROUP_NAME",
          "Der Gruppenname ist nicht eindeutig. Bitte die Trainingsgruppen in den Stammdaten eindeutig benennen.",
          "Athleten",
          athleteSource.rowNumber,
          "Trainingsgruppe",
        ),
      );
      continue;
    }

    const group = candidates[0]!;
    if (seenGroupIds.has(group.id)) {
      rowIssues.push(
        issue(
          "warning",
          "DUPLICATE_GROUP_SELECTION",
          "Dieselbe Trainingsgruppe wurde in dieser Zeile mehrfach ausgewählt und wird nur einmal berücksichtigt.",
          "Athleten",
          athleteSource.rowNumber,
          "Trainingsgruppe",
        ),
      );
      continue;
    }
    seenGroupIds.add(group.id);

    const activeExisting = existingMemberships.find(
      (membership) =>
        membership.groupId === group.id && membership.endedOn === null,
    );
    if (activeExisting !== undefined) {
      result.push(
        Object.freeze({
          groupId: group.id,
          groupName: group.name,
          startedOn: activeExisting.startedOn,
          endedOn: null,
          action: "skip" as const,
        }),
      );
      continue;
    }

    if (!group.isActive) {
      rowIssues.push(
        issue(
          "error",
          "INACTIVE_GROUP_CREATE_UNSUPPORTED",
          "Neue Zuordnungen können nur zu aktiven Trainingsgruppen angelegt werden.",
          "Athleten",
          athleteSource.rowNumber,
          "Trainingsgruppe",
        ),
      );
      continue;
    }

    result.push(
      Object.freeze({
        groupId: group.id,
        groupName: group.name,
        startedOn: "",
        endedOn: null,
        action: "create" as const,
      }),
    );
  }

  for (const membership of existingMemberships) {
    if (membership.endedOn !== null || seenGroupIds.has(membership.groupId)) {
      continue;
    }
    rowIssues.push(
      issue(
        "warning",
        "GROUP_REMOVAL_IGNORED",
        "Eine bestehende Gruppenzuordnung fehlt in der Excel-Zeile. Entfernen wird aus Sicherheitsgründen ignoriert; der Import ergänzt Gruppen nur.",
        "Athleten",
        athleteSource.rowNumber,
        "Trainingsgruppe",
      ),
    );
  }

  return result;
}

function sameAthlete(
  existing: Athlete,
  normalized: ReturnType<typeof createAthlete>,
): boolean {
  return (
    existing.firstName === normalized.firstName &&
    existing.lastName === normalized.lastName &&
    existing.birthYear === normalized.birthYear &&
    existing.notes === normalized.notes
  );
}

function personNameKey(firstName: string, lastName: string): string {
  return normalizedName(firstName) + "\u0000" + normalizedName(lastName);
}

function personKey(
  firstName: string,
  lastName: string,
  birthYear: number,
): string {
  return personNameKey(firstName, lastName) + "\u0000" + String(birthYear);
}

function validateWorkbookContract(
  rows: readonly SheetRow[],
): AthleteSheetLayout {
  const header = trimTrailingEmpty(rows[0]?.cells ?? []);
  const base = ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS;
  if (
    header.length < base.length + 5 ||
    !arraysEqual(header.slice(0, base.length), base)
  ) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die Spalten im Blatt Athleten entsprechen nicht der aktuellen Importvorlage.",
    );
  }

  const groupIndexes: number[] = [];
  let index = base.length;
  let groupNumber = 1;
  while (
    header[index] ===
    ATHLETES_EXCHANGE_GROUP_HEADER_PREFIX + String(groupNumber)
  ) {
    groupIndexes.push(index);
    index += 1;
    groupNumber += 1;
  }
  if (groupIndexes.length === 0) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die Importvorlage enthält keine Trainingsgruppen-Spalten.",
    );
  }

  const idIndex = index;
  const activeIndex = idIndex + 1;
  const contractIndex = idIndex + 2;
  const groupListIndex = idIndex + 3;
  if (
    header[idIndex] !== ATHLETES_EXCHANGE_ID_HEADER ||
    header[activeIndex] !== ATHLETES_EXCHANGE_ACTIVE_HEADER ||
    header[contractIndex] !== ATHLETES_EXCHANGE_CONTRACT_HEADER ||
    header[groupListIndex] !== ATHLETES_EXCHANGE_GROUP_LIST_HEADER ||
    header.length !== groupListIndex + 1
  ) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die technische Struktur der Importvorlage wurde verändert. Bitte eine aktuelle Vorlage verwenden.",
    );
  }

  const contract = rows
    .slice(1)
    .map((row) => normalizedCell(row.cells[contractIndex] ?? ""))
    .find((value) => value.length > 0);
  if (contract !== ATHLETES_EXCHANGE_VERSION) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die XLSX-Datei verwendet nicht die aktuelle Athleten-Importvorlage. Bitte eine neue Vorlage herunterladen.",
    );
  }

  return Object.freeze({
    groupIndexes: Object.freeze(groupIndexes),
    idIndex,
    activeIndex,
    contractIndex,
    groupListIndex,
  });
}

function dataRowsWithLayout(
  rows: readonly SheetRow[],
  layout: AthleteSheetLayout,
): readonly SheetRow[] {
  const relevantIndexes = [
    0,
    1,
    2,
    3,
    ...layout.groupIndexes,
    layout.idIndex,
    layout.activeIndex,
  ];
  return rows.slice(1).filter((row) =>
    relevantIndexes.some(
      (index) => normalizedCell(row.cells[index] ?? "").length > 0,
    ),
  );
}

function createImportLogCsv(
  rows: readonly AthletesImportResultRow[],
): string {
  const values = [
    [
      "Excel-Zeile",
      "Aktion",
      "Ergebnis",
      "Athlet",
      "Code",
      "Meldung",
    ],
    ...rows.map((row) => [
      String(row.rowNumber),
      row.requestedAction,
      row.outcome,
      row.name,
      row.code ?? "",
      row.message,
    ]),
  ];
  return "\ufeff" + values.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  const safe = /^[\t ]*[=+\-@]/.test(normalized)
    ? "'" + normalized
    : normalized;
  return /[;"\n]/.test(safe)
    ? '"' + safe.replaceAll('"', '""') + '"'
    : safe;
}

async function readWorkbook(
  bytes: Uint8Array,
): Promise<ReadonlyMap<string, readonly SheetRow[]>> {
  try {
    return await readXlsxWorkbook(bytes, {
      sheetNames: REQUIRED_SHEETS,
      decodeDates: true,
    });
  } catch (error) {
    if (error instanceof XlsxReadError) {
      throw invalidXlsx(error.message);
    }
    throw error;
  }
}

function parseBooleanCell(
  value: string,
  defaultValue: boolean,
  sheet: string,
  row: number,
  field: string,
  issues: AthletesImportIssue[],
): boolean {
  const normalized = normalizedCell(value).toLocaleLowerCase("de");
  if (normalized.length === 0) return defaultValue;
  if (["ja", "yes", "true", "1"].includes(normalized)) return true;
  if (["nein", "no", "false", "0"].includes(normalized)) return false;
  issues.push(issue("error", "INVALID_BOOLEAN", "Der Wert in " + field + " muss ja oder nein sein.", sheet, row, field));
  return defaultValue;
}

function parseOptionalNumber(
  value: string,
  sheet: string,
  row: number,
  field: string,
  issues: AthletesImportIssue[],
): number | null {
  const normalized = normalizedCell(value);
  if (normalized.length === 0) return null;
  const parsed = Number(
    normalized.includes(",") && !normalized.includes(".")
      ? normalized.replace(",", ".")
      : normalized,
  );
  if (!Number.isFinite(parsed)) {
    issues.push(issue("error", "INVALID_NUMBER", "Der Wert in " + field + " ist keine gültige Zahl.", sheet, row, field));
    return null;
  }
  return parsed;
}

function parseIntegerCell(
  value: string,
  defaultValue: number,
  sheet: string,
  row: number,
  field: string,
  issues: AthletesImportIssue[],
): number {
  const normalized = normalizedCell(value);
  if (normalized.length === 0) return defaultValue;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    issues.push(issue("error", "INVALID_INTEGER", "Der Wert in " + field + " muss eine ganze Zahl sein.", sheet, row, field));
    return defaultValue;
  }
  return parsed;
}

function issue(
  level: "error" | "warning",
  code: string,
  message: string,
  sheet: string,
  row: number | null,
  field: string | null,
): AthletesImportIssue {
  return Object.freeze({ level, code, message, sheet, row, field });
}

function normalizedCell(value: string): string {
  return value.replace(/\u00a0/g, " ").trim();
}

function optionalCell(value: string): string | null {
  const normalized = normalizedCell(value);
  return normalized.length === 0 ? null : normalized;
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("de");
}

function previewIdentifier(recordKey: string, rowNumber: number): string {
  const normalized = recordKey.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 120);
  return "preview-" + (normalized || String(rowNumber));
}

function padded(values: readonly string[], length: number): string[] {
  return Array.from({ length }, (_, index) => values[index] ?? "");
}

function trimTrailingEmpty(values: readonly string[]): string[] {
  const result = [...values];
  while (result.length > 0 && result[result.length - 1] === "") result.pop();
  return result;
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function germanValidationMessage(error: unknown): string {
  if (error instanceof MasterdataValidationError) {
    return "Die Stammdaten sind fachlich ungültig: " + error.message;
  }
  return "Die Stammdaten sind fachlich ungültig.";
}
function invalidXlsx(message: string): AthletesImportFileError {
  return new AthletesImportFileError("INVALID_XLSX", message);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
