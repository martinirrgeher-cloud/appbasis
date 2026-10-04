import { describe, expect, it } from "vitest";

import {
  XlsxReadError,
  createStoredXlsxZip,
  readXlsxWorkbook,
  xlsxColumnName,
  xlsxUtf8,
  xlsxXmlEscape,
} from "../src/index";

describe("@appbasis/xlsx low-level helpers", () => {
  it("maps zero-based columns to Excel names", () => {
    expect(xlsxColumnName(0)).toBe("A");
    expect(xlsxColumnName(25)).toBe("Z");
    expect(xlsxColumnName(26)).toBe("AA");
    expect(xlsxColumnName(701)).toBe("ZZ");
    expect(xlsxColumnName(16_383)).toBe("XFD");
    expect(() => xlsxColumnName(16_384)).toThrow(RangeError);
  });

  it("escapes XML and replaces XML 1.0-forbidden control characters", () => {
    expect(xlsxXmlEscape('A&B<\"\'\u0001')).toBe(
      "A&amp;B&lt;&quot;&apos;�",
    );
  });

  it("creates a deterministic stored ZIP package with UTF-8 names", () => {
    const bytes = createStoredXlsxZip([
      { name: "xl/workbook.xml", content: xlsxUtf8("<workbook/>") },
      { name: "xl/worksheets/sheet1.xml", content: xlsxUtf8("<sheet/>") },
    ]);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("xl/workbook.xml");
    expect(text).toContain("xl/worksheets/sheet1.xml");
  });

  it("rejects duplicate or unsafe package part names", () => {
    expect(() =>
      createStoredXlsxZip([
        { name: "xl/workbook.xml", content: new Uint8Array() },
        { name: "xl/workbook.xml", content: new Uint8Array() },
      ]),
    ).toThrow(/duplicate/i);
    expect(() =>
      createStoredXlsxZip([
        { name: "../workbook.xml", content: new Uint8Array() },
      ]),
    ).toThrow(/invalid/i);
    expect(() =>
      createStoredXlsxZip(
        Array.from({ length: 65_536 }, (_, index) => ({
          name: "part-" + String(index),
          content: new Uint8Array(),
        })),
      ),
    ).toThrow(/too many/i);
  });

  it("reads shared strings and date-formatted numeric cells", async () => {
    const bytes = createReaderFixture();
    const workbook = await readXlsxWorkbook(bytes, {
      sheetNames: ["Daten"],
      decodeDates: true,
    });

    expect([...workbook.keys()]).toEqual(["Daten"]);
    expect(workbook.get("Daten")).toEqual([
      { rowNumber: 1, cells: ["Kopf", "Wert"] },
      { rowNumber: 2, cells: ["Anna", "1900-01-01"] },
    ]);

    const rawDates = await readXlsxWorkbook(bytes, {
      sheetNames: ["Daten"],
      decodeDates: false,
    });
    expect(rawDates.get("Daten")?.[1]?.cells[1]).toBe("1");
  });

  it("rejects XML declarations that could expand external entities", async () => {
    const bytes = createReaderFixture(
      '<?xml version="1.0"?><!DOCTYPE workbook [<!ENTITY x SYSTEM "file:///etc/passwd">]><workbook/>',
    );

    await expect(readXlsxWorkbook(bytes)).rejects.toBeInstanceOf(
      XlsxReadError,
    );
  });

  it("rejects ZIP entries marked for strong encryption", async () => {
    const bytes = mutateFirstZipEntryFlags(createReaderFixture(), 0x0040);

    await expect(readXlsxWorkbook(bytes)).rejects.toBeInstanceOf(
      XlsxReadError,
    );
  });

  it("rejects a data-descriptor flag when the descriptor is missing", async () => {
    const bytes = mutateFirstZipEntryFlags(createReaderFixture(), 0x0008);

    await expect(readXlsxWorkbook(bytes)).rejects.toBeInstanceOf(
      XlsxReadError,
    );
  });

  it("ignores XML comments instead of parsing commented worksheet rows", async () => {
    const bytes = createReaderFixture(
      undefined,
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="inlineStr"><is><t>Wert</t></is></c>
    </row>
    <!-- <row r="2"><c r="A2" t="inlineStr"><is><t>Versteckt</t></is></c></row> -->
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>Sichtbar</t></is></c>
    </row>
  </sheetData>
</worksheet>`,
    );

    const workbook = await readXlsxWorkbook(bytes, {
      sheetNames: ["Daten"],
    });

    expect(workbook.get("Daten")).toEqual([
      { rowNumber: 1, cells: ["Kopf", "Wert"] },
      { rowNumber: 3, cells: ["Sichtbar"] },
    ]);
  });

  it("detects CRC drift before exposing worksheet data", async () => {
    const bytes = createReaderFixture();
    const marker = findAsciiOffset(bytes, "Anna");
    expect(marker).toBeGreaterThanOrEqual(0);
    const corrupted = bytes.slice();
    corrupted[marker] = "X".charCodeAt(0);

    await expect(
      readXlsxWorkbook(corrupted, { sheetNames: ["Daten"] }),
    ).rejects.toBeInstanceOf(XlsxReadError);
  });

});


function createReaderFixture(
  workbookOverride?: string,
  sheetOverride?: string,
): Uint8Array {
  const workbook =
    workbookOverride ??
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Daten" sheetId="1" r:id="rId1"/>
    <sheet name="Ignoriert" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  return createStoredXlsxZip([
    { name: "xl/workbook.xml", content: xlsxUtf8(workbook) },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: xlsxUtf8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`),
    },
    {
      name: "xl/sharedStrings.xml",
      content: xlsxUtf8(`<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">
  <si><t>Kopf</t></si>
</sst>`),
    },
    {
      name: "xl/styles.xml",
      content: xlsxUtf8(`<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cellXfs count="2">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
  </cellXfs>
</styleSheet>`),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: xlsxUtf8(
        sheetOverride ??
          `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="inlineStr"><is><t>Wert</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Anna</t></is></c>
      <c r="B2" s="1"><v>1</v></c>
    </row>
  </sheetData>
</worksheet>`,
      ),
    },
    {
      name: "xl/worksheets/sheet2.xml",
      content: xlsxUtf8(`<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`),
    },
  ]);
}


function findAsciiOffset(bytes: Uint8Array, value: string): number {
  const needle = new TextEncoder().encode(value);
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}


function mutateFirstZipEntryFlags(
  bytes: Uint8Array,
  additionalFlags: number,
): Uint8Array {
  const result = bytes.slice();
  const localView = new DataView(result.buffer, result.byteOffset);
  const localFlags = localView.getUint16(6, true);
  localView.setUint16(6, localFlags | additionalFlags, true);

  const endOffset = findZipEndOffset(result);
  const centralOffset = localView.getUint32(endOffset + 16, true);
  const centralFlags = localView.getUint16(centralOffset + 8, true);
  localView.setUint16(
    centralOffset + 8,
    centralFlags | additionalFlags,
    true,
  );
  return result;
}

function findZipEndOffset(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end record missing in test fixture.");
}
