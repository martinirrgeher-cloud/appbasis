import moduleDefinition from "../appbasis.module.json";

import {
  createCountdownTimeline,
  getCountdownSnapshot,
  normalizeCountdownConfiguration,
} from "./countdown";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const COUNTDOWN_CAPABILITIES = Object.freeze({
  view: requiredCountdownCapability("countdown:view"),
});

export {
  COUNTDOWN_PREPARATION_SECONDS,
  createCountdownTimeline,
  getCountdownSnapshot,
  normalizeCountdownConfiguration,
} from "./countdown";
export type {
  CountdownConfiguration,
  CountdownConfigurationInput,
  CountdownCue,
  CountdownPhase,
  CountdownSnapshot,
} from "./countdown";

function requiredCountdownCapability<const T extends string>(capability: T): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Countdown capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}

void createCountdownTimeline;
void getCountdownSnapshot;
void normalizeCountdownConfiguration;
