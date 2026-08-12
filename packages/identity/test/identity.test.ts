import { describe, expect, it } from "vitest";

import type {
  AuthSession,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityStateStore,
} from "../src/contracts";
import { assertIdentityActionAllowed, IdentityService } from "../src/service";
import { technicalEmailForUsername } from "../src/technical-email";

const fixedNow = new Date("2026-08-11T12:00:00.000Z");
const idempotencyKeys = {
  firstLogin: "11111111-1111-4111-8111-111111111111",
  providerRetry: "22222222-2222-4222-8222-222222222222",
  stateRetry: "33333333-3333-4333-8333-333333333333",
  original: "44444444-4444-4444-8444-444444444444",
  later: "55555555-5555-4555-8555-555555555555",
} as const;

describe("technical username abstraction", () => {
  it("creates a deterministic non-deliverable email without exposing the username", async () => {
    const first = await technicalEmailForUsername(" Martin.Test ");
    const second = await technicalEmailForUsername("martin.test");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}@identity\.invalid$/);
    expect(first).not.toContain("martin");
  });

  it("preserves dots in the AppBasis username contract", async () => {
    await expect(technicalEmailForUsername("first.user")).resolves.toMatch(
      /@identity\.invalid$/,
    );
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
      idempotencyKey: idempotencyKeys.firstLogin,
    });

    expect(auth.passwordChangeRevokesOtherSessions).toBe(true);
    expect(changed.identity.mustChangePassword).toBe(false);
    expect(changed.identity.passwordChangedAt).toEqual(fixedNow);
    expect(changed.access).toBe("full");
    expect(changed.sessionToken).toBe("replacement-session-token");
    await expect(
      service.getCurrentIdentity(changed.sessionToken),
    ).resolves.toMatchObject({ access: "full" });
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

  it("reconciles an ambiguous provisioning commit without creating twice", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    state.failAfterNextCompletion = true;
    const service = new IdentityService(auth, state, () => fixedNow);
    const input = {
      username: "retry.user",
      temporaryPassword: "temporary",
      displayName: "Retry",
    };

    await expect(service.createInitialUser(input)).rejects.toThrow("ambiguous");
    await expect(service.createInitialUser(input)).resolves.toMatchObject({
      username: "retry.user",
    });
    expect(auth.createCalls).toBe(1);
  });

  it("reconciles an ambiguous password-provider result idempotently", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    await service.createInitialUser({
      username: "password.retry",
      temporaryPassword: "temporary",
      displayName: "Retry",
    });
    auth.failAfterNextPasswordChange = true;
    const input = {
      sessionToken: "session-token",
      currentPassword: "temporary",
      newPassword: "changed",
      idempotencyKey: `  ${idempotencyKeys.providerRetry}  `,
    };

    await expect(service.changeRequiredPassword(input)).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_FAILED",
    });
    await expect(
      service.changeRequiredPassword({
        ...input,
        idempotencyKey: idempotencyKeys.providerRetry,
      }),
    ).resolves.toMatchObject({
      identity: { mustChangePassword: false },
      access: "full",
      sessionToken: "replacement-session-token",
    });
    expect(auth.passwordChangeCalls).toBe(1);
  });

  it("reconciles an ambiguous password-state commit after the session becomes invalid", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    await service.createInitialUser({
      username: "password.commit",
      temporaryPassword: "temporary",
      displayName: "Retry",
    });
    state.failAfterNextCompletion = true;
    const input = {
      sessionToken: "session-token",
      currentPassword: "temporary",
      newPassword: "changed",
      idempotencyKey: idempotencyKeys.stateRetry,
    };

    await expect(service.changeRequiredPassword(input)).rejects.toThrow(
      "ambiguous committed response",
    );
    auth.sessionValid = false;
    await expect(service.changeRequiredPassword(input)).resolves.toMatchObject({
      identity: { mustChangePassword: false },
      access: "full",
    });
    expect(auth.passwordChangeCalls).toBe(1);
  });

  it("does not reconcile a later password request with a different key", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    await service.createInitialUser({
      username: "password.later",
      temporaryPassword: "temporary",
      displayName: "Retry",
    });
    const original = {
      sessionToken: "session-token",
      currentPassword: "temporary",
      newPassword: "changed",
      idempotencyKey: idempotencyKeys.original,
    };

    await expect(
      service.changeRequiredPassword(original),
    ).resolves.toMatchObject({
      identity: { mustChangePassword: false },
      access: "full",
    });
    await expect(
      service.changeRequiredPassword({
        ...original,
        sessionToken: "replacement-session-token",
        currentPassword: "changed",
        newPassword: "changed-again",
        idempotencyKey: idempotencyKeys.later,
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_NOT_REQUIRED" });
    expect(auth.passwordChangeCalls).toBe(1);
  });

  it.each(["", "   ", "predictable-key", "11111111-1111-1111-8111-111111111111"])(
    "rejects invalid password-change idempotency key %j",
    async (idempotencyKey) => {
      const service = new IdentityService(
        new FakeAuthProvider(),
        new FakeStateStore(),
        () => fixedNow,
      );

      await expect(
        service.changeRequiredPassword({
          sessionToken: "session-token",
          currentPassword: "temporary",
          newPassword: "changed",
          idempotencyKey,
        }),
      ).rejects.toBeInstanceOf(TypeError);
    },
  );

  it("reconciles an ambiguous disablement audit commit without disabling twice", async () => {
    const auth = new FakeAuthProvider();
    const state = new FakeStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    const identity = await service.createInitialUser({
      username: "disable.retry",
      temporaryPassword: "temporary",
      displayName: "Retry",
    });
    state.failAfterNextCompletion = true;

    await expect(service.disableIdentity(identity.identityId)).rejects.toThrow(
      "ambiguous",
    );
    await expect(
      service.disableIdentity(identity.identityId),
    ).resolves.toMatchObject({ accountStatus: "disabled" });
    expect(auth.disableCalls).toBe(1);
  });
});

