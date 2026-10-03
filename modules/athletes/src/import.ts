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
  ATHLETES_EXCHANGE_ATHLETE_HEADERS,
  ATHLETES_EXCHANGE_GROUP_HEADERS,
  ATHLETES_EXCHANGE_VERSION,
} from "./exchange";
import type {
  AthleteMasterdataSnapshot,
} from "./postgres-masterdata-repository";

export const ATHLETES_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ATHLETES_IMPORT_MAX_ATHLETES = 1_000;

const MAX_RELATION_ROWS = 20_000;
const MAX_ZIP_ENTRIES = 128;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

const REQUIRED_SHEETS = Object.freeze([
  "Athleten",
  "Gruppen",
  "Listen",
  "Hinweise",
]);

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

interface SheetRow {
  readonly rowNumber: number;
  readonly cells: readonly string[];
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
  readonly issues: AthletesImportIssue[];
}

interface MembershipSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly athleteId: string | null;
  readonly athleteLabel: string | null;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
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
  validateWorkbookContract(workbook);
  const athleteRows = dataRowsWithHeader(
    workbook.get("Athleten")!,
    ATHLETES_EXCHANGE_ATHLETE_HEADERS,
    "Athleten",
  );
  const membershipRows = dataRowsWithHeader(
    workbook.get("Gruppen")!,
    ATHLETES_EXCHANGE_GROUP_HEADERS,
    "Gruppen",
  );
  if (athleteRows.length > ATHLETES_IMPORT_MAX_ATHLETES) {
    throw new AthletesImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält mehr als 1.000 Athleten.",
    );
  }
  if (membershipRows.length > MAX_RELATION_ROWS) {
    throw new AthletesImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält zu viele Gruppenzuordnungen.",
    );
  }

  const globalIssues: AthletesImportIssue[] = [];
  const sources = athleteRows.map(parseAthleteSource);
  const memberships = membershipRows.map(parseMembershipSource);
  const sourcesByKey = new Map<string, AthleteSource[]>();
  for (const source of sources) {
    const values = sourcesByKey.get(source.recordKey) ?? [];
    values.push(source);
    sourcesByKey.set(source.recordKey, values);
  }
  for (const [recordKey, values] of sourcesByKey) {
    if (recordKey.length === 0 || values.length <= 1) continue;
    for (const source of values) {
      source.issues.push(
        issue(
          "error",
          "DUPLICATE_RECORD_KEY",
          "Der Datensatz-Schlüssel kommt im Blatt Athleten mehrfach vor.",
          "Athleten",
          source.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
    }
  }

  const sourcesByName = new Map<string, AthleteSource[]>();
  for (const source of sources) {
    const key = personNameKey(source.firstName, source.lastName);
    const values = sourcesByName.get(key) ?? [];
    values.push(source);
    sourcesByName.set(key, values);
  }
  for (const values of sourcesByName.values()) {
    const blankIdValues = values.filter((source) => source.sourceId === null);
    if (
      blankIdValues.length > 1 &&
      blankIdValues.some((source) => source.birthYear === null)
    ) {
      for (const source of blankIdValues) {
        source.issues.push(
          issue(
            "error",
            "DUPLICATE_PERSON_IN_FILE",
            "Mehrere neue Zeilen haben denselben Namen und mindestens eine davon keinen Jahrgang. Bitte eindeutige IDs bzw. Jahrgänge verwenden.",
            "Athleten",
            source.rowNumber,
            "ID",
          ),
        );
      }
    }

    const byBirthYear = new Map<number, AthleteSource[]>();
    for (const source of values) {
      if (source.birthYear === null) continue;
      const sameYear = byBirthYear.get(source.birthYear) ?? [];
      sameYear.push(source);
      byBirthYear.set(source.birthYear, sameYear);
    }
    for (const sameYear of byBirthYear.values()) {
      if (sameYear.length <= 1) continue;
      for (const source of sameYear) {
        if (
          source.issues.some(
            (candidate) => candidate.code === "DUPLICATE_PERSON_IN_FILE",
          )
        ) {
          continue;
        }
        source.issues.push(
          issue(
            "error",
            "DUPLICATE_PERSON_IN_FILE",
            "Mehrere Importzeilen würden dieselbe Person mit identischem Namen und Jahrgang ergeben. Bitte eindeutige IDs bzw. Personendaten verwenden.",
            "Athleten",
            source.rowNumber,
            "ID",
          ),
        );
      }
    }
  }

  const membershipsByKey = new Map<string, MembershipSource[]>();
  for (const membership of memberships) {
    const owners = sourcesByKey.get(membership.recordKey) ?? [];
    if (membership.recordKey.length === 0 || owners.length !== 1) {
      globalIssues.push(
        issue(
          "error",
          "ORPHAN_GROUP_ROW",
          "Eine Gruppenzeile verweist auf keinen eindeutigen Athleten-Datensatz.",
          "Gruppen",
          membership.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
      continue;
    }
    const values = membershipsByKey.get(membership.recordKey) ?? [];
    values.push(membership);
    membershipsByKey.set(membership.recordKey, values);
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
            "Die angegebene Athleten-ID existiert in der aktuellen Organisation nicht.",
            "Athleten",
            source.rowNumber,
            "ID",
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
            "Mindestens ein Athlet mit demselben Namen hat keinen Jahrgang. Eine sichere automatische Zuordnung ist daher nicht möglich; bitte eine bestehende Athleten-ID verwenden.",
            "Athleten",
            source.rowNumber,
            "ID",
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
            "ID",
          ),
        );
      } else if (candidates.length > 1) {
        rowIssues.push(
          issue(
            "error",
            "AMBIGUOUS_PERSON_KEY",
            "Vorname, Nachname und Geburtsjahr sind nicht eindeutig. Bitte eine bestehende Athleten-ID verwenden.",
            "Athleten",
            source.rowNumber,
            "ID",
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
            "ID",
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
            "Mehrere Importzeilen würden denselben bestehenden Athleten verändern.",
            "Athleten",
            source.rowNumber,
            "ID",
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
      membershipsByKey.get(source.recordKey) ?? [],
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
          "Gruppen",
          null,
          null,
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
          startedOn: membership.startedOn,
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

  const appliedAt = now().toISOString();
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

function parseAthleteSource(row: SheetRow): AthleteSource {
  const issues: AthletesImportIssue[] = [];
  const recordKey = normalizedCell(row.cells[0] ?? "");
  if (recordKey.length === 0) {
    issues.push(
      issue(
        "error",
        "MISSING_RECORD_KEY",
        "Der Datensatz-Schlüssel fehlt.",
        "Athleten",
        row.rowNumber,
        "Datensatz-Schlüssel",
      ),
    );
  }
  const birthYear = parseOptionalIntegerCell(
    row.cells[4] ?? "",
    "Athleten",
    row.rowNumber,
    "Geburtsjahr",
    issues,
  );
  const active = parseBooleanCell(
    row.cells[6] ?? "",
    true,
    "Athleten",
    row.rowNumber,
    "Aktiv",
    issues,
  );
  return {
    rowNumber: row.rowNumber,
    recordKey,
    sourceId: optionalCell(row.cells[1] ?? ""),
    firstName: normalizedCell(row.cells[2] ?? ""),
    lastName: normalizedCell(row.cells[3] ?? ""),
    birthYear,
    notes: optionalCell(row.cells[5] ?? ""),
    isActive: active ?? true,
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

function parseMembershipSource(row: SheetRow): MembershipSource {
  const issues: AthletesImportIssue[] = [];
  const startedOn = spreadsheetDateCell(row.cells[5] ?? "");
  const endedOn = optionalSpreadsheetDateCell(row.cells[6] ?? "");
  try {
    createAthleteGroupMembership({
      organizationId: "import-preview",
      athleteId: "import-preview",
      groupId: "import-preview",
      startedOn,
      endedOn,
    });
  } catch (error) {
    issues.push(
      issue(
        "error",
        "MEMBERSHIP_VALIDATION_ERROR",
        germanValidationMessage(error),
        "Gruppen",
        row.rowNumber,
        "Beginn / Ende",
      ),
    );
  }
  return {
    rowNumber: row.rowNumber,
    recordKey: normalizedCell(row.cells[0] ?? ""),
    athleteId: optionalCell(row.cells[1] ?? ""),
    athleteLabel: optionalCell(row.cells[2] ?? ""),
    groupId: optionalCell(row.cells[3] ?? ""),
    groupName: optionalCell(row.cells[4] ?? ""),
    startedOn,
    endedOn,
    issues,
  };
}

function spreadsheetDateCell(value: string): string {
  const normalized = normalizedCell(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  if (/^\d+$/.test(normalized)) {
    const serial = Number(normalized);
    if (Number.isSafeInteger(serial) && serial > 0 && serial <= 100_000) {
      const milliseconds =
        Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1_000;
      const iso = new Date(milliseconds).toISOString().slice(0, 10);
      if (iso >= "1900-01-01" && iso <= "2100-12-31") return iso;
    }
  }
  return normalized;
}

function optionalSpreadsheetDateCell(value: string): string | null {
  const normalized = normalizedCell(value);
  return normalized.length === 0 ? null : spreadsheetDateCell(normalized);
}

function resolveMemberships(
  sources: readonly MembershipSource[],
  athleteSource: AthleteSource,
  existingAthlete: Athlete | null,
  snapshot: AthleteMasterdataSnapshot,
  rowIssues: AthletesImportIssue[],
): AthletesImportMembershipDraft[] {
  const result: AthletesImportMembershipDraft[] = [];
  const groupsById = new Map(
    snapshot.trainingGroups.map((group) => [group.id, group] as const),
  );
  const groupsByName = new Map<string, (typeof snapshot.trainingGroups)[number][]>();
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
  const seen = new Set<string>();
  const seenStarts = new Map<string, string | null>();

  for (const source of sources) {
    rowIssues.push(...source.issues);
    if (
      source.athleteId !== null &&
      athleteSource.sourceId !== null &&
      source.athleteId !== athleteSource.sourceId
    ) {
      rowIssues.push(
        issue(
          "error",
          "ATHLETE_ID_MISMATCH",
          "Die Athleten-ID der Gruppenzeile passt nicht zur Athletenzeile.",
          "Gruppen",
          source.rowNumber,
          "Athleten-ID",
        ),
      );
    }
    if (source.athleteId !== null && athleteSource.sourceId === null) {
      rowIssues.push(
        issue(
          "error",
          "NEW_ATHLETE_WITH_MEMBERSHIP_ID",
          "Bei neuen Athleten muss die Athleten-ID auch im Blatt Gruppen leer bleiben.",
          "Gruppen",
          source.rowNumber,
          "Athleten-ID",
        ),
      );
    }

    let group = source.groupId === null
      ? null
      : groupsById.get(source.groupId) ?? null;
    if (source.groupId !== null && group === null) {
      rowIssues.push(
        issue(
          "error",
          "UNKNOWN_GROUP_ID",
          "Die Trainingsgruppen-ID ist in der aktuellen Organisation nicht verfügbar.",
          "Gruppen",
          source.rowNumber,
          "Gruppen-ID",
        ),
      );
      continue;
    }
    if (group === null && source.groupName !== null) {
      const candidates = groupsByName.get(normalizedName(source.groupName)) ?? [];
      if (candidates.length === 1) {
        group = candidates[0]!;
        rowIssues.push(
          issue(
            "warning",
            "MATCHED_GROUP_BY_NAME",
            "Die Trainingsgruppe wurde über ihren Namen erkannt.",
            "Gruppen",
            source.rowNumber,
            "Gruppen-ID",
          ),
        );
      } else if (candidates.length > 1) {
        rowIssues.push(
          issue(
            "error",
            "AMBIGUOUS_GROUP_NAME",
            "Der Gruppenname ist nicht eindeutig. Bitte die Gruppen-ID verwenden.",
            "Gruppen",
            source.rowNumber,
            "Gruppen-ID",
          ),
        );
        continue;
      }
    }
    if (group === null) {
      rowIssues.push(
        issue(
          "error",
          "MISSING_GROUP",
          "Eine Gruppenzuordnung benötigt eine gültige Trainingsgruppe.",
          "Gruppen",
          source.rowNumber,
          "Gruppen-ID",
        ),
      );
      continue;
    }
    if (
      source.groupName !== null &&
      normalizedName(source.groupName) !== normalizedName(group.name) &&
      (group.shortName === null ||
        normalizedName(source.groupName) !== normalizedName(group.shortName))
    ) {
      rowIssues.push(
        issue(
          "warning",
          "GROUP_LABEL_MISMATCH",
          "Gruppen-ID und Gruppenbezeichnung unterscheiden sich; die ID ist maßgeblich.",
          "Gruppen",
          source.rowNumber,
          "Trainingsgruppe",
        ),
      );
    }

    const startKey = [group.id, source.startedOn].join("\u0000");
    if (seenStarts.has(startKey)) {
      const previousEnd = seenStarts.get(startKey) ?? null;
      if (previousEnd !== source.endedOn) {
        rowIssues.push(
          issue(
            "error",
            "DUPLICATE_MEMBERSHIP_START",
            "Für dieselbe Trainingsgruppe und denselben Beginn existieren unterschiedliche Enddaten.",
            "Gruppen",
            source.rowNumber,
            "Ende",
          ),
        );
      } else {
        rowIssues.push(
          issue(
            "warning",
            "DUPLICATE_MEMBERSHIP_ROW",
            "Diese Gruppenzuordnung kommt in der Datei mehrfach vor und wird nur einmal berücksichtigt.",
            "Gruppen",
            source.rowNumber,
            null,
          ),
        );
      }
      continue;
    }
    seenStarts.set(startKey, source.endedOn);

    const key = [
      group.id,
      source.startedOn,
      source.endedOn ?? "",
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);

    const sameStart = existingMemberships.find(
      (membership) =>
        membership.groupId === group!.id &&
        membership.startedOn === source.startedOn,
    );
    if (sameStart !== undefined) {
      if ((sameStart.endedOn ?? null) !== source.endedOn) {
        rowIssues.push(
          issue(
            "error",
            "MEMBERSHIP_CHANGE_UNSUPPORTED",
            "Eine bestehende historische Gruppenzuordnung kann über diesen Import nicht geändert oder geschlossen werden.",
            "Gruppen",
            source.rowNumber,
            "Ende",
          ),
        );
        continue;
      }
      result.push(
        Object.freeze({
          groupId: group.id,
          groupName: group.name,
          startedOn: source.startedOn,
          endedOn: source.endedOn,
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
          "Gruppen",
          source.rowNumber,
          "Gruppen-ID",
        ),
      );
      continue;
    }
    result.push(
      Object.freeze({
        groupId: group.id,
        groupName: group.name,
        startedOn: source.startedOn,
        endedOn: source.endedOn,
        action: "create" as const,
      }),
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

function dataRowsWithHeader(
  rows: readonly SheetRow[],
  expectedHeader: readonly string[],
  sheet: string,
): readonly SheetRow[] {
  const header = trimTrailingEmpty(rows[0]?.cells ?? []);
  if (!arraysEqual(header, expectedHeader)) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die Spalten im Blatt " + sheet + " entsprechen nicht dem Exchange-v1-Vertrag.",
    );
  }
  return rows.slice(1).filter((row) =>
    row.cells.some((cell) => normalizedCell(cell).length > 0)
  );
}

function validateWorkbookContract(
  workbook: ReadonlyMap<string, readonly SheetRow[]>,
): void {
  for (const sheet of REQUIRED_SHEETS) {
    if (!workbook.has(sheet)) {
      throw new AthletesImportFileError(
        "INVALID_EXCHANGE_CONTRACT",
        "Das erforderliche Blatt " + sheet + " fehlt.",
      );
    }
  }
  const notes = workbook.get("Hinweise")!;
  const contract = notes.find(
    (row) => normalizedCell(row.cells[0] ?? "") === "AppBasis-Vertrag",
  );
  if (
    contract === undefined ||
    normalizedCell(contract.cells[1] ?? "") !== ATHLETES_EXCHANGE_VERSION
  ) {
    throw new AthletesImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die XLSX-Datei verwendet nicht den unterstützten Athletes-Exchange-v1-Vertrag.",
    );
  }
}

function createImportLogCsv(
  rows: readonly AthletesImportResultRow[],
): string {
  const values = [
    [
      "Excel-Zeile",
      "Datensatz-Schlüssel",
      "Aktion",
      "Ergebnis",
      "Athleten-ID",
      "Athlet",
      "Code",
      "Meldung",
    ],
    ...rows.map((row) => [
      String(row.rowNumber),
      row.recordKey,
      row.requestedAction,
      row.outcome,
      row.athleteId ?? "",
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
  const entries = readZipDirectory(bytes);
  const workbookXml = await readZipText(bytes, entries, "xl/workbook.xml");
  const relationshipsXml = await readZipText(bytes, entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(await readZipText(bytes, entries, "xl/sharedStrings.xml"))
    : [];

  const relations = parseRelationships(relationshipsXml);
  const sheets = parseWorkbookSheets(workbookXml);
  const result = new Map<string, readonly SheetRow[]>();

  for (const sheet of sheets) {
    if (!REQUIRED_SHEETS.includes(sheet.name)) continue;
    const target = relations.get(sheet.relationshipId);
    if (target === undefined) {
      throw invalidXlsx("Eine Tabellenbeziehung der XLSX-Datei fehlt.");
    }
    const path = resolveZipPath("xl/workbook.xml", target);
    const xml = await readZipText(bytes, entries, path);
    result.set(sheet.name, Object.freeze(parseWorksheet(xml, sharedStrings)));
  }

  return result;
}

function readZipDirectory(bytes: Uint8Array): ReadonlyMap<string, ZipEntry> {
  if (bytes.byteLength < 22 || readUint32(bytes, 0) !== 0x04034b50) {
    throw invalidXlsx("Die Datei ist kein gültiger XLSX-ZIP-Container.");
  }

  const minimum = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw invalidXlsx("Das ZIP-Endverzeichnis fehlt.");

  const disk = readUint16(bytes, endOffset + 4);
  const centralDisk = readUint16(bytes, endOffset + 6);
  const count = readUint16(bytes, endOffset + 10);
  const centralSize = readUint32(bytes, endOffset + 12);
  const centralOffset = readUint32(bytes, endOffset + 16);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    count === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    count > MAX_ZIP_ENTRIES ||
    centralOffset + centralSize > bytes.byteLength
  ) {
    throw invalidXlsx("Der XLSX-ZIP-Container wird nicht unterstützt.");
  }

  const result = new Map<string, ZipEntry>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < count; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) {
      throw invalidXlsx("Das ZIP-Zentralverzeichnis ist beschädigt.");
    }
    const flags = readUint16(bytes, offset + 8);
    const method = readUint16(bytes, offset + 10);
    const crc = readUint32(bytes, offset + 16);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const diskStart = readUint16(bytes, offset + 34);
    const localOffset = readUint32(bytes, offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (
      entryEnd > bytes.byteLength ||
      diskStart !== 0 ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      (flags & 0x0001) !== 0 ||
      (method !== 0 && method !== 8) ||
      uncompressedSize > MAX_ENTRY_BYTES
    ) {
      throw invalidXlsx("Ein ZIP-Eintrag der XLSX-Datei wird nicht unterstützt.");
    }

    const name = decodeUtf8(bytes.slice(offset + 46, offset + 46 + nameLength));
    const normalized = normalizeZipPath(name);
    if (normalized !== name || normalized.startsWith("/") || normalized.includes("\\")) {
      throw invalidXlsx("Ein ZIP-Pfad der XLSX-Datei ist ungültig.");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw invalidXlsx("Die entpackte XLSX-Datei ist zu groß.");
    }
    if (result.has(name)) throw invalidXlsx("Die XLSX-Datei enthält doppelte ZIP-Einträge.");

    result.set(
      name,
      Object.freeze({
        name,
        flags,
        method,
        crc,
        compressedSize,
        uncompressedSize,
        localOffset,
      }),
    );
    offset = entryEnd;
  }

  return result;
}

async function readZipText(
  bytes: Uint8Array,
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): Promise<string> {
  const entry = entries.get(name);
  if (entry === undefined) throw invalidXlsx("Ein erforderlicher XLSX-Bestandteil fehlt.");
  const data = await readZipEntry(bytes, entry);
  const text = decodeUtf8(data);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw invalidXlsx("Nicht unterstützte XML-Deklarationen in der XLSX-Datei.");
  }
  return text;
}

async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const offset = entry.localOffset;
  if (offset + 30 > bytes.byteLength || readUint32(bytes, offset) !== 0x04034b50) {
    throw invalidXlsx("Ein lokaler ZIP-Header ist beschädigt.");
  }
  const nameLength = readUint16(bytes, offset + 26);
  const extraLength = readUint16(bytes, offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > bytes.byteLength) throw invalidXlsx("Ein ZIP-Eintrag ist unvollständig.");
  const compressed = bytes.slice(dataOffset, dataEnd);
  const result = entry.method === 0
    ? compressed
    : await inflateRaw(compressed, entry.uncompressedSize);
  if (result.byteLength !== entry.uncompressedSize || crc32(result) !== entry.crc) {
    throw invalidXlsx("Ein ZIP-Eintrag ist beschädigt.");
  }
  return result;
}

async function inflateRaw(
  compressed: Uint8Array,
  expectedLength: number,
): Promise<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  try {
    const input = new Uint8Array(compressed.byteLength);
    input.set(compressed);
    const response = new Response(input.buffer);
    if (response.body === null) throw new Error("missing body");
    stream = response.body.pipeThrough(new DecompressionStream("deflate-raw"));
  } catch {
    throw invalidXlsx("Deflate-komprimierte XLSX-Dateien werden in dieser Laufzeit nicht unterstützt.");
  }

  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > expectedLength || length > MAX_ENTRY_BYTES) {
        await reader.cancel();
        throw invalidXlsx("Ein entpackter XLSX-Bestandteil ist größer als angekündigt.");
      }
      parts.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof AthletesImportFileError) throw error;
    throw invalidXlsx("Ein komprimierter XLSX-Bestandteil konnte nicht gelesen werden.");
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function parseWorkbookSheets(
  xml: string,
): readonly { readonly name: string; readonly relationshipId: string }[] {
  const result: { name: string; relationshipId: string }[] = [];
  for (const match of xml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = match[0];
    const name = xmlAttribute(tag, "name");
    const relationshipId = xmlAttribute(tag, "r:id");
    if (name !== null && relationshipId !== null) result.push({ name, relationshipId });
  }
  if (result.length === 0) throw invalidXlsx("Die XLSX-Datei enthält keine Tabellenblätter.");
  return Object.freeze(result);
}

function parseRelationships(xml: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = xmlAttribute(tag, "Id");
    const target = xmlAttribute(tag, "Target");
    const mode = xmlAttribute(tag, "TargetMode");
    if (id !== null && target !== null && mode !== "External") result.set(id, target);
  }
  return result;
}

function parseSharedStrings(xml: string): readonly string[] {
  const result: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    result.push(xmlTextRuns(match[1] ?? ""));
  }
  return Object.freeze(result);
}

function parseWorksheet(
  xml: string,
  sharedStrings: readonly string[],
): SheetRow[] {
  const result: SheetRow[] = [];
  let fallbackRow = 1;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const attributes = rowMatch[1] ?? "";
    const body = rowMatch[2] ?? "";
    const explicitRow = numericAttribute(attributes, "r");
    const rowNumber = explicitRow ?? fallbackRow;
    fallbackRow = rowNumber + 1;

    const cells: string[] = [];
    let fallbackColumn = 0;
    for (const cellMatch of body.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const cellAttributes = cellMatch[1] ?? cellMatch[3] ?? "";
      const cellBody = cellMatch[2] ?? "";
      const reference = xmlAttribute("<c " + cellAttributes + ">", "r");
      const column = reference === null ? fallbackColumn : cellColumn(reference);
      if (column < 0 || column > 255) {
        throw invalidXlsx("Eine XLSX-Zelle liegt außerhalb des unterstützten Bereichs.");
      }
      fallbackColumn = column + 1;
      cells[column] = cellValue(cellAttributes, cellBody, sharedStrings);
    }
    result.push(
      Object.freeze({
        rowNumber,
        cells: Object.freeze(trimTrailingEmpty(cells.map((value) => value ?? ""))),
      }),
    );
  }
  return result;
}

function cellValue(
  attributes: string,
  body: string,
  sharedStrings: readonly string[],
): string {
  const type = xmlAttribute("<c " + attributes + ">", "t");
  if (type === "inlineStr") return xmlTextRuns(body);
  const raw = firstTagText(body, "v");
  if (raw === null) return "";
  if (type === "s") {
    const index = Number(raw);
    if (!Number.isSafeInteger(index) || index < 0 || index >= sharedStrings.length) {
      throw invalidXlsx("Ein Shared-String-Verweis der XLSX-Datei ist ungültig.");
    }
    return sharedStrings[index]!;
  }
  if (type === "b") return raw === "1" ? "ja" : "nein";
  return decodeXmlEntities(raw);
}

function xmlTextRuns(fragment: string): string {
  return Array.from(fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXmlEntities(match[1] ?? ""))
    .join("");
}

function firstTagText(fragment: string, tagName: string): string | null {
  const match = new RegExp("<" + tagName + "\\b[^>]*>([\\s\\S]*?)<\\/" + tagName + ">").exec(fragment);
  return match === null ? null : match[1] ?? "";
}

function xmlAttribute(tag: string, name: string): string | null {
  const double = new RegExp("(?:^|\\s)" + name + '="([^"]*)"').exec(tag);
  if (double !== null) return decodeXmlEntities(double[1] ?? "");
  const single = new RegExp("(?:^|\\s)" + name + "='([^']*)'").exec(tag);
  return single === null ? null : decodeXmlEntities(single[1] ?? "");
}

function numericAttribute(attributes: string, name: string): number | null {
  const value = xmlAttribute("<x " + attributes + ">", name);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (_entity, token: string) => {
      switch (token.toLocaleLowerCase("en")) {
        case "amp": return "&";
        case "lt": return "<";
        case "gt": return ">";
        case "quot": return '"';
        case "apos": return "'";
        default: {
          const numeric = token.startsWith("#x") || token.startsWith("#X")
            ? Number.parseInt(token.slice(2), 16)
            : Number.parseInt(token.slice(1), 10);
          if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) {
            throw invalidXlsx("Eine XML-Zeichenreferenz der XLSX-Datei ist ungültig.");
          }
          return String.fromCodePoint(numeric);
        }
      }
    },
  );
}

function resolveZipPath(baseFile: string, target: string): string {
  const candidate = target.startsWith("/")
    ? target.slice(1)
    : baseFile.slice(0, baseFile.lastIndexOf("/") + 1) + target;
  return normalizeZipPath(candidate);
}

function normalizeZipPath(path: string): string {
  const result: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (result.length === 0) throw invalidXlsx("Ein XLSX-Pfad verlässt den ZIP-Container.");
      result.pop();
      continue;
    }
    result.push(part);
  }
  return result.join("/");
}

function cellColumn(reference: string): number {
  const match = /^([A-Z]+)\d+$/i.exec(reference);
  if (match === null) throw invalidXlsx("Eine XLSX-Zellreferenz ist ungültig.");
  let value = 0;
  for (const char of match[1]!.toUpperCase()) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
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
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidXlsx("Ein XLSX-Bestandteil ist nicht gültig UTF-8-kodiert.");
  }
}

function invalidXlsx(message: string): AthletesImportFileError {
  return new AthletesImportFileError("INVALID_XLSX", message);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw invalidXlsx("Die XLSX-Datei ist abgeschnitten.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw invalidXlsx("Die XLSX-Datei ist abgeschnitten.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  return (value ^ 0xffffffff) >>> 0;
}
