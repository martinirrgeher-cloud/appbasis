export const COUNTDOWN_PREPARATION_SECONDS = 3;
const MAX_TOTAL_SECONDS = 24 * 60 * 60;
const MAX_ROUNDS = 1_000;

export interface CountdownConfigurationInput {
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  workAnnouncementIntervalSeconds?: number;
  restAnnouncementIntervalSeconds?: number;
}

export interface CountdownConfiguration {
  readonly rounds: number;
  readonly workSeconds: number;
  readonly restSeconds: number;
  readonly workAnnouncementIntervalSeconds: number;
  readonly restAnnouncementIntervalSeconds: number;
  readonly totalSeconds: number;
}

export type CountdownPhase = "prepare" | "work" | "rest" | "finished";

export interface CountdownSnapshot {
  readonly phase: CountdownPhase;
  readonly round: number;
  readonly rounds: number;
  readonly remainingSeconds: number;
  readonly elapsedSeconds: number;
  readonly totalSeconds: number;
}

export type CountdownCue =
  | {
      readonly type: "count";
      readonly atSecond: number;
      readonly phase: "prepare";
      readonly round: 1;
      readonly value: 3 | 2 | 1;
    }
  | {
      readonly type: "start";
      readonly atSecond: number;
      readonly phase: "work";
      readonly round: number;
      readonly value: "Los";
    }
  | {
      readonly type: "remaining";
      readonly atSecond: number;
      readonly phase: "work" | "rest";
      readonly round: number;
      readonly remainingSeconds: number;
    }
  | {
      readonly type: "finished";
      readonly atSecond: number;
      readonly phase: "finished";
      readonly round: number;
      readonly value: "Fertig";
    };

export function normalizeCountdownConfiguration(
  input: CountdownConfigurationInput,
): CountdownConfiguration {
  const rounds = requiredInteger(input?.rounds, "rounds", 1, MAX_ROUNDS);
  const workSeconds = requiredInteger(
    input?.workSeconds,
    "workSeconds",
    1,
    MAX_TOTAL_SECONDS,
  );
  const restSeconds = requiredInteger(
    input?.restSeconds,
    "restSeconds",
    0,
    MAX_TOTAL_SECONDS,
  );
  const workAnnouncementIntervalSeconds = requiredInteger(
    input?.workAnnouncementIntervalSeconds ?? 0,
    "workAnnouncementIntervalSeconds",
    0,
    MAX_TOTAL_SECONDS,
  );
  const restAnnouncementIntervalSeconds = requiredInteger(
    input?.restAnnouncementIntervalSeconds ?? 0,
    "restAnnouncementIntervalSeconds",
    0,
    MAX_TOTAL_SECONDS,
  );

  const totalSeconds =
    COUNTDOWN_PREPARATION_SECONDS +
    rounds * workSeconds +
    Math.max(0, rounds - 1) * restSeconds;

  if (!Number.isSafeInteger(totalSeconds) || totalSeconds > MAX_TOTAL_SECONDS) {
    throw new Error("Countdown total duration must not exceed 24 hours.");
  }

  return Object.freeze({
    rounds,
    workSeconds,
    restSeconds,
    workAnnouncementIntervalSeconds,
    restAnnouncementIntervalSeconds,
    totalSeconds,
  });
}

