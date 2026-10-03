import {
  ULC_EXERCISE_CATEGORIES,
  ULC_EXERCISE_PARAMETER_KEYS,
  type UlcExerciseParameterKey,
} from "./exercise-catalog-domain";
import type {
  UlcExerciseCatalogOverview,
} from "./exercise-catalog-service";

export const ULC_EXERCISE_CATALOG_EXCHANGE_VERSION =
  "appbasis.exercise-catalog.exchange/v1";

export const ULC_EXERCISE_CATALOG_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type UlcExerciseCatalogExchangeMode = "export" | "template";

export interface UlcExerciseCatalogWorkbookSheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

const EXERCISE_HEADERS = Object.freeze([
  "Datensatz-Schlüssel",
  "ID",
  "Name",
  "Kategorie-Key",
  "Kategorie",
  "Unterkategorie",
  "Trainingsziel",
  "Beschreibung / Ausführung",
  "Trainerhinweise",
  "Typische Fehler",
  "Material",
  "Video- / Weblink",
  "Aktiv",
]);

const GROUP_HEADERS = Object.freeze([
  "Datensatz-Schlüssel",
  "Übungs-ID",
  "Übung",
  "Gruppen-ID",
  "Trainingsgruppe",
]);

const PARAMETER_HEADERS = Object.freeze([
  "Datensatz-Schlüssel",
  "Übungs-ID",
  "Übung",
  "Parameter-Key",
  "Bezeichnung",
  "Einheit",
  "Typ",
  "Standardwert",
  "Minimum",
  "Maximum",
  "Schrittweite",
  "Pflicht",
  "Reihenfolge",
]);

const PARAMETER_META: Readonly<
  Record<
    UlcExerciseParameterKey,
    {
      readonly label: string;
      readonly unit: string;
      readonly inputType: "number" | "text";
    }
  >
> = Object.freeze({
  sets: Object.freeze({ label: "Sätze", unit: "", inputType: "number" }),
  repetitions: Object.freeze({ label: "Wiederholungen", unit: "", inputType: "number" }),
  distance_m: Object.freeze({ label: "Distanz", unit: "m", inputType: "number" }),
  weight_kg: Object.freeze({ label: "Gewicht", unit: "kg", inputType: "number" }),
  duration_s: Object.freeze({ label: "Dauer", unit: "s", inputType: "number" }),
  target_time_s: Object.freeze({ label: "Zielzeit", unit: "s", inputType: "number" }),
  intensity_percent: Object.freeze({ label: "Intensität", unit: "%", inputType: "number" }),
  rest_s: Object.freeze({ label: "Pause", unit: "s", inputType: "number" }),
  series_rest_s: Object.freeze({ label: "Serienpause", unit: "s", inputType: "number" }),
  approach_distance_m: Object.freeze({ label: "Anlauf", unit: "m", inputType: "number" }),
  flying_distance_m: Object.freeze({ label: "Fliegende Distanz", unit: "m", inputType: "number" }),
  contacts: Object.freeze({ label: "Kontakte", unit: "", inputType: "number" }),
  resistance_kg: Object.freeze({ label: "Widerstand", unit: "kg", inputType: "number" }),
  height_cm: Object.freeze({ label: "Höhe", unit: "cm", inputType: "number" }),
  tempo_text: Object.freeze({ label: "Tempo", unit: "", inputType: "text" }),
  surface_text: Object.freeze({ label: "Untergrund", unit: "", inputType: "text" }),
  start_position_text: Object.freeze({ label: "Startposition", unit: "", inputType: "text" }),
  note_text: Object.freeze({ label: "Zusatzhinweis", unit: "", inputType: "text" }),
});

const PARAMETER_KEYS = ULC_EXERCISE_PARAMETER_KEYS;

