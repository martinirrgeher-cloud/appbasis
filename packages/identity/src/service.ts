import type {
  AuthSession,
  CurrentIdentity,
  IdentityAction,
  IdentityAuthProvider,
  IdentityPersistenceState,
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
    private readonly authProvider: IdentityAuthProvider,
    private readonly stateStore: IdentityStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createInitialUser(
    input: CreateInitialUserInput,
  ): Promise<IdentityState> {
    const username = normalizeUsername(input.username);
    const displayName = requiredText(input.displayName, "displayName");
    const contactEmail = optionalText(input.contactEmail);
    const technicalEmail = await technicalEmailForUsername(username);
    const created = await this.authProvider.createUsernameAccount({
      username,
      displayName,
      technicalEmail,
      temporaryPassword: input.temporaryPassword,
    });

    try {
      const state = await this.stateStore.create({
        identityId: created.identityId,
        username,
        displayName,
        contactEmail,
      });
      return withAccountStatus(state, "active");
    } catch (error) {
      await this.authProvider.discardUnactivatedIdentity(created.identityId);
      throw error;
    }
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
  }): Promise<IdentityState> {
    const current = await this.getCurrentIdentity(input.sessionToken);

    if (current === null) {
      throw new IdentityError("SESSION_INVALID", "The session is invalid.");
    }
    if (!current.identity.mustChangePassword) {
      throw new IdentityError(
        "PASSWORD_CHANGE_NOT_REQUIRED",
        "A required password change is not pending.",
      );
    }

    try {
      await this.authProvider.changePassword({
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

    const state = await this.stateStore.markPasswordChanged(
      current.identity.identityId,
      this.now(),
    );
    return withAccountStatus(state, "active");
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
    await this.authProvider.disableIdentity(identityId);
    const state = await this.stateStore.recordDisabled(identityId, this.now());
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
