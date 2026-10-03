import {
  UlcExerciseCatalogValidationError,
  type CreateUlcExerciseCatalogItemInput,
} from "./exercise-catalog-domain";
import {
  type UlcExerciseCatalogImportPreview,
  type UlcExerciseCatalogImportPreviewRow,
  ulcExerciseCatalogImportDraftToInput,
} from "./exercise-catalog-import";
import {
  UlcExerciseCatalogConflictError,
  UlcExerciseCatalogNotFoundError,
} from "./exercise-catalog-postgres";
import {
  UlcExerciseCatalogGroupNotFoundError,
} from "./exercise-catalog-service";

export const ULC_EXERCISE_CATALOG_IMPORT_RESULT_VERSION =
  "appbasis.exercise-catalog.import-result/v1";

export interface UlcExerciseCatalogImportMutationService {
  create(
    organizationId: string,
    identityId: string,
    input: CreateUlcExerciseCatalogItemInput,
  ): Promise<{ readonly id: string; readonly name: string }>;
  update(
    organizationId: string,
    identityId: string,
    exerciseId: string,
    input: CreateUlcExerciseCatalogItemInput,
  ): Promise<{ readonly id: string; readonly name: string }>;
}

export type UlcExerciseCatalogImportOutcome =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

export interface UlcExerciseCatalogImportResultRow {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly requestedAction: "create" | "update" | "skip";
  readonly outcome: UlcExerciseCatalogImportOutcome;
  readonly exerciseId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly message: string;
}

export interface UlcExerciseCatalogImportResult {
  readonly contractVersion: typeof ULC_EXERCISE_CATALOG_IMPORT_RESULT_VERSION;
  readonly previewToken: string;
  readonly appliedAt: string;
  readonly summary: {
    readonly rows: number;
    readonly created: number;
    readonly updated: number;
    readonly skipped: number;
    readonly failed: number;
  };
  readonly rows: readonly UlcExerciseCatalogImportResultRow[];
  readonly logCsv: string;
}

export class UlcExerciseCatalogImportApplyError extends Error {
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
    this.name = "UlcExerciseCatalogImportApplyError";
    this.code = code;
  }
}

