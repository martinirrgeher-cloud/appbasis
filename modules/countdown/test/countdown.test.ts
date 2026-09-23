import { describe, expect, it } from "vitest";

import {
  COUNTDOWN_CAPABILITIES,
  MODULE_CAPABILITIES,
  createCountdownTimeline,
  getCountdownSnapshot,
  normalizeCountdownConfiguration,
} from "../src/index";

describe("countdown module", () => {
  it("keeps the public capability bound to the module manifest", () => {
    expect(MODULE_CAPABILITIES).toEqual(["countdown:view"]);
    expect(COUNTDOWN_CAPABILITIES.view).toBe("countdown:view");
  });

  it("normalizes the persisted-free timer configuration", () => {
    expect(
      normalizeCountdownConfiguration({
        rounds: 3,
        workSeconds: 30,
        restSeconds: 15,
      }),
    ).toEqual({
      rounds: 3,
      workSeconds: 30,
      restSeconds: 15,
      workAnnouncementIntervalSeconds: 0,
      restAnnouncementIntervalSeconds: 0,
      totalSeconds: 123,
    });
  });

  it("builds the exact 3-2-1-Los, remaining-time and Fertig cue sequence", () => {
    const timeline = createCountdownTimeline({
      rounds: 2,
      workSeconds: 20,
      restSeconds: 15,
      workAnnouncementIntervalSeconds: 10,
      restAnnouncementIntervalSeconds: 10,
    });

    expect(timeline.slice(0, 5)).toEqual([
      { type: "count", atSecond: 0, phase: "prepare", round: 1, value: 3 },
      { type: "count", atSecond: 1, phase: "prepare", round: 1, value: 2 },
      { type: "count", atSecond: 2, phase: "prepare", round: 1, value: 1 },
      { type: "start", atSecond: 3, phase: "work", round: 1, value: "Los" },
      {
        type: "remaining",
        atSecond: 13,
        phase: "work",
        round: 1,
        remainingSeconds: 10,
      },
    ]);

    expect(
      timeline.filter(
        (cue) =>
          cue.type === "remaining" &&
          cue.phase === "work" &&
          cue.round === 1 &&
          cue.remainingSeconds <= 5,
      ),
    ).toEqual([
      { type: "remaining", atSecond: 18, phase: "work", round: 1, remainingSeconds: 5 },
      { type: "remaining", atSecond: 19, phase: "work", round: 1, remainingSeconds: 4 },
      { type: "remaining", atSecond: 20, phase: "work", round: 1, remainingSeconds: 3 },
      { type: "remaining", atSecond: 21, phase: "work", round: 1, remainingSeconds: 2 },
      { type: "remaining", atSecond: 22, phase: "work", round: 1, remainingSeconds: 1 },
    ]);

    expect(timeline).toContainEqual({
      type: "remaining",
      atSecond: 28,
      phase: "rest",
      round: 1,
      remainingSeconds: 10,
    });
    expect(timeline).toContainEqual({
      type: "start",
      atSecond: 38,
      phase: "work",
      round: 2,
      value: "Los",
    });
    expect(timeline.at(-1)).toEqual({
      type: "finished",
      atSecond: 58,
      phase: "finished",
      round: 2,
      value: "Fertig",
    });
  });

  it("does not duplicate the last five seconds when an interval overlaps them", () => {
    const timeline = createCountdownTimeline({
      rounds: 1,
      workSeconds: 8,
      restSeconds: 0,
      workAnnouncementIntervalSeconds: 1,
      restAnnouncementIntervalSeconds: 1,
    });

    for (const remainingSeconds of [5, 4, 3, 2, 1]) {
      expect(
        timeline.filter(
          (cue) =>
            cue.type === "remaining" &&
            cue.phase === "work" &&
            cue.remainingSeconds === remainingSeconds,
        ),
      ).toHaveLength(1);
    }
  });

  it("announces every second when work or rest itself is five seconds or shorter", () => {
    const shortWork = createCountdownTimeline({
      rounds: 1,
      workSeconds: 5,
      restSeconds: 0,
    });
    expect(
      shortWork
        .filter((cue) => cue.type === "remaining" && cue.phase === "work")
        .map((cue) => cue.remainingSeconds),
    ).toEqual([5, 4, 3, 2, 1]);

    const shortRest = createCountdownTimeline({
      rounds: 2,
      workSeconds: 6,
      restSeconds: 5,
    });
    expect(
      shortRest
        .filter(
          (cue) =>
            cue.type === "remaining" &&
            cue.phase === "rest" &&
            cue.round === 1,
        )
        .map((cue) => cue.remainingSeconds),
    ).toEqual([5, 4, 3, 2, 1]);

    const oneSecondRest = createCountdownTimeline({
      rounds: 2,
      workSeconds: 6,
      restSeconds: 1,
    });
    expect(
      oneSecondRest.filter(
        (cue) =>
          cue.type === "remaining" &&
          cue.phase === "rest" &&
          cue.round === 1,
      ),
    ).toEqual([
      {
        type: "remaining",
        atSecond: 9,
        phase: "rest",
        round: 1,
        remainingSeconds: 1,
      },
    ]);
  });

  it("derives phase, round and displayed remaining seconds deterministically", () => {
    const configuration = {
      rounds: 2,
      workSeconds: 20,
      restSeconds: 15,
      workAnnouncementIntervalSeconds: 10,
      restAnnouncementIntervalSeconds: 10,
    };

    expect(getCountdownSnapshot(configuration, 0)).toMatchObject({
      phase: "prepare",
      round: 1,
      remainingSeconds: 3,
    });
    expect(getCountdownSnapshot(configuration, 2.2)).toMatchObject({
      phase: "prepare",
      round: 1,
      remainingSeconds: 1,
    });
    expect(getCountdownSnapshot(configuration, 3)).toMatchObject({
      phase: "work",
      round: 1,
      remainingSeconds: 20,
    });
    expect(getCountdownSnapshot(configuration, 22.2)).toMatchObject({
      phase: "work",
      round: 1,
      remainingSeconds: 1,
    });
    expect(getCountdownSnapshot(configuration, 23)).toMatchObject({
      phase: "rest",
      round: 1,
      remainingSeconds: 15,
    });
    expect(getCountdownSnapshot(configuration, 38)).toMatchObject({
      phase: "work",
      round: 2,
      remainingSeconds: 20,
    });
    expect(getCountdownSnapshot(configuration, 58)).toMatchObject({
      phase: "finished",
      round: 2,
      remainingSeconds: 0,
    });
  });

  it("fails closed for invalid or unbounded timer input", () => {
    expect(() =>
      normalizeCountdownConfiguration({
        rounds: 0,
        workSeconds: 30,
        restSeconds: 10,
      }),
    ).toThrow(/rounds/);

    expect(() =>
      normalizeCountdownConfiguration({
        rounds: 1,
        workSeconds: 30,
        restSeconds: 10,
        workAnnouncementIntervalSeconds: -1,
      }),
    ).toThrow(/workAnnouncementIntervalSeconds/);

    expect(() =>
      normalizeCountdownConfiguration({
        rounds: 1_000,
        workSeconds: 100,
        restSeconds: 100,
      }),
    ).toThrow(/24 hours/);

    expect(() =>
      getCountdownSnapshot(
        { rounds: 1, workSeconds: 30, restSeconds: 0 },
        Number.NaN,
      ),
    ).toThrow(/elapsedSeconds/);
  });
});
