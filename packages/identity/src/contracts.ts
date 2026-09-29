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

export type IdentityOperationKind =
  | "provision"
  | "required-password-change"
  | "disable"
  | "delete";

export interface IdentityProvisioningAuditContext {
  provisioningOwner: string;
  actorPrincipalId: string;
  reason: string;
}

export interface IdentityOperation {
  operationId: string;
  operationKey: string;
  kind: IdentityOperationKind;
  identityId: string | null;
  completedAt: Date | null;
  createdAt?: Date;
  provisioningOwner?: string | null;
  actorPrincipalId?: string | null;
  reason?: string | null;
}

export interface IdentityStateStore {
  findOperation(operationKey: string): Promise<IdentityOperation | null>;
  prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
    provisioningAudit?: IdentityProvisioningAuditContext;
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