class FakeAuthProvider {
  createdTechnicalEmail: string | null = null;
  passwordChangeRevokesOtherSessions = false;
  endedSessions: string[] = [];
  signInError: Error | null = null;
  accountStatus: "active" | "disabled" = "active";
  sessionValid = true;
  createCalls = 0;
  passwordChangeCalls = 0;
  disableCalls = 0;
  failAfterNextPasswordChange = false;
  private completedOperations = new Set<string>();
  private identityId = "identity-1";

  async createUsernameAccount(input: {
    operationId: string;
    technicalEmail: string;
  }): Promise<{ identityId: string }> {
    if (!this.completedOperations.has(input.operationId)) {
      this.createCalls += 1;
      this.completedOperations.add(input.operationId);
    }
    this.createdTechnicalEmail = input.technicalEmail;
    return { identityId: this.identityId };
  }

  async signInWithUsername(): Promise<AuthSession> {
    if (this.signInError !== null) {
      throw this.signInError;
    }
    this.sessionValid = true;
    return { identityId: this.identityId, sessionToken: "session-token" };
  }

  async getSession(sessionToken: string): Promise<AuthSession | null> {
    return this.sessionValid
      ? { identityId: this.identityId, sessionToken }
      : null;
  }

  async changePassword(input: {
    operationId: string;
    revokeOtherSessions: true;
  }): Promise<AuthSession> {
    this.passwordChangeRevokesOtherSessions = input.revokeOtherSessions;
    if (!this.completedOperations.has(input.operationId)) {
      this.passwordChangeCalls += 1;
      this.completedOperations.add(input.operationId);
    }
    if (this.failAfterNextPasswordChange) {
      this.failAfterNextPasswordChange = false;
      throw new Error("ambiguous provider response");
    }
    return {
      identityId: this.identityId,
      sessionToken: "replacement-session-token",
    };
  }

  async getAccountStatus(): Promise<"active" | "disabled"> {
    return this.accountStatus;
  }

  async disableIdentity(input: { operationId: string }): Promise<void> {
    if (!this.completedOperations.has(input.operationId)) {
      this.disableCalls += 1;
      this.completedOperations.add(input.operationId);
    }
    this.accountStatus = "disabled";
  }

  async endSession(sessionToken: string): Promise<void> {
    this.endedSessions.push(sessionToken);
  }
}

class FakeStateStore implements IdentityStateStore {
  private state: IdentityPersistenceState | null = null;
  private operations = new Map<string, IdentityOperation>();
  failAfterNextCompletion = false;

  async findOperation(operationKey: string): Promise<IdentityOperation | null> {
    return this.operations.get(operationKey) ?? null;
  }

  async prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
  }): Promise<IdentityOperation> {
    const existing = this.operations.get(input.operationKey);
    if (existing !== undefined) return existing;
    const operation = {
      ...input,
      operationId: `operation-${this.operations.size + 1}`,
      completedAt: null,
    };
    this.operations.set(input.operationKey, operation);
    return operation;
  }

  async completeProvisioning(input: {
    operationId: string;
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
    completedAt: Date;
  }): Promise<IdentityPersistenceState> {
    const state = await this.create(input);
    this.complete(input.operationId, input.identityId, input.completedAt);
    this.maybeFailAfterCompletion();
    return state;
  }

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
    operationId: string,
  ): Promise<IdentityPersistenceState> {
    const current = await this.require(identityId);
    this.state = {
      ...current,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    };
    this.complete(operationId, identityId, changedAt);
    this.maybeFailAfterCompletion();
    return this.state;
  }

  async recordDisabled(
    identityId: string,
    disabledAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState> {
    const current = await this.require(identityId);
    this.state = {
      ...current,
      disabledAt,
      updatedAt: disabledAt,
    };
    this.complete(operationId, identityId, disabledAt);
    this.maybeFailAfterCompletion();
    return this.state;
  }

  private async require(identityId: string): Promise<IdentityPersistenceState> {
    const current = await this.find(identityId);
    if (current === null) {
      throw new Error("Missing test state");
    }
    return current;
  }

  private complete(
    operationId: string,
    identityId: string,
    completedAt: Date,
  ): void {
    for (const [key, operation] of this.operations) {
      if (operation.operationId === operationId)
        this.operations.set(key, { ...operation, identityId, completedAt });
    }
  }

  private maybeFailAfterCompletion(): void {
    if (this.failAfterNextCompletion) {
      this.failAfterNextCompletion = false;
      throw new Error("ambiguous committed response");
    }
  }
}
