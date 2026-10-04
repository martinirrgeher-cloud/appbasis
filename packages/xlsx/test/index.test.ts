import { describe, expect, it } from "vitest";

import {
  createStoredXlsxZip,
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
  });
});
