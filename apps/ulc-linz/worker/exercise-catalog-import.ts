import {
  ULC_EXERCISE_CATEGORIES,
  ULC_EXERCISE_PARAMETER_KEYS,
  UlcExerciseCatalogValidationError,
  createUlcExerciseCatalogItem,
  type CreateUlcExerciseCatalogItemInput,
  type UlcExerciseCategoryKey,
  type UlcExerciseParameterInputType,
  type UlcExerciseParameterKey,
} from "./exercise-catalog-domain";
import {
  ULC_EXERCISE_CATALOG_EXCHANGE_VERSION,
  ULC_EXERCISE_CATALOG_EXERCISE_HEADERS,
  ULC_EXERCISE_CATALOG_GROUP_HEADERS,
  ULC_EXERCISE_CATALOG_PARAMETER_HEADERS,
} from "./exercise-catalog-exchange";
import type {
  UlcExerciseCatalogOverview,
  UlcExerciseCatalogTrainingGroup,
} from "./exercise-catalog-service";

export const ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ULC_EXERCISE_CATALOG_IMPORT_MAX_EXERCISES = 1_000;

const MAX_RELATION_ROWS = 20_000;
const MAX_ZIP_ENTRIES = 128;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;

const REQUIRED_SHEETS = Object.freeze([
  "Übungen",
  "Gruppen",
  "Parameter",
  "Listen",
  "Hinweise",
]);

export type UlcExerciseCatalogImportAction = "create" | "update" | "skip";

export interface UlcExerciseCatalogImportIssue {
  readonly level: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly sheet: string;
  readonly row: number | null;
  readonly field: string | null;
}

export interface UlcExerciseCatalogImportDraft {
  readonly id: string;
  readonly name: string;
  readonly categoryKey: string;
  readonly subcategory: string | null;
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  readonly videoUrl: string | null;
  readonly groupIds: readonly string[];
  readonly parameters: readonly {
    readonly key: string;
    readonly label: string;
    readonly unit: string;
    readonly inputType: string;
    readonly defaultValue: string | null;
    readonly minValue: number | null;
    readonly maxValue: number | null;
    readonly stepValue: number | null;
    readonly isRequired: boolean;
    readonly sortOrder: number;
  }[];
  readonly isActive: boolean;
  readonly isFavorite: false;
}

export interface UlcExerciseCatalogImportPreviewRow {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly sourceId: string | null;
  readonly matchedExerciseId: string | null;
  readonly action: UlcExerciseCatalogImportAction;
  readonly reason: "new" | "changed" | "unchanged" | "invalid";
  readonly draft: UlcExerciseCatalogImportDraft;
  readonly issues: readonly UlcExerciseCatalogImportIssue[];
}

export interface UlcExerciseCatalogImportPreview {
  readonly contractVersion: typeof ULC_EXERCISE_CATALOG_EXCHANGE_VERSION;
  readonly applyAvailable: false;
  readonly summary: {
    readonly rows: number;
    readonly create: number;
    readonly update: number;
    readonly skip: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly issues: readonly UlcExerciseCatalogImportIssue[];
  readonly rows: readonly UlcExerciseCatalogImportPreviewRow[];
}

export class UlcExerciseCatalogImportFileError extends Error {
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
    this.name = "UlcExerciseCatalogImportFileError";
    this.code = code;
  }
}

interface SheetRow {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

interface ExerciseSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly sourceId: string | null;
  readonly name: string;
  readonly categoryKey: string;
  readonly categoryLabel: string;
  readonly subcategory: string | null;
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  readonly videoUrl: string | null;
  readonly isActive: boolean;
  readonly issues: UlcExerciseCatalogImportIssue[];
}

interface GroupSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly exerciseId: string | null;
  readonly exerciseName: string | null;
  readonly groupId: string | null;
  readonly groupName: string | null;
}

interface ParameterSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly exerciseId: string | null;
  readonly exerciseName: string | null;
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly inputType: string;
  readonly defaultValue: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly stepValue: number | null;
  readonly isRequired: boolean;
  readonly sortOrder: number;
  readonly issues: readonly UlcExerciseCatalogImportIssue[];
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

