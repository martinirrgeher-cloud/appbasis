import { describe, expect, it } from "vitest";

import type {
  AuthSession,
  IdentityAuthProvider,
  IdentityPersistenceState,
  IdentityStateStore,
} from "../src/contracts";
import { assertIdentityActionAllowed, IdentityService } from "../src/service";
import { technicalEmailForUsername } from "../src/technical-email";

const fixedNow = new Date("2026-08-11T12:00:00.000Z");

describe("technical username abstraction", () => {
  it("creates a deterministic non-deliverable email without exposing the username", async () => {
    const first = await technicalEmailForUsername(" Martin.Test ");
    const second = await technicalEmailForUsername("martin.test");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}@identity\.invalid$/);
    expect(first).not.toContain("martin");
  });
});

describe("IdentityService", () => {
  it("creates an initial username identity without requiring a real email", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);

    const identity = await service.createInitialUser({
      username: "First.User",
      temporaryPassword: "temporary-value-not-persisted",
      displayName: "First User",
    });

    expect(identity).toMatchObject({
      username: "first.user",
      contactEmail: null,
      personId: null,
      mustChangePassword: true,
      accountStatus: "active",
    });
    expect(auth.createdTechnicalEmail).toMatch(/@identity\.invalid$/);
    expect(JSON.stringify(identity)).not.toContain(
      "temporary-value-not-persisted",
    );
  });

  it("restricts first-login access until the required password change succeeds", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    await service.createInitialUser({
      username: "first.user",
      temporaryPassword: "temporary-value",
      displayName: "First User",
    });

    const current = await service.signInWithUsername({
      username: "first.user",
      password: "temporary-value",
    });

    expect(current.access).toBe("password-change-required");
    expect(() =>
      assertIdentityActionAllowed(current, "application"),
    ).toThrowError(
      expect.objectContaining({ code: "PASSWORD_CHANGE_REQUIRED" }),
    );
    expect(() =>
      assertIdentityActionAllowed(current, "change-password"),
    ).not.toThrow();
    expect(() =>
      assertIdentityActionAllowed(current, "end-session"),
    ).not.toThrow();

    const changed = await service.changeRequiredPassword({
      sessionToken: current.sessionToken,
      currentPassword: "temporary-value",
      newPassword: "new-value",
    });

    expect(auth.passwordChangeRevokesOtherSessions).toBe(true);
    expect(changed.mustChangePassword).toBe(false);
    expect(changed.passwordChangedAt).toEqual(fixedNow);

    const afterChange = await service.getCurrentIdentity(current.sessionToken);
    expect(afterChange?.access).toBe("full");
  });

  it("rejects a disabled identity and ends the newly created session", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    const identity = await service.createInitialUser({
      username: "disabled.user",
      temporaryPassword: "temporary-value",
      displayName: "Disabled User",
      contactEmail: "real.contact@example.test",
    });
    const disabled = await service.disableIdentity(identity.identityId);
    expect(disabled.accountStatus).toBe("disabled");

    await expect(
      service.signInWithUsername({
        username: "disabled.user",
        password: "temporary-value",
      }),
    ).rejects.toMatchObject({
      code: "IDENTITY_DISABLED",
    });
    expect(auth.endedSessions).toEqual(["session-token"]);
    expect(await state.find(identity.identityId)).toMatchObject({
      displayName: "Disabled User",
      contactEmail: "real.contact@example.test",
      disabledAt: fixedNow,
    });
  });

  it("does not expose provider details when authentication fails", async () => {
    const auth = new FakeAuthProvider();
    auth.signInError = new Error("internal-token password-hash");
    const service = new IdentityService(
      auth,
      new FakeStateStore(),
      () => fixedNow,
    );

    await expect(
      service.signInWithUsername({
        username: "safe.error",
        password: "invalid-value",
      }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      message: "The username or password is invalid.",
    });
  });
});

class FakeAuthProvider implements IdentityAuthProvider {
  createdTechnicalEmail: string | null = null;
  passwordChangeRevokesOtherSessions = false;
  endedSessions: string[] = [];
  signInError: Error | null = null;
  accountStatus: "active" | "disabled" = "active";
  private identityId = "identity-1";

  async createUsernameAccount(input: {
    technicalEmail: string;
  }): Promise<{ identityId: string }> {
    this.createdTechnicalEmail = input.technicalEmail;
    return { identityId: this.identityId };
  }

  async discardUnactivatedIdentity(): Promise<void> {}

  async signInWithUsername(): Promise<AuthSession> {
    if (this.signInError !== null) {
      throw this.signInError;
    }
    return { identityId: this.identityId, sessionToken: "session-token" };
  }

  async getSession(sessionToken: string): Promise<AuthSession | null> {
    return { identityId: this.identityId, sessionToken };
  }

  async changePassword(input: { revokeOtherSessions: true }): Promise<void> {
    this.passwordChangeRevokesOtherSessions = input.revokeOtherSessions;
  }

  async getAccountStatus(): Promise<"active" | "disabled"> {
    return this.accountStatus;
  }

  async disableIdentity(): Promise<void> {
    this.accountStatus = "disabled";
  }

  async endSession(sessionToken: string): Promise<void> {
    this.endedSessions.push(sessionToken);
  }
}

class FakeStateStore implements IdentityStateStore {
  private state: IdentityPersistenceState | null = null;

  async create(input: {
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
  }): Promise<IdentityPersistenceState> {
    this.state = {
      ...input,
      personId: null,
      mustChangePassword: true,
      createdAt: fixedNow,
      updatedAt: fixedNow,
      passwordChangedAt: null,
      disabledAt: null,
    };
    return this.state;
  }

  async find(identityId: string): Promise<IdentityPersistenceState | null> {
    return this.state?.identityId === identityId ? this.state : null;
  }

  async markPasswordChanged(
    identityId: string,
    changedAt: Date,
  ): Promise<IdentityPersistenceState> {
    const current = await this.require(identityId);
    this.state = {
      ...current,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    };
    return this.state;
  }

  async recordDisabled(
    identityId: string,
    disabledAt: Date,
  ): Promise<IdentityPersistenceState> {
    const current = await this.require(identityId);
    this.state = {
      ...current,
      disabledAt,
      updatedAt: disabledAt,
    };
    return this.state;
  }

  private async require(identityId: string): Promise<IdentityPersistenceState> {
    const current = await this.find(identityId);
    if (current === null) {
      throw new Error("Missing test state");
    }
    return current;
  }
}
