import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC Countdown compact navigation and modal settings", () => {
  it("provides two adjacent, 40px icon actions instead of a full width back button", () => {
    expect(ULC_LINZ_APP_HTML).toContain('class="countdown-hero__actions"');
    expect(ULC_LINZ_APP_HTML).toContain('data-open-view="useful" aria-label="Zurück zu Nützliches"');
    expect(ULC_LINZ_APP_HTML).toContain('id="countdown-settings-open"');
    expect(ULC_LINZ_APP_HTML).toContain('aria-label="Countdown-Einstellungen öffnen"');
    expect(ULC_LINZ_APP_HTML).not.toContain('data-open-view="useful">← Nützliches</button>');
    expect(ULC_LINZ_APP_CSS).toContain('.countdown-icon-action {');
    expect(ULC_LINZ_APP_CSS).toContain('width: 40px;');
    expect(ULC_LINZ_APP_CSS).toContain('height: 40px;');
    expect(ULC_LINZ_APP_CSS).toContain('flex-direction: row;');
  });

  it("moves all existing settings into a native, accessible modal", () => {
    expect(ULC_LINZ_APP_HTML).toContain('<dialog class="countdown-settings-dialog"');
    expect(ULC_LINZ_APP_HTML).toContain('id="countdown-settings-dialog" aria-labelledby="settings-title" aria-modal="true"');
    expect(ULC_LINZ_APP_HTML).toContain('aria-haspopup="dialog" aria-controls="countdown-settings-dialog"');
    expect(ULC_LINZ_APP_HTML).toContain('id="countdown-settings-close"');
    expect(ULC_LINZ_APP_HTML).toContain('id="countdown-settings-done"');
    expect(ULC_LINZ_APP_HTML).not.toContain('<details class="card countdown-settings">');
    for (const id of ["settings-form", "rounds", "work-seconds", "rest-seconds",
      "work-interval", "rest-interval", "speech-enabled", "total-duration"]) {
      expect(ULC_LINZ_APP_HTML).toContain('id="' + id + '"');
    }
    expect(ULC_LINZ_APP_CSS).toContain('.countdown-settings-dialog::backdrop');
    expect(ULC_LINZ_APP_CSS).toContain('max-height: calc(100dvh - 24px)');
    expect(ULC_LINZ_APP_CSS).toContain('overflow-y: auto;');
  });

  it("handles modal opening, closing and navigation without altering running countdown", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.countdownSettingsOpen?.addEventListener("click", openCountdownSettings)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.countdownSettingsClose?.addEventListener("click", closeCountdownSettings)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.countdownSettingsDone?.addEventListener("click", closeCountdownSettings)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('dialog.showModal()');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (dialog?.open) dialog.close()');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (target !== "countdown") closeCountdownSettings()');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (view !== "app") closeCountdownSettings()');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.settingsPanel?.classList.toggle("is-locked", locked)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.settingsForm?.addEventListener("input", handleSettingsInput)');
  });
});
