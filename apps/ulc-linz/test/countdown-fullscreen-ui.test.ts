import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC Countdown viewport-fit training screen", () => {
  it("retains all four controls and places visible ones in a compact auto-fit row", () => {
    for (const id of ["start-button", "pause-button", "stop-button", "reset-button"]) {
      expect(ULC_LINZ_APP_HTML).toContain('id="' + id + '"');
    }
    expect(ULC_LINZ_APP_CSS).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(100%, 78px), 1fr))",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      "body.countdown-screen-active #countdown .timer-actions .button",
    );
    expect(ULC_LINZ_APP_CSS).toContain("grid-column: auto;");
    expect(ULC_LINZ_APP_CSS).toContain("min-height: clamp(44px, 7dvh, 58px)");
  });

  it("fits only the countdown between measured app header and bottom navigation", () => {
    expect(ULC_LINZ_APP_CSS).toContain("body.countdown-screen-active { overflow: hidden; }");
    expect(ULC_LINZ_APP_CSS).toContain("body.countdown-screen-active #countdown {");
    expect(ULC_LINZ_APP_CSS).toContain("top: var(--countdown-top-inset, 56px)");
    expect(ULC_LINZ_APP_CSS).toContain("bottom: var(--countdown-bottom-inset, 56px)");
    expect(ULC_LINZ_APP_CSS).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(ULC_LINZ_APP_CSS).toContain("font-size: clamp(3rem, min(22vw, 17dvh), 9rem)");
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.querySelector(".app-header")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.querySelector(".app-nav")');
    expect(ULC_LINZ_APP_SCRIPT).toContain("getBoundingClientRect().height");
  });

  it("cleans up viewport mode on section change, logout and resizes", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'document.body.classList.toggle("countdown-screen-active", target === "countdown")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'document.body.classList.remove("countdown-screen-active")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (target === "countdown") {\n    window.scrollTo');
    expect(ULC_LINZ_APP_SCRIPT).toContain('window.addEventListener("resize"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('syncCountdownViewportInsets()');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (target !== "countdown") closeCountdownSettings()');
  });

  it("allows scrolling instead of clipping important controls at extreme viewport heights", () => {
    expect(ULC_LINZ_APP_CSS).toContain("@media (max-height: 350px)");
    expect(ULC_LINZ_APP_CSS).toContain("body.countdown-screen-active { overflow: auto; }");
    expect(ULC_LINZ_APP_CSS).toContain("body.countdown-screen-active #countdown .timer-stage { min-height: 140px; }");
    expect(ULC_LINZ_APP_HTML).toContain('id="countdown-settings-dialog"');
    expect(ULC_LINZ_APP_CSS).toContain("max-height: calc(100dvh - 24px)");
  });
});
