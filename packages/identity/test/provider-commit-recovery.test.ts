import { describe, expect, it } from "vitest";

import type {
  AuthSession,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityStateStore,
} from "../src/contracts";
import { IdentityService } from "../src/service";

const now = new Date("2026-08-12T19:45:00.000Z");
const idempotencyKey = "88888888-8888-4888-8888-888888888888";

describe("provider-committed password recovery", () => {
  it("recovers only after the new password proves the identity", async () => {
    const auth = new ProviderCommittedAuth();
    const state = new RecoveryStateStore();
    const service = new IdentityService(auth, state, () => now);

    const identity = await service.createInitialUser({
      username: "provider.commit",
      temporaryPassword: "temporary",
      displayName: "Provider Commit",
    });
    const session = await service.signInWithUsername({
      username: "provider.commit",
      password: "temporary",
    });

    auth.failAfterNextPasswordCommit = true;
    const input = {
      sessionToken: session.sessionToken,
      currentPassword: "temporary",
      newPassword: "changed",
      idempotencyKey,
    };

    await expect(service.changeRequiredPassword(input)).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_FAILED",
    });
    await expect(service.getCurrentIdentity(session.sessionToken)).resolves.toBeNull();
    await expect(state.find(identity.identityId)).resolves.toMatchObject({
      mustChangePassword: true,
    });

    await expect(
      service.changeRequiredPassword({ ...input, newPassword: "wrong-password" }),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });
    await expect(state.find(identity.identityId)).resolves.toMatchObject({
      mustChangePassword: true,
    });

    const recovered = await service.changeRequiredPassword(input);
    expect(recovered).toMatchObject({
      identity: { identityId: identity.identityId, mustChangePassword: false },
      access: "full",
    });
    await expect(service.getCurrentIdentity(recovered.sessionToken)).resolves.toMatchObject({
      access: "full",
      identity: { identityId: identity.identityId },
    });
    expect(auth.passwordChangeCalls).toBe(1);
  });
});

class ProviderCommittedAuth {
  failAfterNextPasswordCommit = false;
  passwordChangeCalls = 0;

  private readonly identityId = "identity-provider-commit";
  private password = "temporary";
  private readonly sessions = new Set<string>();
  private completedPasswordOperation: string | null = null;

  async createUsernameAccount(input: {
    operationId: string;
    username: string;
    displayName: string;
    technicalEmail: string;
    temporaryPassword: string;
  }): Promise<{ identityId: string }> {
    this.password = input.temporaryPassword;
    return { identityId: this.identityId };
  }

  async signInWithUsername(input: {
    username: string;
    password: string;
  }): Promise<AuthSession> {
    if (input.password !== this.password) throw new Error("invalid password");
    const sessionToken = `signed-in-${this.sessions.size + 1}`;
    this.sessions.add(sessionToken);
    return { identityId: this.identityId, sessionToken };
  }

  async getSession(sessionToken: string): Promise<AuthSession | null> {
    return this.sessions.has(sessionToken)
      ? { identityId: this.identityId, sessionToken }
      : null;
  }

  async changePassword(input: {
    operationId: string;
    sessionToken: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }): Promise<AuthSession> {
    if (this.completedPasswordOperation !== input.operationId) {
      if (!this.sessions.has(input.sessionToken) || input.currentPassword !== this.password) {
        throw new Error("invalid current password");
      }
      this.passwordChangeCalls += 1;
      this.password = input.newPassword;
      this.completedPasswordOperation = input.operationId;
      this.sessions.clear();
      this.sessions.add("replacement-session-token");
    }

    if (this.failAfterNextPasswordCommit) {
      this.failAfterNextPasswordCommit = false;
      throw new Error("ambiguous provider-committed response");
    }

    return {
      identityId: this.identityId,
      sessionToken: "replacement-session-token",
    };
  }

  async getAccountStatus(): Promise<"active"> {
    return "active";
  }

  async disableIdentity(): Promise<void> {}

  async endSession(sessionToken: string): Promise<void> {
    this.sessions.delete(sessionToken);
  }
}

class RecoveryStateStore implements IdentityStateStore {
  private state: IdentityPersistenceState | null = null;
  private readonly operations = new Map<string, IdentityOperation>();

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
    const operation: IdentityOperation = {
      operationId: `operation-${this.operations.size + 1}`,
      operationKey: input.operationKey,
      kind: input.kind,
      identityId: input.identityId,
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
    this.state = {
      identityId: input.identityId,
      username: input.username,
      displayName: input.displayName,
      contactEmail: input.contactEmail,
      personId: null,
      mustChangePassword: true,
      createdAt: input.completedAt,
      updatedAt: input.completedAt,
      passwordChangedAt: null,
      disabledAt: null,
    };
    this.complete(input.operationId, input.identityId, input.completedAt);
    return this.state;
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
      createdAt: now,
      updatedAt: now,
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
    const state = await this.require(identityId);
    this.state = {
      ...state,
      mustChangePassword: false,
      passwordChangedAt: changedAt,
      updatedAt: changedAt,
    };
    this.complete(operationId, identityId, changedAt);
    return this.state;
  }

  async recordDisabled(
    identityId: string,
    disabledAt: Date,
    operationId: string,
  ): Promise<IdentityPersistenceState> {
    const state = await this.require(identityId);
    this.state = { ...state, disabledAt, updatedAt: disabledAt };
    this.complete(operationId, identityId, disabledAt);
    return this.state;
  }

  private async require(identityId: string): Promise<IdentityPersistenceState> {
    const state = await this.find(identityId);
    if (state === null) throw new Error("missing identity state");
    return state;
  }

  private complete(operationId: string, identityId: string, completedAt: Date): void {
    for (const [key, operation] of this.operations) {
      if (operation.operationId === operationId) {
        this.operations.set(key, { ...operation, identityId, completedAt });
      }
    }
  }
}
