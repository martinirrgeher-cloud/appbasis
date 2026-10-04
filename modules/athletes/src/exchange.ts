import {
  createStoredXlsxZip as zipStored,
  xlsxColumnName as columnName,
  xlsxUtf8 as utf8,
  xlsxXmlEscape as xmlEscape,
} from "@appbasis/xlsx";

import type { AthleteMasterdataSnapshot } from "./postgres-masterdata-repository";

export const ATHLETES_EXCHANGE_VERSION = "appbasis.athletes.exchange/v2";
export const ATHLETES_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AthletesExchangeMode = "export" | "template";

export interface AthletesWorkbookSheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

export const ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS = Object.freeze([
  "Vorname",
  "Nachname",
  "Geburtsjahr",
  "Notizen",
]);

export const ATHLETES_EXCHANGE_GROUP_HEADER_PREFIX = "Trainingsgruppe ";
export const ATHLETES_EXCHANGE_ID_HEADER = "__AppBasis-Athleten-ID";
export const ATHLETES_EXCHANGE_ACTIVE_HEADER = "__AppBasis-Aktiv";
export const ATHLETES_EXCHANGE_CONTRACT_HEADER = "__AppBasis-Vertrag";
export const ATHLETES_EXCHANGE_GROUP_LIST_HEADER = "__AppBasis-Gruppenliste";
export const ATHLETES_EXCHANGE_MIN_GROUP_SLOTS = 3;

interface AthletesSheetBuild {
  readonly rows: readonly (readonly string[])[];
  readonly groupSlotCount: number;
  readonly activeGroupCount: number;
}

export function buildAthletesExchangeSheets(
  snapshot: AthleteMasterdataSnapshot,
  mode: AthletesExchangeMode,
): readonly AthletesWorkbookSheet[] {
  const sheet = buildAthletesSheet(snapshot, mode);
  return Object.freeze([
    Object.freeze({ name: "Athleten", rows: sheet.rows }),
  ]);
}

export function createAthletesWorkbook(
  snapshot: AthleteMasterdataSnapshot,
  mode: AthletesExchangeMode,
): Uint8Array {
  const sheet = buildAthletesSheet(snapshot, mode);
  const files: { readonly name: string; readonly content: Uint8Array }[] = [
    { name: "[Content_Types].xml", content: utf8(contentTypesXml()) },
    { name: "_rels/.rels", content: utf8(rootRelationshipsXml()) },
    { name: "xl/workbook.xml", content: utf8(workbookXml()) },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: utf8(workbookRelationshipsXml()),
    },
    { name: "xl/styles.xml", content: utf8(stylesXml()) },
    {
      name: "xl/worksheets/sheet1.xml",
      content: utf8(
        worksheetXml(
          sheet.rows,
          sheet.groupSlotCount,
          sheet.activeGroupCount,
        ),
      ),
    },
  ];
  return zipStored(files);
}

