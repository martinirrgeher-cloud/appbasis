export type {
  AccountStatus,
  AuthSession,
  CurrentIdentity,
  IdentityAccess,
  IdentityAction,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityProvisioningAuditContext,
  IdentityState,
  IdentityStateStore,
} from "./contracts";
export { IdentityError, type IdentityErrorCode } from "./errors";
export {
  assertIdentityActionAllowed,
  IdentityProvisioningConflictError,
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

/** Uses the same password hashing implementation configured by Better Auth. */
export { hashPassword as hashIdentityTemporaryPassword } from "better-auth/crypto";