export async function previewUlcExerciseCatalogImport(
  bytes: Uint8Array,
  catalog: UlcExerciseCatalogOverview,
): Promise<UlcExerciseCatalogImportPreview> {
  if (bytes.byteLength === 0) {
    throw new UlcExerciseCatalogImportFileError(
      "INVALID_XLSX",
      "Die XLSX-Datei ist leer.",
    );
  }
  if (bytes.byteLength > ULC_EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES) {
    throw new UlcExerciseCatalogImportFileError(
      "IMPORT_FILE_TOO_LARGE",
      "Die XLSX-Datei überschreitet 5 MB.",
    );
  }

  const workbook = await readWorkbook(bytes);
  validateWorkbookContract(workbook);

  const exerciseRows = dataRowsWithHeader(
    workbook.get("Übungen")!,
    ULC_EXERCISE_CATALOG_EXERCISE_HEADERS,
    "Übungen",
  );
  const groupRows = dataRowsWithHeader(
    workbook.get("Gruppen")!,
    ULC_EXERCISE_CATALOG_GROUP_HEADERS,
    "Gruppen",
  );
  const parameterRows = dataRowsWithHeader(
    workbook.get("Parameter")!,
    ULC_EXERCISE_CATALOG_PARAMETER_HEADERS,
    "Parameter",
  );

  if (exerciseRows.length > ULC_EXERCISE_CATALOG_IMPORT_MAX_EXERCISES) {
    throw new UlcExerciseCatalogImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält mehr als 1.000 Übungen.",
    );
  }
  if (groupRows.length + parameterRows.length > MAX_RELATION_ROWS) {
    throw new UlcExerciseCatalogImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält zu viele Gruppen- oder Parameterzeilen.",
    );
  }

  const globalIssues: UlcExerciseCatalogImportIssue[] = [];
  const exercises = exerciseRows.map(parseExerciseSource);
  const groups = groupRows.map(parseGroupSource);
  const parameters = parameterRows.map(parseParameterSource);

  const exerciseByKey = new Map<string, ExerciseSource[]>();
  for (const exercise of exercises) {
    const entries = exerciseByKey.get(exercise.recordKey) ?? [];
    entries.push(exercise);
    exerciseByKey.set(exercise.recordKey, entries);
  }
  for (const [recordKey, entries] of exerciseByKey) {
    if (recordKey.length === 0 || entries.length <= 1) continue;
    for (const entry of entries) {
      entry.issues.push(
        issue(
          "error",
          "DUPLICATE_RECORD_KEY",
          "Der Datensatz-Schlüssel kommt im Blatt Übungen mehrfach vor.",
          "Übungen",
          entry.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
    }
  }

  const groupsByKey = new Map<string, GroupSource[]>();
  for (const group of groups) {
    const owners = exerciseByKey.get(group.recordKey) ?? [];
    if (group.recordKey.length === 0 || owners.length !== 1) {
      globalIssues.push(
        issue(
          "error",
          "ORPHAN_GROUP_ROW",
          "Eine Gruppenzeile verweist auf keinen eindeutigen Übungs-Datensatz.",
          "Gruppen",
          group.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
      continue;
    }
    const values = groupsByKey.get(group.recordKey) ?? [];
    values.push(group);
    groupsByKey.set(group.recordKey, values);
  }

  const parametersByKey = new Map<string, ParameterSource[]>();
  for (const parameter of parameters) {
    const owners = exerciseByKey.get(parameter.recordKey) ?? [];
    if (parameter.recordKey.length === 0 || owners.length !== 1) {
      globalIssues.push(
        issue(
          "error",
          "ORPHAN_PARAMETER_ROW",
          "Eine Parameterzeile verweist auf keinen eindeutigen Übungs-Datensatz.",
          "Parameter",
          parameter.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
      continue;
    }
    const values = parametersByKey.get(parameter.recordKey) ?? [];
    values.push(parameter);
    parametersByKey.set(parameter.recordKey, values);
  }

  const existingById = new Map(catalog.items.map((item) => [item.id, item] as const));
  const existingByName = new Map<string, Array<UlcExerciseCatalogOverview["items"][number]>>();
  for (const item of catalog.items) {
    const key = normalizedName(item.name);
    const values = existingByName.get(key) ?? [];
    values.push(item);
    existingByName.set(key, values);
  }

  const rows: UlcExerciseCatalogImportPreviewRow[] = [];
  for (const source of exercises) {
    const rowIssues = [...source.issues];
    const resolvedGroups = resolveGroups(
      source,
      groupsByKey.get(source.recordKey) ?? [],
      catalog.trainingGroups,
      rowIssues,
    );
    const resolvedParameters = resolveParameters(
      parametersByKey.get(source.recordKey) ?? [],
      rowIssues,
    );

    const rawInput: CreateUlcExerciseCatalogItemInput = {
      name: source.name,
      categoryKey: source.categoryKey as UlcExerciseCategoryKey,
      subcategory: source.subcategory,
      goal: source.goal,
      description: source.description,
      coachingCues: source.coachingCues,
      commonMistakes: source.commonMistakes,
      equipment: source.equipment,
      videoUrl: source.videoUrl,
      groupIds: resolvedGroups,
      parameters: resolvedParameters,
      isActive: source.isActive,
    };

    let normalized: ReturnType<typeof createUlcExerciseCatalogItem> | null = null;
    try {
      normalized = createUlcExerciseCatalogItem(rawInput, {
        id: source.sourceId ?? previewIdentifier(source.recordKey, source.rowNumber),
        organizationId: "import-preview",
      });
    } catch (error) {
      rowIssues.push(
        issue(
          "error",
          "DOMAIN_VALIDATION",
          error instanceof UlcExerciseCatalogValidationError
            ? germanValidationMessage(error.message)
            : "Die Übungsdaten sind fachlich ungültig.",
          "Übungen",
          source.rowNumber,
          null,
        ),
      );
    }

    let existing: UlcExerciseCatalogOverview["items"][number] | null = null;
    if (source.sourceId !== null) {
      existing = existingById.get(source.sourceId) ?? null;
      if (existing === null) {
        rowIssues.push(
          issue(
            "error",
            "UNKNOWN_EXERCISE_ID",
            "Die angegebene ID gehört zu keiner sichtbaren bestehenden Übung. Für neue Übungen muss die ID leer bleiben.",
            "Übungen",
            source.rowNumber,
            "ID",
          ),
        );
      } else {
        const sameNameMatches = existingByName.get(normalizedName(source.name)) ?? [];
        if (sameNameMatches.some((candidate) => candidate.id !== existing!.id)) {
          rowIssues.push(
            issue(
              "error",
              "ID_NAME_CONFLICT",
              "ID und Name verweisen auf unterschiedliche bestehende Übungen.",
              "Übungen",
              source.rowNumber,
              "ID",
            ),
          );
        }
      }
    } else if (source.name.length > 0) {
      const matches = existingByName.get(normalizedName(source.name)) ?? [];
      if (matches.length === 1) {
        existing = matches[0]!;
        rowIssues.push(
          issue(
            "warning",
            "MATCHED_BY_NAME",
            "Die bestehende Übung wurde über den normalisierten Namen erkannt.",
            "Übungen",
            source.rowNumber,
            "Name",
          ),
        );
      } else if (matches.length > 1) {
        rowIssues.push(
          issue(
            "error",
            "AMBIGUOUS_NAME",
            "Der normalisierte Name ist nicht eindeutig.",
            "Übungen",
            source.rowNumber,
            "Name",
          ),
        );
      }
    }

    const hasErrors = rowIssues.some((candidate) => candidate.level === "error");
    let action: UlcExerciseCatalogImportAction;
    let reason: UlcExerciseCatalogImportPreviewRow["reason"];
    if (hasErrors || normalized === null) {
      action = "skip";
      reason = "invalid";
    } else if (existing === null) {
      action = "create";
      reason = "new";
    } else if (sameImportableExercise(existing, normalized)) {
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
        matchedExerciseId: existing?.id ?? null,
        action,
        reason,
        draft: draftFromSource(
          source,
          normalized,
          resolvedGroups,
          resolvedParameters,
          existing?.id ?? null,
        ),
        issues: Object.freeze(rowIssues),
      }),
    );
  }

  const allIssues = [...globalIssues, ...rows.flatMap((row) => row.issues)];
  return Object.freeze({
    contractVersion: ULC_EXERCISE_CATALOG_EXCHANGE_VERSION,
    applyAvailable: false,
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

function parseExerciseSource(row: SheetRow): ExerciseSource {
  const cells = padded(row.cells, ULC_EXERCISE_CATALOG_EXERCISE_HEADERS.length);
  const issues: UlcExerciseCatalogImportIssue[] = [];
  const active = parseBooleanCell(cells[12]!, true, "Übungen", row.rowNumber, "Aktiv", issues);
  const recordKey = normalizedCell(cells[0]!);
  if (recordKey.length === 0) {
    issues.push(issue("error", "MISSING_RECORD_KEY", "Der Datensatz-Schlüssel fehlt.", "Übungen", row.rowNumber, "Datensatz-Schlüssel"));
  }
  const sourceId = optionalCell(cells[1]!);
  const name = normalizedCell(cells[2]!);
  if (name.length === 0) {
    issues.push(issue("error", "MISSING_NAME", "Der Übungsname fehlt.", "Übungen", row.rowNumber, "Name"));
  }
  const categoryKey = normalizedCell(cells[3]!);
  if (!ULC_EXERCISE_CATEGORIES.some((category) => category.key === categoryKey)) {
    issues.push(
      issue(
        "error",
        "INVALID_CATEGORY",
        "Der Kategorie-Key ist nicht zulässig: " + (categoryKey || "(leer)") + ".",
        "Übungen",
        row.rowNumber,
        "Kategorie-Key",
      ),
    );
  }

  return {
    rowNumber: row.rowNumber,
    recordKey,
    sourceId,
    name,
    categoryKey,
    categoryLabel: normalizedCell(cells[4]!),
    subcategory: optionalCell(cells[5]!),
    goal: optionalCell(cells[6]!),
    description: optionalCell(cells[7]!),
    coachingCues: optionalCell(cells[8]!),
    commonMistakes: optionalCell(cells[9]!),
    equipment: Object.freeze(
      cells[10]!.split(";").map((value) => value.trim()).filter((value) => value.length > 0),
    ),
    videoUrl: optionalCell(cells[11]!),
    isActive: active,
    issues,
  };
}

function parseGroupSource(row: SheetRow): GroupSource {
  const cells = padded(row.cells, ULC_EXERCISE_CATALOG_GROUP_HEADERS.length);
  return Object.freeze({
    rowNumber: row.rowNumber,
    recordKey: normalizedCell(cells[0]!),
    exerciseId: optionalCell(cells[1]!),
    exerciseName: optionalCell(cells[2]!),
    groupId: optionalCell(cells[3]!),
    groupName: optionalCell(cells[4]!),
  });
}

function parseParameterSource(row: SheetRow): ParameterSource {
  const cells = padded(row.cells, ULC_EXERCISE_CATALOG_PARAMETER_HEADERS.length);
  const issues: UlcExerciseCatalogImportIssue[] = [];
  const minValue = parseOptionalNumber(cells[8]!, "Parameter", row.rowNumber, "Minimum", issues);
  const maxValue = parseOptionalNumber(cells[9]!, "Parameter", row.rowNumber, "Maximum", issues);
  const stepValue = parseOptionalNumber(cells[10]!, "Parameter", row.rowNumber, "Schrittweite", issues);
  const sortOrder = parseIntegerCell(cells[12]!, 0, "Parameter", row.rowNumber, "Reihenfolge", issues);
  const required = parseBooleanCell(cells[11]!, false, "Parameter", row.rowNumber, "Pflicht", issues);

  return Object.freeze({
    rowNumber: row.rowNumber,
    recordKey: normalizedCell(cells[0]!),
    exerciseId: optionalCell(cells[1]!),
    exerciseName: optionalCell(cells[2]!),
    key: normalizedCell(cells[3]!),
    label: normalizedCell(cells[4]!),
    unit: normalizedCell(cells[5]!),
    inputType: normalizedCell(cells[6]!).toLocaleLowerCase("de"),
    defaultValue: optionalCell(cells[7]!),
    minValue,
    maxValue,
    stepValue,
    isRequired: required,
    sortOrder,
    issues: Object.freeze(issues),
  });
}

function resolveGroups(
  source: ExerciseSource,
  rows: readonly GroupSource[],
  groups: readonly UlcExerciseCatalogTrainingGroup[],
  issues: UlcExerciseCatalogImportIssue[],
): readonly string[] {
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const byName = new Map<string, UlcExerciseCatalogTrainingGroup[]>();
  for (const group of groups) {
    for (const value of [group.name, group.shortName].filter(
      (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
    )) {
      const key = normalizedName(value);
      const entries = byName.get(key) ?? [];
      if (!entries.some((candidate) => candidate.id === group.id)) entries.push(group);
      byName.set(key, entries);
    }
  }

  const resolved: string[] = [];
  for (const row of rows) {
    if (row.exerciseId !== null && source.sourceId !== null && row.exerciseId !== source.sourceId) {
      issues.push(
        issue(
          "warning",
          "GROUP_EXERCISE_ID_MISMATCH",
          "Die Übungs-ID im Blatt Gruppen weicht von der Übungszeile ab; verknüpft wird ausschließlich über den Datensatz-Schlüssel.",
          "Gruppen",
          row.rowNumber,
          "Übungs-ID",
        ),
      );
    }

    let group: UlcExerciseCatalogTrainingGroup | null = null;
    if (row.groupId !== null) {
      group = byId.get(row.groupId) ?? null;
      if (group === null) {
        issues.push(issue("error", "UNKNOWN_GROUP", "Die Trainingsgruppe ist für diesen Benutzer nicht verfügbar.", "Gruppen", row.rowNumber, "Gruppen-ID"));
        continue;
      }
    } else if (row.groupName !== null) {
      const matches = byName.get(normalizedName(row.groupName)) ?? [];
      if (matches.length === 1) {
        group = matches[0]!;
      } else {
        issues.push(
          issue(
            "error",
            matches.length === 0 ? "UNKNOWN_GROUP" : "AMBIGUOUS_GROUP",
            matches.length === 0
              ? "Die Trainingsgruppe ist für diesen Benutzer nicht verfügbar."
              : "Der Trainingsgruppenname ist nicht eindeutig.",
            "Gruppen",
            row.rowNumber,
            "Trainingsgruppe",
          ),
        );
        continue;
      }
    } else {
      issues.push(issue("error", "MISSING_GROUP", "Gruppen-ID oder Trainingsgruppenname fehlt.", "Gruppen", row.rowNumber, "Gruppen-ID"));
      continue;
    }

    if (
      row.groupName !== null &&
      normalizedName(row.groupName) !== normalizedName(group.name) &&
      (group.shortName === null || normalizedName(row.groupName) !== normalizedName(group.shortName))
    ) {
      issues.push(
        issue(
          "warning",
          "GROUP_LABEL_MISMATCH",
          "Die lesbare Trainingsgruppenbezeichnung passt nicht zur Gruppen-ID; maßgeblich ist die serverautorisierte Gruppen-ID.",
          "Gruppen",
          row.rowNumber,
          "Trainingsgruppe",
        ),
      );
    }

    if (resolved.includes(group.id)) {
      issues.push(issue("warning", "DUPLICATE_GROUP", "Die Trainingsgruppe ist doppelt zugeordnet und wird nur einmal berücksichtigt.", "Gruppen", row.rowNumber, "Gruppen-ID"));
      continue;
    }
    resolved.push(group.id);
  }
  return Object.freeze(resolved.sort());
}

function resolveParameters(
  rows: readonly ParameterSource[],
  issues: UlcExerciseCatalogImportIssue[],
): readonly NonNullable<CreateUlcExerciseCatalogItemInput["parameters"]>[number][] {
  const result: NonNullable<CreateUlcExerciseCatalogItemInput["parameters"]>[number][] = [];
  const keys = new Set<string>();

  for (const row of rows) {
    issues.push(...row.issues);
    if (!ULC_EXERCISE_PARAMETER_KEYS.includes(row.key as UlcExerciseParameterKey)) {
      issues.push(issue("error", "INVALID_PARAMETER_KEY", "Der Parameter-Key ist nicht zulässig: " + (row.key || "(leer)") + ".", "Parameter", row.rowNumber, "Parameter-Key"));
      continue;
    }
    if (row.label.length === 0) {
      issues.push(issue("error", "MISSING_PARAMETER_LABEL", "Die Parameterbezeichnung fehlt.", "Parameter", row.rowNumber, "Bezeichnung"));
      continue;
    }
    if (row.inputType !== "number" && row.inputType !== "text") {
      issues.push(issue("error", "INVALID_PARAMETER_TYPE", "Der Parametertyp muss number oder text sein.", "Parameter", row.rowNumber, "Typ"));
      continue;
    }
    if (keys.has(row.key)) {
      issues.push(issue("error", "DUPLICATE_PARAMETER", "Der Parameter-Key kommt für diese Übung mehrfach vor.", "Parameter", row.rowNumber, "Parameter-Key"));
      continue;
    }
    keys.add(row.key);
    result.push(
      Object.freeze({
        key: row.key as UlcExerciseParameterKey,
        label: row.label,
        unit: row.unit,
        inputType: row.inputType as UlcExerciseParameterInputType,
        defaultValue: row.defaultValue,
        minValue: row.minValue,
        maxValue: row.maxValue,
        stepValue: row.stepValue,
        isRequired: row.isRequired,
        sortOrder: row.sortOrder,
      }),
    );
  }
  return Object.freeze(result);
}

function sameImportableExercise(
  existing: UlcExerciseCatalogOverview["items"][number],
  candidate: ReturnType<typeof createUlcExerciseCatalogItem>,
): boolean {
  return (
    existing.name === candidate.name &&
    existing.categoryKey === candidate.categoryKey &&
    existing.subcategory === candidate.subcategory &&
    existing.goal === candidate.goal &&
    existing.description === candidate.description &&
    existing.coachingCues === candidate.coachingCues &&
    existing.commonMistakes === candidate.commonMistakes &&
    arraysEqual(existing.equipment, candidate.equipment) &&
    existing.videoUrl === candidate.videoUrl &&
    arraysEqual(existing.groupIds, candidate.groupIds) &&
    JSON.stringify(existing.parameters) === JSON.stringify(candidate.parameters) &&
    existing.isActive === candidate.isActive
  );
}

function draftFromSource(
  source: ExerciseSource,
  normalized: ReturnType<typeof createUlcExerciseCatalogItem> | null,
  groupIds: readonly string[],
  parameters: readonly NonNullable<CreateUlcExerciseCatalogItemInput["parameters"]>[number][],
  matchedExerciseId: string | null,
): UlcExerciseCatalogImportDraft {
  if (normalized !== null) {
    return Object.freeze({
      id: matchedExerciseId ?? source.sourceId ?? "",
      name: normalized.name,
      categoryKey: normalized.categoryKey,
      subcategory: normalized.subcategory,
      goal: normalized.goal,
      description: normalized.description,
      coachingCues: normalized.coachingCues,
      commonMistakes: normalized.commonMistakes,
      equipment: normalized.equipment,
      videoUrl: normalized.videoUrl,
      groupIds: normalized.groupIds,
      parameters: normalized.parameters,
      isActive: normalized.isActive,
      isFavorite: false as const,
    });
  }

  return Object.freeze({
    id: matchedExerciseId ?? source.sourceId ?? "",
    name: source.name,
    categoryKey: source.categoryKey,
    subcategory: source.subcategory,
    goal: source.goal,
    description: source.description,
    coachingCues: source.coachingCues,
    commonMistakes: source.commonMistakes,
    equipment: source.equipment,
    videoUrl: source.videoUrl,
    groupIds,
    parameters: Object.freeze(
      parameters.map((parameter) =>
        Object.freeze({
          key: parameter.key,
          label: parameter.label,
          unit: parameter.unit ?? "",
          inputType: parameter.inputType,
          defaultValue: parameter.defaultValue ?? null,
          minValue: parameter.minValue ?? null,
          maxValue: parameter.maxValue ?? null,
          stepValue: parameter.stepValue ?? null,
          isRequired: parameter.isRequired ?? false,
          sortOrder: parameter.sortOrder ?? 0,
        }),
      ),
    ),
    isActive: source.isActive,
    isFavorite: false as const,
  });
}

function dataRowsWithHeader(
  rows: readonly SheetRow[],
  expectedHeader: readonly string[],
  sheet: string,
): readonly SheetRow[] {
  const nonEmpty = rows.filter((row) => row.cells.some((cell) => cell.trim().length > 0));
  const header = nonEmpty[0];
  if (header === undefined || !arraysEqual(trimTrailingEmpty(header.cells), expectedHeader)) {
    throw new UlcExerciseCatalogImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Das Blatt " + sheet + " hat nicht den erwarteten v1-Spaltenvertrag.",
    );
  }
  return Object.freeze(nonEmpty.slice(1));
}

function validateWorkbookContract(
  workbook: ReadonlyMap<string, readonly SheetRow[]>,
): void {
  for (const sheet of REQUIRED_SHEETS) {
    if (!workbook.has(sheet)) {
      throw new UlcExerciseCatalogImportFileError(
        "INVALID_EXCHANGE_CONTRACT",
        "Das erforderliche Blatt " + sheet + " fehlt.",
      );
    }
  }

  const notes = workbook.get("Hinweise")!;
  const contract = notes.find((row) => normalizedCell(row.cells[0] ?? "") === "AppBasis-Vertrag");
  if (
    contract === undefined ||
    normalizedCell(contract.cells[1] ?? "") !== ULC_EXERCISE_CATALOG_EXCHANGE_VERSION
  ) {
    throw new UlcExerciseCatalogImportFileError(
      "INVALID_EXCHANGE_CONTRACT",
      "Die XLSX-Datei verwendet nicht den unterstützten Exchange-v1-Vertrag.",
    );
  }
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
    if (error instanceof UlcExerciseCatalogImportFileError) throw error;
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
  issues: UlcExerciseCatalogImportIssue[],
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
  issues: UlcExerciseCatalogImportIssue[],
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
  issues: UlcExerciseCatalogImportIssue[],
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
): UlcExerciseCatalogImportIssue {
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

function germanValidationMessage(message: string): string {
  const known: Record<string, string> = {
    "Exercise category is invalid.": "Der Kategorie-Key ist ungültig.",
    "Exercise parameter key is invalid.": "Ein Parameter-Key ist ungültig.",
    "Exercise parameters contain a duplicate key.": "Ein Parameter-Key kommt mehrfach vor.",
    "Exercise parameter minimum must not exceed maximum.": "Das Parameter-Minimum darf das Maximum nicht überschreiten.",
    "Exercise parameter step must be greater than zero.": "Die Parameter-Schrittweite muss größer als null sein.",
    "Exercise parameter input type is invalid.": "Der Parametertyp ist ungültig.",
    "Numeric exercise parameter default value is invalid.": "Der Standardwert eines Zahlenparameters ist ungültig.",
    "Exercise video URL is invalid.": "Der Video-/Weblink ist ungültig.",
    "Exercise video URL must use HTTP or HTTPS.": "Der Video-/Weblink muss HTTP oder HTTPS verwenden.",
  };
  return known[message] ?? "Die Übungsdaten sind fachlich ungültig: " + message;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidXlsx("Ein XLSX-Bestandteil ist nicht gültig UTF-8-kodiert.");
  }
}

function invalidXlsx(message: string): UlcExerciseCatalogImportFileError {
  return new UlcExerciseCatalogImportFileError("INVALID_XLSX", message);
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

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  return (value ^ 0xffffffff) >>> 0;
}
