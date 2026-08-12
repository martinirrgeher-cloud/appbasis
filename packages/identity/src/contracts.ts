export type AccountStatus = "active" | "disabled";

export interface IdentityPersistenceState {
  identityId: string;
  username: string;
  displayName: string;
  contactEmail: string | null;
  personId: string | null;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  passwordChangedAt: Date | null;
  disabledAt: Date | null;
}

export interface IdentityState extends IdentityPersistenceState {
  accountStatus: AccountStatus;
}

export interface AuthSession {
  identityId: string;
  sessionToken: string;
}

export interface IdentityAuthProvider {
  createUsernameAccount(input: {
    operationId: string;
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
  }): Promise<{ identityId: string }>;
  signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<AuthSession>;
  getSession(sessionToken: string): Promise<AuthSession | null>;
  changePassword(input: {
    operationId: string;
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<void>;
  getAccountStatus(identityId: string): Promise<AccountStatus>;
  // Must reject future sign-ins and revoke all active provider sessions.
  disableIdentity(input: {
    identityId: string;
    operationId: string;
  }): Promise<void>;
  endSession(sessionToken: string): Promise<void>;
}

export type IdentityOperationKind =
  | "provision"
  | "required-password-change"
  | "disable";

export interface IdentityOperation {
  operationId: string;
  operationKey: string;
  kind: IdentityOperationKind;
  identityId: string | null;
  completedAt: Date | null;
}

export interface IdentityStateStore {
  prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
  }): Promise<IdentityOperation>;
  completeProvisioning(input: {
    operationId: string;
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
    completedAt: Date;
  }): Promise<IdentityPersistenceState>;
  create(input: {
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
  }): Promise<IdentityPersistenceState>;
  find(identityId: string): Promise<IdentityPersistenceState | null>;
  markPasswordChanged(
    identityId: string,
    changedAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState>;
  recordDisabled(
    identityId: string,
    disabledAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState>;
}

export type IdentityAccess = "full" | "password-change-required";
export type IdentityAction = "application" | "change-password" | "end-session";

export interface CurrentIdentity {
  identity: IdentityState;
  sessionToken: string;
  access: IdentityAccess;
}
