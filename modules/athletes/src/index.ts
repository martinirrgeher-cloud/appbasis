import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const ATHLETE_CAPABILITIES = Object.freeze({
  edit: requiredAthleteCapability("athletes:edit"),
  view: requiredAthleteCapability("athletes:view"),
});

export {
  MasterdataValidationError,
  createAthlete,
  createAthleteGroupMembership,
  createTrainer,
  createTrainerGroupMembership,
  createTrainingGroup,
} from "./domain/masterdata";
export { PostgresAthleteMasterdataRepository } from "./postgres-masterdata-repository";
export { reconcileAthleteMasterdataRestoredDatabase } from "./restore-reconciliation";
export type {
  Athlete,
  AthleteGroupMembership,
  CreateAthleteGroupMembershipInput,
  CreateAthleteInput,
  CreateTrainerGroupMembershipInput,
  CreateTrainerInput,
  CreateTrainingGroupInput,
  EntityContext,
  Trainer,
  TrainerGroupMembership,
  TrainingGroup,
} from "./domain/masterdata";
export type {
  AthleteMasterdataDeletionEntityType,
  AthleteMasterdataDeletionMarker,
  AthleteMasterdataDeletionReplayResult,
  AthleteMasterdataPostgresClient,
  AthleteMasterdataRetentionResult,
  AthleteMasterdataSnapshot,
  AthleteMasterdataSqlParameter,
} from "./postgres-masterdata-repository";
export type {
  AthleteMasterdataDeletionReconciliationSource,
  AthleteMasterdataDeletionReconciliationTarget,
  AthleteMasterdataRestoreReconciliationResult,
} from "./restore-reconciliation";

function requiredAthleteCapability<const T extends string>(capability: T): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Athletes capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
