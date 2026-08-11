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
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
  }): Promise<{ identityId: string }>;
  // Compensation is permitted only while initial provisioning has not created
  // an AppBasis identity state or any historical business relationship.
  discardUnactivatedIdentity(identityId: string): Promise<void>;
  signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<AuthSession>;
  getSession(sessionToken: string): Promise<AuthSession | null>;
  changePassword(input: {
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<void>;
  getAccountStatus(identityId: string): Promise<AccountStatus>;
  // Must reject future sign-ins and revoke all active provider sessions.
  disableIdentity(identityId: string): Promise<void>;
  endSession(sessionToken: string): Promise<void>;
}

export interface IdentityStateStore {
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
  ): Promise<IdentityPersistenceState>;
  recordDisabled(
    identityId: string,
    disabledAt: Date,
  ): Promise<IdentityPersistenceState>;
}

export type IdentityAccess = "full" | "password-change-required";
export type IdentityAction = "application" | "change-password" | "end-session";

export interface CurrentIdentity {
  identity: IdentityState;
  sessionToken: string;
  access: IdentityAccess;
}