export function buildUlcExerciseCatalogExchangeSheets(
  catalog: UlcExerciseCatalogOverview,
  mode: UlcExerciseCatalogExchangeMode,
): readonly UlcExerciseCatalogWorkbookSheet[] {
  const categoryLabels = new Map(
    ULC_EXERCISE_CATEGORIES.map(
      (category) => [category.key, category.label] as const,
    ),
  );
  const groupLabels = new Map(
    catalog.trainingGroups.map(
      (group) => [group.id, group.name] as const,
    ),
  );

  const exercises: string[][] = [[...EXERCISE_HEADERS]];
  const groups: string[][] = [[...GROUP_HEADERS]];
  const parameters: string[][] = [[...PARAMETER_HEADERS]];

  if (mode === "template") {
    const exampleKey = "beispiel-1";
    exercises.push([
      exampleKey,
      "",
      "Fliegende 30 m",
      "max_velocity",
      categoryLabels.get("max_velocity") ?? "Maximalgeschwindigkeit",
      "Fliegend",
      "Maximalgeschwindigkeit",
      "20 m Anlauf, anschließend 30 m maximal schnell bei sauberer Technik.",
      "Locker bleiben und aktiv nach hinten arbeiten.",
      "Verkrampfte Schultern; zu frühes Abbremsen.",
      "Hütchen; Markierungen",
      "",
      "ja",
    ]);

    const firstGroup = catalog.trainingGroups[0];
    if (firstGroup !== undefined) {
      groups.push([
        exampleKey,
        "",
        "Fliegende 30 m",
        firstGroup.id,
        firstGroup.name,
      ]);
    }

    parameters.push([
      exampleKey,
      "",
      "Fliegende 30 m",
      "distance_m",
      "Distanz",
      "m",
      "number",
      "30",
      "10",
      "80",
      "5",
      "ja",
      "10",
    ]);
  } else {
    const items = [...catalog.items].sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.name.localeCompare(right.name, "de", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id),
    );

    for (const [index, item] of items.entries()) {
      const recordKey = `row-${String(index + 1).padStart(4, "0")}`;
      exercises.push([
        recordKey,
        item.id,
        item.name,
        item.categoryKey,
        categoryLabels.get(item.categoryKey) ?? item.categoryKey,
        item.subcategory ?? "",
        item.goal ?? "",
        item.description ?? "",
        item.coachingCues ?? "",
        item.commonMistakes ?? "",
        item.equipment.join("; "),
        item.videoUrl ?? "",
        item.isActive ? "ja" : "nein",
      ]);

      for (const groupId of item.groupIds) {
        groups.push([
          recordKey,
          item.id,
          item.name,
          groupId,
          groupLabels.get(groupId) ?? "",
        ]);
      }

      for (const parameter of [...item.parameters].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.key.localeCompare(right.key),
      )) {
        parameters.push([
          recordKey,
          item.id,
          item.name,
          parameter.key,
          parameter.label,
          parameter.unit,
          parameter.inputType,
          parameter.defaultValue ?? "",
          optionalNumber(parameter.minValue),
          optionalNumber(parameter.maxValue),
          optionalNumber(parameter.stepValue),
          parameter.isRequired ? "ja" : "nein",
          String(parameter.sortOrder),
        ]);
      }
    }
  }

  const lists: string[][] = [["Typ", "Key / ID", "Bezeichnung", "Zusatz"]];
  for (const category of ULC_EXERCISE_CATEGORIES) {
    lists.push(["Kategorie", category.key, category.label, ""]);
  }
  for (const group of catalog.trainingGroups) {
    lists.push([
      "Trainingsgruppe",
      group.id,
      group.name,
      group.shortName ?? "",
    ]);
  }
  for (const key of PARAMETER_KEYS) {
    const meta = PARAMETER_META[key];
    lists.push([
      "Planungsparameter",
      key,
      meta.label,
      [meta.unit, meta.inputType].filter(Boolean).join(" / "),
    ]);
  }

  const notes: string[][] = [
    ["Hinweis", "Wert"],
    ["AppBasis-Vertrag", ULC_EXERCISE_CATALOG_EXCHANGE_VERSION],
    [
      "Status",
      mode === "template"
        ? "Importvorlage – E6F1 ist read-only; ein Import wird erst in E6F2/E6F3 aktiviert."
        : "Export – E6F1 ist read-only; diese Datei verändert keine Katalogdaten.",
    ],
    [
      "Datensatz-Schlüssel",
      "Innerhalb der Datei eindeutig. Verknüpft Übungen mit den Blättern Gruppen und Parameter.",
    ],
    [
      "ID",
      "Bei neuen Übungen leer lassen. Bestehende IDs werden exportiert und dienen später der Update-Erkennung.",
    ],
    [
      "Kategorie-Key",
      "Verbindlicher maschinenlesbarer Wert aus dem Blatt Listen. Die ausgeschriebene Kategorie ist nur Lesehilfe.",
    ],
    [
      "Material",
      "Mehrere Einträge mit Semikolon trennen.",
    ],
    [
      "Trainingsgruppen",
      "Zuordnungen ausschließlich im Blatt Gruppen pflegen. Keine Zeile bedeutet vereinsweit / alle Gruppen.",
    ],
    [
      "Planungsparameter",
      "Parameter ausschließlich im Blatt Parameter pflegen. Erlaubte Keys stehen im Blatt Listen.",
    ],
    [
      "Sicherheit",
      "Die Datei enthält keine interne Organisations-ID, Actor-ID oder persönlichen Favoriten.",
    ],
    [
      "Hinweis",
      "Spaltennamen und Blattnamen nicht ändern; E6F2 verwendet diesen stabilen v1-Vertrag für die Vorschau.",
    ],
  ];

  return Object.freeze([
    Object.freeze({ name: "Übungen", rows: freezeRows(exercises) }),
    Object.freeze({ name: "Gruppen", rows: freezeRows(groups) }),
    Object.freeze({ name: "Parameter", rows: freezeRows(parameters) }),
    Object.freeze({ name: "Listen", rows: freezeRows(lists) }),
    Object.freeze({ name: "Hinweise", rows: freezeRows(notes) }),
  ]);
}