export async function applyUlcExerciseCatalogImportPreview({
  preview,
  expectedPreviewToken,
  actualPreviewToken,
  organizationId,
  actorPrincipalId,
  service,
  now = () => new Date(),
}: {
  preview: UlcExerciseCatalogImportPreview;
  expectedPreviewToken: string;
  actualPreviewToken: string;
  organizationId: string;
  actorPrincipalId: string;
  service: UlcExerciseCatalogImportMutationService;
  now?: () => Date;
}): Promise<UlcExerciseCatalogImportResult> {
  if (!/^e6f3-v1\.[0-9a-f]{64}$/.test(expectedPreviewToken)) {
    throw new UlcExerciseCatalogImportApplyError(
      "INVALID_IMPORT_TOKEN",
      "Der Import-Token ist ungültig.",
    );
  }
  if (expectedPreviewToken !== actualPreviewToken) {
    throw new UlcExerciseCatalogImportApplyError(
      "STALE_IMPORT_PREVIEW",
      "Die Importvorschau ist nicht mehr aktuell. Bitte Datei erneut prüfen.",
    );
  }
  if (
    preview.summary.errors !== 0 ||
    preview.issues.some((issue) => issue.level === "error") ||
    preview.rows.some((row) =>
      row.reason === "invalid" ||
      row.issues.some((issue) => issue.level === "error")
    )
  ) {
    throw new UlcExerciseCatalogImportApplyError(
      "INVALID_IMPORT_PREVIEW",
      "Die Importvorschau enthält Fehler und darf nicht angewendet werden.",
    );
  }

  const results: UlcExerciseCatalogImportResultRow[] = [];

  for (const row of preview.rows) {
    if (row.action === "skip") {
      results.push(
        Object.freeze({
          rowNumber: row.rowNumber,
          recordKey: row.recordKey,
          requestedAction: row.action,
          outcome: "skipped" as const,
          exerciseId: row.matchedExerciseId,
          name: row.draft.name,
          code: row.reason === "unchanged" ? "UNCHANGED" : "SKIPPED",
          message:
            row.reason === "unchanged"
              ? "Unverändert; keine Datenmutation erforderlich."
              : "Zeile wurde übersprungen.",
        }),
      );
      continue;
    }

    try {
      const input = ulcExerciseCatalogImportDraftToInput(row.draft);
      if (row.action === "create") {
        const created = await service.create(
          organizationId,
          actorPrincipalId,
          input,
        );
        results.push(successRow(row, "created", created.id, created.name));
      } else {
        if (row.matchedExerciseId === null) {
          throw new UlcExerciseCatalogImportApplyError(
            "INVALID_IMPORT_PREVIEW",
            "Eine Update-Zeile besitzt keine bestehende Übungs-ID.",
          );
        }
        const updated = await service.update(
          organizationId,
          actorPrincipalId,
          row.matchedExerciseId,
          input,
        );
        results.push(successRow(row, "updated", updated.id, updated.name));
      }
    } catch (error) {
      const failure = importFailure(error);
      results.push(
        Object.freeze({
          rowNumber: row.rowNumber,
          recordKey: row.recordKey,
          requestedAction: row.action,
          outcome: "failed" as const,
          exerciseId: row.matchedExerciseId,
          name: row.draft.name,
          code: failure.code,
          message: failure.message,
        }),
      );
    }
  }

  const result = Object.freeze({
    contractVersion: ULC_EXERCISE_CATALOG_IMPORT_RESULT_VERSION,
    previewToken: actualPreviewToken,
    appliedAt: now().toISOString(),
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

function successRow(
  row: UlcExerciseCatalogImportPreviewRow,
  outcome: "created" | "updated",
  exerciseId: string,
  name: string,
): UlcExerciseCatalogImportResultRow {
  return Object.freeze({
    rowNumber: row.rowNumber,
    recordKey: row.recordKey,
    requestedAction: row.action,
    outcome,
    exerciseId,
    name,
    code: null,
    message:
      outcome === "created"
        ? "Übung wurde angelegt."
        : "Übung wurde aktualisiert.",
  });
}

function importFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  if (error instanceof UlcExerciseCatalogImportApplyError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof UlcExerciseCatalogConflictError) {
    return {
      code: error.code,
      message:
        "Die Übung steht inzwischen in Konflikt mit einem bestehenden Datensatz. Bitte Import neu prüfen.",
    };
  }
  if (error instanceof UlcExerciseCatalogNotFoundError) {
    return {
      code: error.code,
      message:
        "Die bestehende Übung wurde zwischen Vorschau und Import verändert oder entfernt.",
    };
  }
  if (error instanceof UlcExerciseCatalogGroupNotFoundError) {
    return {
      code: error.code,
      message:
        "Eine Trainingsgruppe ist nicht mehr verfügbar. Bitte Import neu prüfen.",
    };
  }
  if (error instanceof UlcExerciseCatalogValidationError) {
    return {
      code: "EXERCISE_CATALOG_VALIDATION_ERROR",
      message:
        "Die Übungsdaten sind beim Apply nicht mehr fachlich gültig. Bitte Import neu prüfen.",
    };
  }
  return {
    code: "IMPORT_APPLY_FAILED",
    message:
      "Die Zeile konnte nicht angewendet werden. Die übrigen Zeilen wurden separat verarbeitet.",
  };
}

function createImportLogCsv(
  rows: readonly UlcExerciseCatalogImportResultRow[],
): string {
  const header = [
    "Excel-Zeile",
    "Datensatz-Schlüssel",
    "Aktion",
    "Ergebnis",
    "Übungs-ID",
    "Übung",
    "Code",
    "Meldung",
  ];
  const values = [
    header,
    ...rows.map((row) => [
      String(row.rowNumber),
      row.recordKey,
      row.requestedAction,
      row.outcome,
      row.exerciseId ?? "",
      row.name,
      row.code ?? "",
      row.message,
    ]),
  ];
  return "\ufeff" + values.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  return /[;"\n]/.test(normalized)
    ? '"' + normalized.replaceAll('"', '""') + '"'
    : normalized;
}
