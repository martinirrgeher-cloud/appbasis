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
});
