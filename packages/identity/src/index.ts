export type {
  AccountStatus,
  AuthSession,
  CurrentIdentity,
  IdentityAccess,
  IdentityAction,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityState,
  IdentityStateStore,
} from "./contracts";
export { IdentityError, type IdentityErrorCode } from "./errors";
export {
  assertIdentityActionAllowed,
  IdentityService,
  type CreateInitialUserInput,
} from "./service";
export {
  BetterAuthIdentityBackend,
  createIdentityRuntime,
  PostgresIdentityStateStore,
  type BetterAuthIdentityBackendOptions,
  type IdentityRuntimeOptions,
} from "./server";
export {
  normalizeUsername,
  technicalEmailForUsername,
} from "./technical-email";