export function createUlcExerciseCatalogWorkbook(
  catalog: UlcExerciseCatalogOverview,
  mode: UlcExerciseCatalogExchangeMode,
): Uint8Array {
  const sheets = buildUlcExerciseCatalogExchangeSheets(catalog, mode);
  const files: { readonly name: string; readonly content: Uint8Array }[] = [];

  files.push({
    name: "[Content_Types].xml",
    content: utf8(contentTypesXml(sheets.length)),
  });
  files.push({
    name: "_rels/.rels",
    content: utf8(rootRelationshipsXml()),
  });
  files.push({
    name: "xl/workbook.xml",
    content: utf8(workbookXml(sheets)),
  });
  files.push({
    name: "xl/_rels/workbook.xml.rels",
    content: utf8(workbookRelationshipsXml(sheets.length)),
  });
  files.push({
    name: "xl/styles.xml",
    content: utf8(stylesXml()),
  });

  sheets.forEach((sheet, index) => {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: utf8(worksheetXml(sheet.rows)),
    });
  });

  return zipStored(files);
}

function freezeRows(rows: string[][]): readonly (readonly string[])[] {
  return Object.freeze(rows.map((row) => Object.freeze([...row])));
}

function optionalNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function worksheetXml(rows: readonly (readonly string[])[]): string {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowCount = Math.max(1, rows.length);
  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = Math.max(
      12,
      ...rows.map((row) => {
        const value = row[columnIndex] ?? "";
        return Math.min(48, Math.max(...value.split(/\r?\n/).map((line) => line.length), 0) + 2);
      }),
    );
    return Math.min(width, 48);
  });

  const columns = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");

  const data = rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
        const style = rowIndex === 0 ? ' s="1"' : "";
        const value = xmlEscape(row[columnIndex] ?? "");
        return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${value}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(columnCount - 1)}${rowCount}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${data}</sheetData>
  <autoFilter ref="A1:${columnName(columnCount - 1)}${rowCount}"/>
</worksheet>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets}
</Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(
  sheets: readonly UlcExerciseCatalogWorkbookSheet[],
): string {
  const sheetXml = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetXml}</sheets>
</workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><name val="Aptos"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function zipStored(
  files: readonly { readonly name: string; readonly content: Uint8Array }[],
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const file of files) {
    const name = utf8(file.name);
    const checksum = crc32(file.content);

    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.content.length, true);
    localView.setUint32(22, file.content.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);

    localParts.push(localHeader, file.content);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.content.length, true);
    centralView.setUint32(24, file.content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(name, 46);

    centralParts.push(centralHeader);
    centralSize += centralHeader.length;
    localOffset += localHeader.length + file.content.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

const CRC32_TABLE = (() => {
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

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  }
  return (value ^ 0xffffffff) >>> 0;
}
