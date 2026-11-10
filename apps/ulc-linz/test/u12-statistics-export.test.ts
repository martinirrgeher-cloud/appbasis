import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("ULC Nachwuchsstatistik CSV-Export", () => {
  it("exposes a disabled export until the requested report is loaded", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="u12-statistics-export" disabled');
    expect(ULC_LINZ_APP_SCRIPT).toContain('u12StatisticsExport = { groupId, from, to, report: payload.report }');
    expect(ULC_LINZ_APP_SCRIPT).toContain('saved.groupId !== u12Ui.group?.value');
    expect(ULC_LINZ_APP_SCRIPT).toContain('saved.from !== u12Ui.statsFrom?.value');
    expect(ULC_LINZ_APP_SCRIPT).toContain('saved.to !== u12Ui.statsTo?.value');
  });

  it("exports all five report views, including incomplete and unidentified records", () => {
    for (const field of [
      "report.months", "report.trainings", "report.athletes", "report.categories",
      "report.trainers", "report.summary.openStatuses",
      "report.summary.unidentifiedTrainerAttendances", "athlete.categories",
    ]) expect(ULC_LINZ_APP_SCRIPT).toContain(field);
    expect(ULC_LINZ_APP_SCRIPT).toContain('type: "text/csv;charset=utf-8"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('u12Ui.statsExport?.addEventListener("click", exportU12StatisticsCsv)');
  });

  it("quotes CSV cells, protects formula values, and invalidates export on logout, reload and close", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("function u12StatisticsCsvValue(value)");
    expect(ULC_LINZ_APP_SCRIPT).toContain('safe.replace(/"/g,');
    expect(ULC_LINZ_APP_SCRIPT).toContain('u12StatisticsExport = null;');
    expect(ULC_LINZ_APP_SCRIPT).toContain('URL.revokeObjectURL(url)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('link.remove()');
  });
  it("emits real BOM and CRLF delimiters instead of literal backslash sequences", () => {
    // Extract the actual generated worker code so escaped template-string output
    // cannot accidentally satisfy a superficial source assertion.
    const csvLine = ULC_LINZ_APP_SCRIPT.split("\n").find(line => line.includes("const csv = "));
    expect(csvLine).toBeDefined();
    const makeCsv = new Function("rows", "u12StatisticsCsvValue", csvLine! + "\nreturn csv;");
    const csv = makeCsv([["Bereich", "Wert"], ["Trainer", "Müller"]], (value: unknown) =>
      '"' + String(value).replace(/"/g, '""') + '"') as string;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    expect(csv).not.toContain(String.raw`\\uFEFF`);
    expect(csv).not.toContain(String.raw`\\r\\n`);
  });

  it("prevents spreadsheet formula execution even after leading whitespace", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("function u12StatisticsCsvValue(value)");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("\nfunction exportU12StatisticsCsv()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const csvValue = new Function(
      ULC_LINZ_APP_SCRIPT.slice(start, end) + "\nreturn u12StatisticsCsvValue;",
    )() as (value: unknown) => string;
    for (const input of ["=1+1", "+SUM(A1)", "-1+2", "@cmd", " \t=1+1", "\r+1"]) {
      expect(csvValue(input)).toBe('"' + "'" + input + '"');
    }
    expect(csvValue('Müller "Test"')).toBe('"Müller ""Test"""');
    expect(csvValue("Trainer")).toBe('"Trainer"');
  });

});
