import {
  XlsxReadError,
  readXlsxWorkbook,
  type XlsxSheetRow,
} from "@appbasis/xlsx";

import {
  ULC_EXERCISE_CATEGORIES,
  ULC_EXERCISE_DIFFICULTIES,
  ULC_EXERCISE_PARAMETER_KEYS,
  UlcExerciseCatalogValidationError,
  createUlcExerciseCatalogItem,
  type CreateUlcExerciseCatalogItemInput,
  type UlcExerciseCategoryKey,
  type UlcExerciseDifficultyKey,
  type UlcExerciseParameterInputType,
  type UlcExerciseParameterKey,
} from "./exercise-catalog-domain";
import {
  ULC_EXERCISE_CATALOG_EXCHANGE_VERSION,
  ULC_EXERCISE_CATALOG_LEGACY_EXCHANGE_VERSION,
  ULC_EXERCISE_CATALOG_EXERCISE_HEADERS,
  ULC_EXERCISE_CATALOG_EXTENSION_HEADERS,
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

const REQUIRED_SHEETS = Object.freeze([
  "Übungen",
  "Gruppen",
  "Parameter",
  "Listen",
  "Hinweise",
]);

const V2_REQUIRED_SHEETS = Object.freeze([
  ...REQUIRED_SHEETS,
  "Erweiterungen",
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
  readonly difficultyKey: string | null;
  readonly goal: string | null;
  readonly description: string | null;
  readonly coachingCues: string | null;
  readonly commonMistakes: string | null;
  readonly equipment: readonly string[];
  readonly videoUrl: string | null;
  readonly videoUrls: readonly string[];
  readonly groupIds: readonly string[];
  readonly similarExerciseIds: readonly string[];
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

type SheetRow = XlsxSheetRow;

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

interface ExtensionSource {
  readonly rowNumber: number;
  readonly recordKey: string;
  readonly difficultyKey: string | null;
  readonly additionalVideoUrls: readonly string[];
  readonly similarExerciseIds: readonly string[];
  readonly issues: readonly UlcExerciseCatalogImportIssue[];
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
  const contractVersion = validateWorkbookContract(workbook);

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
  const extensionRows =
    contractVersion === ULC_EXERCISE_CATALOG_EXCHANGE_VERSION
      ? dataRowsWithHeader(
          workbook.get("Erweiterungen")!,
          ULC_EXERCISE_CATALOG_EXTENSION_HEADERS,
          "Erweiterungen",
        )
      : [];

  if (exerciseRows.length > ULC_EXERCISE_CATALOG_IMPORT_MAX_EXERCISES) {
    throw new UlcExerciseCatalogImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält mehr als 1.000 Übungen.",
    );
  }
  if (
    groupRows.length + parameterRows.length + extensionRows.length >
    MAX_RELATION_ROWS
  ) {
    throw new UlcExerciseCatalogImportFileError(
      "IMPORT_ROW_LIMIT_EXCEEDED",
      "Die Importdatei enthält zu viele Gruppen- oder Parameterzeilen.",
    );
  }

  const globalIssues: UlcExerciseCatalogImportIssue[] = [];
  const exercises = exerciseRows.map(parseExerciseSource);
  const groups = groupRows.map(parseGroupSource);
  const parameters = parameterRows.map(parseParameterSource);
  const extensions = extensionRows.map(parseExtensionSource);

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

  const extensionsByKey = new Map<string, ExtensionSource>();
  for (const extension of extensions) {
    const owners = exerciseByKey.get(extension.recordKey) ?? [];
    if (extension.recordKey.length === 0 || owners.length !== 1) {
      globalIssues.push(
        issue(
          "error",
          "ORPHAN_EXTENSION_ROW",
          "Eine Erweiterungszeile verweist auf keinen eindeutigen Übungs-Datensatz.",
          "Erweiterungen",
          extension.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
      continue;
    }
    if (extensionsByKey.has(extension.recordKey)) {
      globalIssues.push(
        issue(
          "error",
          "DUPLICATE_EXTENSION_ROW",
          "Für eine Übung darf es nur eine Erweiterungszeile geben.",
          "Erweiterungen",
          extension.rowNumber,
          "Datensatz-Schlüssel",
        ),
      );
      continue;
    }
    extensionsByKey.set(extension.recordKey, extension);
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

    const unchanged =
      normalized !== null &&
      existing !== null &&
      sameImportableExercise(existing, normalized);
    if (
      normalized !== null &&
      normalized.isActive === false &&
      !unchanged &&
      !rowIssues.some((candidate) => candidate.level === "error")
    ) {
      rowIssues.push(
        issue(
          "error",
          "INACTIVE_IMPORT_MUTATION_UNSUPPORTED",
          "Inaktive Übungen können im kontrollierten Import nur unverändert übersprungen werden. Aktivieren, Deaktivieren oder Ändern archivierter Übungen bleibt ein eigener Vorgang.",
          "Übungen",
          source.rowNumber,
          "Aktiv",
        ),
      );
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
    } else if (unchanged) {
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

export async function createUlcExerciseCatalogImportPreviewToken(
  bytes: Uint8Array,
  catalog: UlcExerciseCatalogOverview,
  organizationId: string,
): Promise<string> {
  const fileDigest = await sha256Hex(bytes);
  const catalogState = JSON.stringify({
    organizationId,
    items: [...catalog.items]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        categoryKey: item.categoryKey,
        subcategory: item.subcategory,
        goal: item.goal,
        description: item.description,
        coachingCues: item.coachingCues,
        commonMistakes: item.commonMistakes,
        equipment: [...item.equipment],
        videoUrl: item.videoUrl,
        groupIds: [...item.groupIds],
        parameters: item.parameters.map((parameter) => ({
          key: parameter.key,
          label: parameter.label,
          unit: parameter.unit,
          inputType: parameter.inputType,
          defaultValue: parameter.defaultValue,
          minValue: parameter.minValue,
          maxValue: parameter.maxValue,
          stepValue: parameter.stepValue,
          isRequired: parameter.isRequired,
          sortOrder: parameter.sortOrder,
        })),
        isActive: item.isActive,
      })),
    trainingGroups: [...catalog.trainingGroups]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((group) => ({
        id: group.id,
        name: group.name,
        shortName: group.shortName,
        sortOrder: group.sortOrder,
      })),
  });
  const stateDigest = await sha256Hex(new TextEncoder().encode(catalogState));
  const tokenSource = new TextEncoder().encode(
    "appbasis.exercise-catalog.import-apply/v1\n" +
      fileDigest +
      "\n" +
      stateDigest,
  );
  return "e6f3-v1." + (await sha256Hex(tokenSource));
}

export function ulcExerciseCatalogImportDraftToInput(
  draft: UlcExerciseCatalogImportDraft,
): CreateUlcExerciseCatalogItemInput {
  return {
    name: draft.name,
    categoryKey: draft.categoryKey as UlcExerciseCategoryKey,
    subcategory: draft.subcategory,
    goal: draft.goal,
    description: draft.description,
    coachingCues: draft.coachingCues,
    commonMistakes: draft.commonMistakes,
    equipment: draft.equipment,
    videoUrl: draft.videoUrl,
    groupIds: draft.groupIds,
    parameters: draft.parameters.map((parameter) => ({
      key: parameter.key as UlcExerciseParameterKey,
      label: parameter.label,
      unit: parameter.unit,
      inputType: parameter.inputType as UlcExerciseParameterInputType,
      defaultValue: parameter.defaultValue,
      minValue: parameter.minValue,
      maxValue: parameter.maxValue,
      stepValue: parameter.stepValue,
      isRequired: parameter.isRequired,
      sortOrder: parameter.sortOrder,
    })),
    isActive: draft.isActive,
  };
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
  try {
    return await readXlsxWorkbook(bytes, {
      sheetNames: REQUIRED_SHEETS,
      decodeDates: false,
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

function invalidXlsx(message: string): UlcExerciseCatalogImportFileError {
  return new UlcExerciseCatalogImportFileError("INVALID_XLSX", message);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