export function createCountdownTimeline(
  input: CountdownConfigurationInput | CountdownConfiguration,
): readonly CountdownCue[] {
  const configuration = normalizeCountdownConfiguration(input);
  const cues: CountdownCue[] = [
    Object.freeze({
      type: "count",
      atSecond: 0,
      phase: "prepare",
      round: 1,
      value: 3,
    }),
    Object.freeze({
      type: "count",
      atSecond: 1,
      phase: "prepare",
      round: 1,
      value: 2,
    }),
    Object.freeze({
      type: "count",
      atSecond: 2,
      phase: "prepare",
      round: 1,
      value: 1,
    }),
  ];

  let cursor = COUNTDOWN_PREPARATION_SECONDS;
  for (let round = 1; round <= configuration.rounds; round += 1) {
    cues.push(
      Object.freeze({
        type: "start",
        atSecond: cursor,
        phase: "work",
        round,
        value: "Los",
      }),
    );
    appendRemainingCues(
      cues,
      cursor,
      configuration.workSeconds,
      configuration.workAnnouncementIntervalSeconds,
      "work",
      round,
    );
    cursor += configuration.workSeconds;

    if (round === configuration.rounds) {
      cues.push(
        Object.freeze({
          type: "finished",
          atSecond: cursor,
          phase: "finished",
          round,
          value: "Fertig",
        }),
      );
      break;
    }

    appendRemainingCues(
      cues,
      cursor,
      configuration.restSeconds,
      configuration.restAnnouncementIntervalSeconds,
      "rest",
      round,
    );
    cursor += configuration.restSeconds;
  }

  return Object.freeze(cues);
}

export function getCountdownSnapshot(
  input: CountdownConfigurationInput | CountdownConfiguration,
  elapsedSeconds: number,
): CountdownSnapshot {
  const configuration = normalizeCountdownConfiguration(input);
  const elapsed = requiredElapsedSeconds(elapsedSeconds);

  if (elapsed >= configuration.totalSeconds) {
    return snapshot(
      "finished",
      configuration.rounds,
      configuration,
      0,
      configuration.totalSeconds,
    );
  }

  if (elapsed < COUNTDOWN_PREPARATION_SECONDS) {
    return snapshot(
      "prepare",
      1,
      configuration,
      Math.ceil(COUNTDOWN_PREPARATION_SECONDS - elapsed),
      elapsed,
    );
  }

  let cursor = COUNTDOWN_PREPARATION_SECONDS;
  for (let round = 1; round <= configuration.rounds; round += 1) {
    const workEnd = cursor + configuration.workSeconds;
    if (elapsed < workEnd) {
      return snapshot(
        "work",
        round,
        configuration,
        Math.ceil(workEnd - elapsed),
        elapsed,
      );
    }
    cursor = workEnd;

    if (round === configuration.rounds) {
      return snapshot("finished", round, configuration, 0, elapsed);
    }

    const restEnd = cursor + configuration.restSeconds;
    if (elapsed < restEnd) {
      return snapshot(
        "rest",
        round,
        configuration,
        Math.ceil(restEnd - elapsed),
        elapsed,
      );
    }
    cursor = restEnd;
  }

  return snapshot(
    "finished",
    configuration.rounds,
    configuration,
    0,
    configuration.totalSeconds,
  );
}

function appendRemainingCues(
  cues: CountdownCue[],
  phaseStartSecond: number,
  durationSeconds: number,
  intervalSeconds: number,
  phase: "work" | "rest",
  round: number,
): void {
  const firstRemaining =
    durationSeconds <= 5 ? durationSeconds : durationSeconds - 1;
  for (let remaining = firstRemaining; remaining >= 1; remaining -= 1) {
    if (
      remaining <= 5 ||
      (intervalSeconds > 0 && remaining % intervalSeconds === 0)
    ) {
      cues.push(
        Object.freeze({
          type: "remaining",
          atSecond: phaseStartSecond + durationSeconds - remaining,
          phase,
          round,
          remainingSeconds: remaining,
        }),
      );
    }
  }
}

function snapshot(
  phase: CountdownPhase,
  round: number,
  configuration: CountdownConfiguration,
  remainingSeconds: number,
  elapsedSeconds: number,
): CountdownSnapshot {
  return Object.freeze({
    phase,
    round,
    rounds: configuration.rounds,
    remainingSeconds,
    elapsedSeconds,
    totalSeconds: configuration.totalSeconds,
  });
}

function requiredInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `Countdown ${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function requiredElapsedSeconds(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error("Countdown elapsedSeconds must be a finite non-negative number.");
  }
  return value;
}
