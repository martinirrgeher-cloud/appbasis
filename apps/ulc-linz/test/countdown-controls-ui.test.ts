import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC mobile countdown stop and resume", () => {
  it("exposes separate Pause/Weiter, Stop and Reset controls", () => {
    for (const id of ["start-button", "pause-button", "stop-button", "reset-button"]) {
      expect(ULC_LINZ_APP_HTML).toContain('id="' + id + '"');
    }
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'elements.stopButton?.addEventListener("click", () => void stopCountdown());',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'elements.pauseButton?.addEventListener("click", () => void togglePause());',
    );
    expect(ULC_LINZ_APP_CSS).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(ULC_LINZ_APP_CSS).toContain('.timer-stage[data-mode="stopped"]');
  });

  it("stops clock, speech and wake lock without destroying the plan", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("function stopCountdown() {");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("function resetCountdown() {", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const code = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(code).toContain('runMode !== "running" && runMode !== "paused"');
    expect(code).toContain("elapsedBeforeRunMs = currentElapsedMs()");
    expect(code).toContain('runMode = "stopped"');
    expect(code).toContain("stopTicker()");
    expect(code).toContain("cancelSpeech()");
    expect(code).toContain("releaseWakeLock()");
    expect(code).not.toContain("plan = null");
    expect(code).not.toContain("cueIndex = 0");
  });

  it("resumes stopped timeline before any fresh-plan request", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function startCountdown() {");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("function togglePause() {", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const code = ULC_LINZ_APP_SCRIPT.slice(start, end);
    const resume = code.indexOf('if (runMode === "stopped" && plan !== null)');
    const fetchPlan = code.indexOf('requestJson("/api/modules/countdown/plan"');
    expect(resume).toBeGreaterThan(0);
    expect(fetchPlan).toBeGreaterThan(resume);
    const resumeCode = code.slice(resume, fetchPlan);
    expect(resumeCode).toContain('runMode = "running"');
    expect(resumeCode).toContain("resumedAt = performance.now()");
    expect(resumeCode).toContain("startTicker()");
    expect(resumeCode).toContain("acquireWakeLock()");
    expect(resumeCode).not.toContain("cueIndex = 0");
    expect(resumeCode).not.toContain("elapsedBeforeRunMs = 0");
    expect(resumeCode).not.toContain("plan = null");
  });

  it("allows continuation after Stop while Reset always restores the idle state", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('runMode === "stopped" ? "Fortsetzen" : "Start"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('runMode !== "running" && runMode !== "paused"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('runMode = "idle"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("cueIndex = 0");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Mit Start an dieser Stelle fortsetzen.");
  });
});
