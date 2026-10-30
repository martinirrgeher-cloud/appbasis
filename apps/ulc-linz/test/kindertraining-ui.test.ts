import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC Kindertraining weekly attendance UI", () => {
  it("ships a mobile weekly attendance workspace", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="kindertraining" data-nav-priority="2" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-app-section="kindertraining"',
    );
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-group"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-prev"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-next"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-current"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-days"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-save"');
    expect(ULC_LINZ_APP_HTML).not.toContain('id="kindertraining-date"');
    expect(ULC_LINZ_APP_CSS).toContain(".kindertraining-statuses");
    expect(ULC_LINZ_APP_CSS).toContain(".kindertraining-week-savebar");
    expect(ULC_LINZ_APP_CSS).toContain(
      '.kindertraining-status[data-status="present"][aria-pressed="true"]',
    );
  });

  it("separates preregistration from actual trainer attendance", () => {
    expect(ULC_LINZ_APP_HTML).toContain("<h2>Anwesenheit</h2>");
    expect(ULC_LINZ_APP_HTML).toContain("Anwesenheit öffnen");
    expect(ULC_LINZ_APP_HTML).toContain("<h1>Anwesenheit</h1>");
    expect(ULC_LINZ_APP_HTML).toContain(
      "Die ganze Trainingswoche im Blick: Voranmeldungen prüfen und die tatsächliche Anwesenheit gesammelt erfassen.",
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      "Speichert nur geänderte Tage dieser Woche.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"Voranmeldung: " + kindertrainingRegistrationLabel(participant.intention)',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain('"Noch offen"');
    expect(ULC_LINZ_APP_HTML).not.toContain("<h2>Kindertraining</h2>");
    expect(ULC_LINZ_APP_HTML).not.toContain("<h1>Kindertraining</h1>");
  });

  it("loads the Monday-to-Sunday week from server-owned Kindertraining contracts", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/kindertraining")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/kindertraining/session?groupId="',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const dates = registrationWeekDates(weekStart);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("Promise.all(");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "kindertrainingWeekSnapshots = snapshots;",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("moduleId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("keeps touch status controls and saves only changed days as full snapshots", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'for (const status of ["open", "present", "excused", "absent"])',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '["present", "Alle anwesend"]',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '["open", "Alle offen"]',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "kindertrainingWeekDirtyDates.add(sessionDate);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const dirtySnapshots = kindertrainingWeekSnapshots.filter",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("Promise.allSettled(");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "expectedRevision: snapshot.session?.revision ?? null",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "attendance: snapshot.participants.map",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"Es gibt ungespeicherte Anwesenheitsänderungen. Wirklich verwerfen?"',
    );
  });
});
