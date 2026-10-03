import type { AthleteMasterdataSnapshot } from "./postgres-masterdata-repository";

export const ATHLETES_EXCHANGE_VERSION = "appbasis.athletes.exchange/v1";
export const ATHLETES_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AthletesExchangeMode = "export" | "template";

export interface AthletesWorkbookSheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

export const ATHLETES_EXCHANGE_ATHLETE_HEADERS = Object.freeze([
  "Datensatz-Schlüssel",
  "ID",
  "Vorname",
  "Nachname",
  "Geburtsjahr",
  "Notizen",
  "Aktiv",
]);

export const ATHLETES_EXCHANGE_GROUP_HEADERS = Object.freeze([
  "Datensatz-Schlüssel",
  "Athleten-ID",
  "Athlet",
  "Gruppen-ID",
  "Trainingsgruppe",
  "Beginn",
  "Ende",
]);

export function buildAthletesExchangeSheets(
  snapshot: AthleteMasterdataSnapshot,
  mode: AthletesExchangeMode,
): readonly AthletesWorkbookSheet[] {
  const athletes: string[][] = [[...ATHLETES_EXCHANGE_ATHLETE_HEADERS]];
  const memberships: string[][] = [[...ATHLETES_EXCHANGE_GROUP_HEADERS]];
  const lists: string[][] = [["Typ", "Key / ID", "Bezeichnung", "Zusatz"]];

  const groupsById = new Map(
    snapshot.trainingGroups.map((group) => [group.id, group] as const),
  );

  if (mode === "template") {
    const exampleKey = "beispiel-1";
    athletes.push([
      exampleKey,
      "",
      "Max",
      "Mustermann",
      "2012",
      "Beispieldatensatz – vor echtem Import ersetzen oder löschen.",
      "ja",
    ]);

    const firstActiveGroup = snapshot.trainingGroups.find(
      (group) => group.isActive,
    );
    if (firstActiveGroup !== undefined) {
      memberships.push([
        exampleKey,
        "",
        "Mustermann, Max",
        firstActiveGroup.id,
        firstActiveGroup.name,
        "2026-01-01",
        "",
      ]);
    }
  } else {
    const orderedAthletes = [...snapshot.athletes].sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.lastName.localeCompare(right.lastName, "de", { sensitivity: "base" }) ||
        left.firstName.localeCompare(right.firstName, "de", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id),
    );
    const recordKeys = new Map<string, string>();

    for (const [index, athlete] of orderedAthletes.entries()) {
      const recordKey = `row-${String(index + 1).padStart(4, "0")}`;
      recordKeys.set(athlete.id, recordKey);
      athletes.push([
        recordKey,
        athlete.id,
        athlete.firstName,
        athlete.lastName,
        athlete.birthYear === null ? "" : String(athlete.birthYear),
        athlete.notes ?? "",
        athlete.isActive ? "ja" : "nein",
      ]);
    }

    const orderedMemberships = [...snapshot.athleteGroupMemberships].sort(
      (left, right) =>
        left.athleteId.localeCompare(right.athleteId) ||
        left.startedOn.localeCompare(right.startedOn) ||
        left.groupId.localeCompare(right.groupId),
    );
    const athleteById = new Map(
      snapshot.athletes.map((athlete) => [athlete.id, athlete] as const),
    );
    for (const membership of orderedMemberships) {
      const recordKey = recordKeys.get(membership.athleteId);
      const athlete = athleteById.get(membership.athleteId);
      if (recordKey === undefined || athlete === undefined) continue;
      const group = groupsById.get(membership.groupId);
      memberships.push([
        recordKey,
        membership.athleteId,
        `${athlete.lastName}, ${athlete.firstName}`,
        membership.groupId,
        group?.name ?? "",
        membership.startedOn,
        membership.endedOn ?? "",
      ]);
    }
  }

  for (const group of [...snapshot.trainingGroups].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, "de", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
  )) {
    lists.push([
      "Trainingsgruppe",
      group.id,
      group.name,
      [
        group.shortName ?? "",
        group.isActive ? "aktiv" : "inaktiv",
      ].filter(Boolean).join(" · "),
    ]);
  }

  const notes: string[][] = [
    ["Hinweis", "Wert"],
    ["AppBasis-Vertrag", ATHLETES_EXCHANGE_VERSION],
    [
      "Status",
      mode === "template"
        ? "Importvorlage – in E6F4A nur Download; Vorschau und Apply folgen separat."
        : "Export – diese Datei verändert keine Stammdaten.",
    ],
    [
      "Datensatz-Schlüssel",
      "Innerhalb der Datei eindeutig. Verknüpft Athleten mit ihren Gruppenzugehörigkeiten.",
    ],
    [
      "ID",
      "Bei neuen Athleten leer lassen. Bestehende IDs werden exportiert und dienen später der Update-Erkennung.",
    ],
    [
      "Trainingsgruppen",
      "Gruppen werden nicht durch diese Datei angelegt. Erlaubte Gruppen stehen im Blatt Listen.",
    ],
    [
      "Beginn / Ende",
      "Gruppenzugehörigkeiten verwenden Datumswerte im Format YYYY-MM-DD. Ende darf leer sein.",
    ],
    [
      "Aktiv",
      "ja/nein. E6F4A schreibt noch keine Daten; der spätere Import behandelt Archivstatus ausdrücklich fail-closed.",
    ],
    [
      "Sicherheit",
      "Die Datei enthält keine Organisations-ID, Actor-ID oder Trainer-/Benutzerinformationen.",
    ],
    [
      "Hinweis",
      "Spaltennamen und Blattnamen nicht ändern; sie bilden den stabilen v1-Exchange-Vertrag.",
    ],
  ];

  return Object.freeze([
    Object.freeze({ name: "Athleten", rows: freezeRows(athletes) }),
    Object.freeze({ name: "Gruppen", rows: freezeRows(memberships) }),
    Object.freeze({ name: "Listen", rows: freezeRows(lists) }),
    Object.freeze({ name: "Hinweise", rows: freezeRows(notes) }),
  ]);
}

export function createAthletesWorkbook(
  snapshot: AthleteMasterdataSnapshot,
  mode: AthletesExchangeMode,
): Uint8Array {
  const sheets = buildAthletesExchangeSheets(snapshot, mode);
  const files: { readonly name: string; readonly content: Uint8Array }[] = [
    { name: "[Content_Types].xml", content: utf8(contentTypesXml(sheets.length)) },
    { name: "_rels/.rels", content: utf8(rootRelationshipsXml()) },
    { name: "xl/workbook.xml", content: utf8(workbookXml(sheets)) },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: utf8(workbookRelationshipsXml(sheets.length)),
    },
    { name: "xl/styles.xml", content: utf8(stylesXml()) },
  ];

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

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function xmlEscape(value: string): string {
  return xml10SafeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xml10SafeText(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) continue;
    if (codePoint > 0xffff) index += 1;

    const allowed =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);

    result += allowed ? String.fromCodePoint(codePoint) : "\ufffd";
  }
  return result;
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
  sheets: readonly AthletesWorkbookSheet[],
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
