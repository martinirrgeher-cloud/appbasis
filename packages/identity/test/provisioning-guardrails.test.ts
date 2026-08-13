import { describe, expect, it } from "vitest";

import type {
  AccountStatus,
  AuthSession,
  IdentityOperation,
  IdentityOperationKind,
  IdentityPersistenceState,
  IdentityStateStore,
} from "../src/contracts";
import { IdentityService } from "../src/service";

const fixedNow = new Date("2026-08-13T10:00:00.000Z");

describe("IdentityService provisioning guardrails", () => {
  it("returns the actual provider account status after provisioning", async () => {
    const auth = new ProvisioningAuthProvider("disabled");
    const service = new IdentityService(auth, new ProvisioningStateStore(), () => fixedNow);

    await expect(
      service.createInitialUser({
        username: "disabled.provider",
        temporaryPassword: "temporary-password",
        displayName: "Disabled Provider",
      }),
    ).resolves.toMatchObject({
      username: "disabled.provider",
      accountStatus: "disabled",
    });
  });

  it("re-reads provider status on an idempotent completed provisioning retry", async () => {
    const auth = new ProvisioningAuthProvider("active");
    const state = new ProvisioningStateStore();
    const service = new IdentityService(auth, state, () => fixedNow);
    const input = {
      username: "retry.status",
      temporaryPassword: "temporary-password",
      displayName: "Retry Status",
    };

    await expect(service.createInitialUser(input)).resolves.toMatchObject({
      accountStatus: "active",
    });
    auth.accountStatus = "disabled";
    await expect(service.createInitialUser(input)).resolves.toMatchObject({
      accountStatus: "disabled",
    });
    expect(auth.createCalls).toBe(1);
    expect(auth.accountStatusReads).toBe(2);
  });
});

class ProvisioningAuthProvider {
  createCalls = 0;
  accountStatusReads = 0;

  constructor(public accountStatus: AccountStatus) {}

  async createUsernameAccount(): Promise<{ identityId: string }> {
    this.createCalls += 1;
    return { identityId: "identity-guardrail" };
  }

  async getAccountStatus(): Promise<AccountStatus> {
    this.accountStatusReads += 1;
    return this.accountStatus;
  }

  async signInWithUsername(): Promise<AuthSession> {
    throw new Error("not used");
  }

  async getSession(): Promise<AuthSession | null> {
    return null;
  }

  async changePassword(): Promise<AuthSession> {
    throw new Error("not used");
  }

  async disableIdentity(): Promise<void> {
    throw new Error("not used");
  }

  async endSession(): Promise<void> {
    throw new Error("not used");
  }
}

class ProvisioningStateStore implements IdentityStateStore {
  private state: IdentityPersistenceState | null = null;
  private operation: IdentityOperation | null = null;

  async findOperation(operationKey: string): Promise<IdentityOperation | null> {
    return this.operation?.operationKey === operationKey ? this.operation : null;
  }

  async prepareOperation(input: {
    operationKey: string;
    kind: IdentityOperationKind;
    identityId: string | null;
  }): Promise<IdentityOperation> {
    if (this.operation !== null) return this.operation;
    this.operation = {
      ...input,
      operationId: "operation-guardrail",
      completedAt: null,
      createdAt: fixedNow,
    };
    return this.operation;
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
      createdAt: fixedNow,
      updatedAt: fixedNow,
      passwordChangedAt: null,
      disabledAt: null,
    };
    this.operation = {
      operationId: input.operationId,
      operationKey: `provision:${input.username}`,
      kind: "provision",
      identityId: input.identityId,
      completedAt: input.completedAt,
      createdAt: fixedNow,
    };
    return this.state;
  }

  async create(input: {
    identityId: string;
    username: string;
    displayName: string;
    contactEmail: string | null;
  }): Promise<IdentityPersistenceState> {
    return this.completeProvisioning({
      ...input,
      operationId: "operation-create",
      completedAt: fixedNow,
    });
  }

  async find(identityId: string): Promise<IdentityPersistenceState | null> {
    return this.state?.identityId === identityId ? this.state : null;
  }

  async markPasswordChanged(): Promise<IdentityPersistenceState> {
    throw new Error("not used");
  }

  async recordDisabled(): Promise<IdentityPersistenceState> {
    throw new Error("not used");
  }
}