function buildAthletesSheet(
  snapshot: AthleteMasterdataSnapshot,
  mode: AthletesExchangeMode,
): AthletesSheetBuild {
  const membershipsByAthlete = new Map<
    string,
    (typeof snapshot.athleteGroupMemberships)[number][]
  >();
  for (const membership of snapshot.athleteGroupMemberships) {
    if (membership.endedOn !== null) continue;
    const values = membershipsByAthlete.get(membership.athleteId) ?? [];
    values.push(membership);
    membershipsByAthlete.set(membership.athleteId, values);
  }

  const maxCurrentGroups = Math.max(
    0,
    ...[...membershipsByAthlete.values()].map((values) => values.length),
  );
  const groupSlotCount = Math.max(
    ATHLETES_EXCHANGE_MIN_GROUP_SLOTS,
    maxCurrentGroups + 2,
  );
  const groupHeaders = Array.from(
    { length: groupSlotCount },
    (_, index) => ATHLETES_EXCHANGE_GROUP_HEADER_PREFIX + String(index + 1),
  );
  const header = [
    ...ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS,
    ...groupHeaders,
    ATHLETES_EXCHANGE_ID_HEADER,
    ATHLETES_EXCHANGE_ACTIVE_HEADER,
    ATHLETES_EXCHANGE_CONTRACT_HEADER,
    ATHLETES_EXCHANGE_GROUP_LIST_HEADER,
  ];
  const rows: string[][] = [header];

  const groupsById = new Map(
    snapshot.trainingGroups.map((group) => [group.id, group] as const),
  );

  if (mode === "template") {
    const firstActiveGroup = [...snapshot.trainingGroups]
      .filter((group) => group.isActive)
      .sort(compareGroups)[0];
    rows.push([
      "Max",
      "Mustermann",
      "2012",
      "Beispieldatensatz – vor echtem Import ersetzen oder löschen.",
      ...Array.from(
        { length: groupSlotCount },
        (_, index) => index === 0 ? firstActiveGroup?.name ?? "" : "",
      ),
      "",
      "ja",
      ATHLETES_EXCHANGE_VERSION,
      "",
    ]);
  } else {
    const orderedAthletes = [...snapshot.athletes].sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.lastName.localeCompare(right.lastName, "de", { sensitivity: "base" }) ||
        left.firstName.localeCompare(right.firstName, "de", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id),
    );

    for (const athlete of orderedAthletes) {
      const activeMemberships = [
        ...(membershipsByAthlete.get(athlete.id) ?? []),
      ].sort(
        (left, right) =>
          (groupsById.get(left.groupId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            (groupsById.get(right.groupId)?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          left.groupId.localeCompare(right.groupId),
      );
      const groupNames = activeMemberships
        .map((membership) => groupsById.get(membership.groupId)?.name ?? "")
        .filter((value) => value.length > 0);

      rows.push([
        athlete.firstName,
        athlete.lastName,
        athlete.birthYear === null ? "" : String(athlete.birthYear),
        athlete.notes ?? "",
        ...Array.from(
          { length: groupSlotCount },
          (_, index) => groupNames[index] ?? "",
        ),
        athlete.id,
        athlete.isActive ? "ja" : "nein",
        rows.length === 1 ? ATHLETES_EXCHANGE_VERSION : "",
        "",
      ]);
    }
  }

  const activeGroups = [...snapshot.trainingGroups]
    .filter((group) => group.isActive)
    .sort(compareGroups);
  const idIndex =
    ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS.length + groupSlotCount;
  const contractIndex = idIndex + 2;
  const groupListIndex = idIndex + 3;
  const minimumRows = Math.max(2, activeGroups.length + 1);
  while (rows.length < minimumRows) {
    rows.push(Array.from({ length: header.length }, () => ""));
  }
  rows[1]![contractIndex] = ATHLETES_EXCHANGE_VERSION;
  for (const [index, group] of activeGroups.entries()) {
    rows[index + 1]![groupListIndex] = group.name;
  }

  return Object.freeze({
    rows: freezeRows(rows),
    groupSlotCount,
    activeGroupCount: activeGroups.length,
  });
}

function compareGroups(
  left: AthleteMasterdataSnapshot["trainingGroups"][number],
  right: AthleteMasterdataSnapshot["trainingGroups"][number],
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name, "de", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id)
  );
}

function freezeRows(rows: string[][]): readonly (readonly string[])[] {
  return Object.freeze(rows.map((row) => Object.freeze([...row])));
}

function worksheetXml(
  rows: readonly (readonly string[])[],
  groupSlotCount: number,
  activeGroupCount: number,
): string {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowCount = Math.max(1, rows.length);
  const visibleColumnCount =
    ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS.length + groupSlotCount;
  const groupListColumnIndex = visibleColumnCount + 3;

  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = Math.max(
      12,
      ...rows.map((row) => {
        const value = row[columnIndex] ?? "";
        return Math.min(
          48,
          Math.max(...value.split(/\r?\n/).map((line) => line.length), 0) + 2,
        );
      }),
    );
    return Math.min(width, 48);
  });

  const columns = widths
    .map((width, index) => {
      const hidden = index >= visibleColumnCount ? ' hidden="1"' : "";
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"${hidden}/>`;
    })
    .join("");

  const data = rows
    .map((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
        const style = rowIndex === 0 ? ' s="1"' : "";
        const value = xmlEscape(row[columnIndex] ?? "");
        return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${value}</t></is></c>`;
      }).join("");
      const hidden =
        rowIndex > 0 &&
        row.slice(0, visibleColumnCount).every((value) => value.length === 0)
          ? ' hidden="1"'
          : "";
      return `<row r="${rowIndex + 1}"${hidden}>${cells}</row>`;
    })
    .join("");

  const groupValidations =
    activeGroupCount === 0
      ? ""
      : Array.from({ length: groupSlotCount }, (_, index) => {
          const column = columnName(
            ATHLETES_EXCHANGE_VISIBLE_BASE_HEADERS.length + index,
          );
          const groupListColumn = columnName(groupListColumnIndex);
          const lastGroupRow = activeGroupCount + 1;
          return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" promptTitle="Trainingsgruppe" prompt="Bitte eine Trainingsgruppe aus der Liste auswählen." errorTitle="Ungültige Trainingsgruppe" error="Bitte eine Trainingsgruppe aus der Liste auswählen." sqref="${column}2:${column}1001"><formula1>$${groupListColumn}$2:$${groupListColumn}$${lastGroupRow}</formula1></dataValidation>`;
        }).join("");
  const validations =
    groupValidations.length === 0
      ? ""
      : `<dataValidations count="${groupSlotCount}">${groupValidations}</dataValidations>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${columnName(columnCount - 1)}${rowCount}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${data}</sheetData>
  <autoFilter ref="A1:${columnName(visibleColumnCount - 1)}${Math.max(2, rowCount)}"/>
  ${validations}
</worksheet>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Athleten" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
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
