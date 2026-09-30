import type {
  AuthSession,
  AccountStatus,
  CurrentIdentity,
  IdentityAction,
  IdentityPersistenceState,
  IdentityProvisioningAuditContext,
  IdentityState,
  IdentityStateStore,
} from "./contracts";
import { IdentityError } from "./errors";
import {
  normalizeUsername,
  technicalEmailForUsername,
} from "./technical-email";

export interface CreateInitialUserInput {
  username: string;
  temporaryPassword: string;
  displayName: string;
  contactEmail?: string;
}

export class IdentityProvisioningConflictError extends Error {
  readonly code = "IDENTITY_PROVISIONING_CONFLICT";

  constructor() {
    super("Identity provisioning conflicts with an existing owner or account.");
    this.name = "IdentityProvisioningConflictError";
  }
}

interface BetterAuthIdentityBackend {
  createUsernameAccount(input: {
    operationId: string;
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
    operationCreatedAt: Date;
  }): Promise<{ identityId: string }>;
  signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<AuthSession>;
  getSession(sessionToken: string): Promise<AuthSession | null>;
  matchesUsernamePassword?(input: {
    username: string;
    password: string;
    expectedIdentityId: string;
  }): Promise<boolean>;
  changePassword(input: {
    operationId: string;
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<AuthSession>;
  getPasswordCredentialUpdatedAt?(identityId: string): Promise<Date | null>;
  getAccountStatus(identityId: string): Promise<AccountStatus>;
  disableIdentity(input: {
    identityId: string;
    operationId: string;
  }): Promise<void>;
  endSession(sessionToken: string): Promise<void>;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertIdentityActionAllowed(
  current: CurrentIdentity,
  action: IdentityAction,
): void {
  if (
    current.access === "password-change-required" &&
    action !== "change-password" &&
    action !== "end-session"
  ) {
    throw new IdentityError(
      "PASSWORD_CHANGE_REQUIRED",
      "The password must be changed before using the application.",
    );
  }
}

export class IdentityService {
  constructor(
    private readonly authProvider: BetterAuthIdentityBackend,
    private readonly stateStore: IdentityStateStore,
    private readonly now: () => Date = () => new Date(),
    private readonly authorizeProvisioning: () => Promise<void> = async () => {},
  ) {}

  async createInitialUser(
    input: CreateInitialUserInput,
  ): Promise<IdentityState> {
    return this.createInitialUserInternal(input);
  }

  async createInitialUserWithAudit(
    input: CreateInitialUserInput,
    provisioningAudit: IdentityProvisioningAuditContext,
  ): Promise<IdentityState> {
    return this.createInitialUserInternal(
      input,
      normalizeProvisioningAuditContext(provisioningAudit),
    );
  }

  private async createInitialUserInternal(
    input: CreateInitialUserInput,
    provisioningAudit?: IdentityProvisioningAuditContext,
  ): Promise<IdentityState> {
    const username = normalizeUsername(input.username);
    const displayName = requiredText(input.displayName, "displayName");
    const contactEmail = optionalText(input.contactEmail);
    const technicalEmail = await technicalEmailForUsername(username);

    // Production runtimes provide an authorization callback here so every
    // provisioning invocation is authorized before any reconciliation state
    // is read, including already-completed idempotent retries.
    await this.authorizeProvisioning();

    const operation = await this.stateStore.prepareOperation({
      operationKey: `provision:${username}`,
      kind: "provision",
      identityId: null,
      ...(provisioningAudit === undefined ? {} : { provisioningAudit }),
    });
    assertProvisioningAuditOwnership(operation, provisioningAudit);

    if (operation.completedAt !== null && operation.identityId !== null) {
      const existing = await this.stateStore.find(operation.identityId);
      if (existing !== null) {
        assertProvisioningStateMatches(existing, {
          username,
          displayName,
          contactEmail,
        });
        const accountStatus = await this.authProvider.getAccountStatus(
          operation.identityId,
        );
        if (
          provisioningAudit !== undefined &&
          accountStatus === "active" &&
          (this.authProvider.matchesUsernamePassword === undefined ||
            !(await this.authProvider.matchesUsernamePassword({
              username,
              password: input.temporaryPassword,
              expectedIdentityId: operation.identityId,
            })))
        ) {
          throw new IdentityProvisioningConflictError();
        }
        return withAccountStatus(existing, accountStatus);
      }
    }

    const operationCreatedAt = operation.createdAt ?? this.now();
    const created = await this.authProvider.createUsernameAccount({
      operationId: operation.operationId,
      username,
      displayName,
      technicalEmail,
      temporaryPassword: input.temporaryPassword,
      operationCreatedAt,
    });

    const state = await this.stateStore.completeProvisioning({
      operationId: operation.operationId,
      identityId: created.identityId,
      username,
      displayName,
      contactEmail,
      completedAt: this.now(),
    });
    assertProvisioningStateMatches(state, {
      username,
      displayName,
      contactEmail,
    });
    const accountStatus = await this.authProvider.getAccountStatus(
      created.identityId,
    );
    return withAccountStatus(state, accountStatus);
  }

  async signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<CurrentIdentity> {
    let session: AuthSession;
    try {
      session = await this.authProvider.signInWithUsername({
        username: normalizeUsername(input.username),
        password: input.password,
      });
    } catch {
      throw new IdentityError(
        "AUTHENTICATION_FAILED",
        "The username or password is invalid.",
      );
    }

    return this.resolveSession(session.sessionToken, session.identityId);
  }

  async changeRequiredPassword(input: {
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    idempotencyKey: string;
  }): Promise<CurrentIdentity> {
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    const operationKey = `required-password-change:${idempotencyKey}`;
    const current = await this.getCurrentIdentity(input.sessionToken);

    if (current === null) {
      const pendingOrCompleted = await this.stateStore.findOperation(operationKey);
      if (
        pendingOrCompleted !== null &&
        pendingOrCompleted.identityId !== null
      ) {
        const existing = await this.stateStore.find(pendingOrCompleted.identityId);
        if (existing !== null) {
          if (pendingOrCompleted.completedAt === null) {
            const operationCreatedAt = pendingOrCompleted.createdAt;
            const readCredentialUpdatedAt =
              this.authProvider.getPasswordCredentialUpdatedAt;
            if (
              operationCreatedAt === undefined ||
              readCredentialUpdatedAt === undefined
            ) {
              throw new IdentityError("SESSION_INVALID", "The session is invalid.");
            }

            let credentialUpdatedAt: Date | null;
            try {
              credentialUpdatedAt = await readCredentialUpdatedAt.call(
                this.authProvider,
                pendingOrCompleted.identityId,
              );
            } catch {
              throw new IdentityError("SESSION_INVALID", "The session is invalid.");
            }
            if (
              credentialUpdatedAt === null ||
              credentialUpdatedAt.getTime() <= operationCreatedAt.getTime()
            ) {
              throw new IdentityError("SESSION_INVALID", "The session is invalid.");
            }
          }

          let recoveredSession: AuthSession;
          try {
            recoveredSession = await this.authProvider.signInWithUsername({
              username: existing.username,
              password: input.newPassword,
            });
          } catch {
            throw new IdentityError("SESSION_INVALID", "The session is invalid.");
          }
          if (recoveredSession.identityId !== pendingOrCompleted.identityId) {
            throw new IdentityError("SESSION_INVALID", "The session is invalid.");
          }
          if (pendingOrCompleted.completedAt === null) {
            await this.stateStore.markPasswordChanged(
              pendingOrCompleted.identityId,
              this.now(),
              pendingOrCompleted.operationId,
            );
          } else if (existing.mustChangePassword) {
            throw new IdentityError("SESSION_INVALID", "The session is invalid.");
          }
          return this.resolveSession(
            recoveredSession.sessionToken,
            recoveredSession.identityId,
          );
        }
      }
      throw new IdentityError("SESSION_INVALID", "The session is invalid.");
    }

    const operation = await this.stateStore.prepareOperation({
      operationKey,
      kind: "required-password-change",
      identityId: current.identity.identityId,
    });
    if (
      operation.identityId !== null &&
      operation.identityId !== current.identity.identityId
    ) {
      throw new IdentityError("SESSION_INVALID", "The session is invalid.");
    }
    if (operation.completedAt !== null) {
      const existing = await this.stateStore.find(current.identity.identityId);
      if (existing !== null) {
        const accountStatus = await this.authProvider.getAccountStatus(
          current.identity.identityId,
        );
        return {
          identity: withAccountStatus(existing, accountStatus),
          sessionToken: current.sessionToken,
          access: existing.mustChangePassword ? "password-change-required" : "full",
        };
      }
    }
    if (!current.identity.mustChangePassword) {
      throw new IdentityError(
        "PASSWORD_CHANGE_NOT_REQUIRED",
        "A required password change is not pending.",
      );
    }

    let replacementSession: AuthSession;
    try {
      replacementSession = await this.authProvider.changePassword({
        operationId: operation.operationId,
        sessionToken: input.sessionToken,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      });
    } catch {
      throw new IdentityError(
        "PASSWORD_CHANGE_FAILED",
        "The password could not be changed.",
      );
    }
    if (replacementSession.identityId !== current.identity.identityId) {
      throw new IdentityError(
        "PASSWORD_CHANGE_FAILED",
        "The password could not be changed.",
      );
    }

    await this.stateStore.markPasswordChanged(
      current.identity.identityId,
      this.now(),
      operation.operationId,
    );
    return this.resolveSession(
      replacementSession.sessionToken,
      replacementSession.identityId,
    );
  }

  async getCurrentIdentity(
    sessionToken: string,
  ): Promise<CurrentIdentity | null> {
    const session = await this.authProvider.getSession(sessionToken);

    if (session === null) {
      return null;
    }

    return this.resolveSession(sessionToken, session.identityId);
  }

  async disableIdentity(identityId: string): Promise<IdentityState> {
    const operation = await this.stateStore.prepareOperation({
      operationKey: `disable:${identityId}`,
      kind: "disable",
      identityId,
    });
    if (operation.completedAt !== null) {
      const existing = await this.stateStore.find(identityId);
      if (existing !== null) return withAccountStatus(existing, "disabled");
    }
    await this.authProvider.disableIdentity({
      identityId,
      operationId: operation.operationId,
    });
    const state = await this.stateStore.recordDisabled(
      identityId,
      this.now(),
      operation.operationId,
    );
    return withAccountStatus(state, "disabled");
  }

  private async resolveSession(
    sessionToken: string,
    identityId: string,
  ): Promise<CurrentIdentity> {
    const identity = await this.stateStore.find(identityId);

    if (identity === null) {
      await this.authProvider.endSession(sessionToken);
      throw new IdentityError(
        "IDENTITY_STATE_MISSING",
        "The identity is not available.",
      );
    }
    const accountStatus = await this.authProvider.getAccountStatus(identityId);
    if (accountStatus === "disabled") {
      await this.authProvider.endSession(sessionToken);
      throw new IdentityError("IDENTITY_DISABLED", "The identity is disabled.");
    }

    return {
      identity: withAccountStatus(identity, accountStatus),
      sessionToken,
      access: identity.mustChangePassword ? "password-change-required" : "full",
    };
  }
}

function withAccountStatus(
  state: IdentityPersistenceState,
  accountStatus: "active" | "disabled",
): IdentityState {
  return { ...state, accountStatus };
}

function assertProvisioningStateMatches(
  state: Readonly<{
    username: string;
    displayName: string;
    contactEmail: string | null;
  }>,
  expected: Readonly<{
    username: string;
    displayName: string;
    contactEmail: string | null;
  }>,
): void {
  if (
    state.username !== expected.username ||
    state.displayName !== expected.displayName ||
    state.contactEmail !== expected.contactEmail
  ) {
    throw new IdentityProvisioningConflictError();
  }
}

function normalizeProvisioningAuditContext(
  input: IdentityProvisioningAuditContext,
): IdentityProvisioningAuditContext {
  return Object.freeze({
    provisioningOwner: requiredBoundedText(
      input.provisioningOwner,
      "provisioningOwner",
      120,
    ),
    actorPrincipalId: requiredBoundedText(
      input.actorPrincipalId,
      "actorPrincipalId",
      200,
    ),
    reason: requiredBoundedText(input.reason, "reason", 500),
  });
}

function assertProvisioningAuditOwnership(
  operation: Readonly<{
    provisioningOwner?: string | null;
    actorPrincipalId?: string | null;
    reason?: string | null;
  }>,
  expected: IdentityProvisioningAuditContext | undefined,
): void {
  const actualOwner = operation.provisioningOwner ?? null;
  const actualActor = operation.actorPrincipalId ?? null;
  const actualReason = operation.reason ?? null;
  if (expected === undefined) {
    if (actualOwner !== null || actualActor !== null || actualReason !== null) {
      throw new IdentityProvisioningConflictError();
    }
    return;
  }
  if (
    actualOwner !== expected.provisioningOwner ||
    actualActor !== expected.actorPrincipalId ||
    actualReason !== expected.reason
  ) {
    throw new IdentityProvisioningConflictError();
  }
}

function requiredBoundedText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = requiredText(value, field);
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds its maximum length.`);
  }
  return normalized;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} must not be empty.`);
  }
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return requiredText(value, "contactEmail");
}

function requiredIdempotencyKey(value: string): string {
  const normalized = requiredText(value, "idempotencyKey").toLowerCase();
  if (!UUID_V4_PATTERN.test(normalized)) {
    throw new TypeError("idempotencyKey must be a UUID v4.");
  }
  return normalized;
}
