import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E4C Kindertraining UI", () => {
  it("ships a mobile Kindertraining navigation and attendance workspace", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="kindertraining" data-nav-priority="1" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-app-section="kindertraining"',
    );
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-group"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-date"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-participants"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-save"');
    expect(ULC_LINZ_APP_CSS).toContain(".kindertraining-statuses");
    expect(ULC_LINZ_APP_CSS).toContain(
      '.kindertraining-status[data-status="present"][aria-pressed="true"]',
    );
  });

  it("uses only the server-owned Kindertraining API contracts", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/kindertraining")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/kindertraining/session?groupId="',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/kindertraining/session", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "expectedRevision: kindertrainingSnapshot.session?.revision ?? null",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "attendance: kindertrainingSnapshot.participants.map",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("moduleId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("keeps status controls touch-oriented and exposes a full-snapshot save", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'for (const status of ["open", "present", "excused", "absent"])',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'setAllKindertrainingStatuses("present")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'setAllKindertrainingStatuses("open")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'elements.kindertrainingSaveState.textContent = "Ungespeicherte Änderungen"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'showMessage(elements.kindertrainingSuccess, "Training wurde gespeichert.")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("error?.status === 409");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Konflikt – neu laden");
  });
});
