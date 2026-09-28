import { describe, expect, it } from "vitest";

import {
  PostgresUlcLinzTrainerIdentityLinks,
  UlcLinzTrainerIdentityConflictError,
  UlcLinzTrainerIdentityNotFoundError,
} from "../worker/trainer-identity-postgres";

describe("ULC trainer identity PostgreSQL contract", () => {
  it("lists active trainer identities and resolves existing trainer subjects", async () => {
    const repository = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe(query, parameters) {
        expect(query).toContain("membership.source_role = 'trainer'");
        expect(query).toContain("COALESCE(account.banned, false) = false");
        expect(query).toContain("trainer.is_active = true");
        expect(parameters).toEqual(["verein-1"]);
        return [
          {
            identity_id: "identity-1",
            username: "trainer.one",
            display_name: "Trainer One",
            trainer_id: "trainer-1",
          },
          {
            identity_id: "identity-2",
            username: "trainer.two",
            display_name: "Trainer Two",
            trainer_id: null,
          },
        ];
      },
    });

    await expect(repository.listBindings("verein-1")).resolves.toEqual([
      {
        identityId: "identity-1",
        username: "trainer.one",
        displayName: "Trainer One",
        trainerId: "trainer-1",
      },
      {
        identityId: "identity-2",
        username: "trainer.two",
        displayName: "Trainer Two",
        trainerId: null,
      },
    ]);
  });

  it("binds only an active same-organization trainer identity to an active trainer", async () => {
    const repository = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe(query, parameters) {
        expect(query).toContain("target_identity AS MATERIALIZED");
        expect(query).toContain("target_trainer AS MATERIALIZED");
        expect(query).toContain("releasable_conflict AS MATERIALIZED");
        expect(query).toContain("organization_id = $2");
        expect(query).toContain("source_role = 'trainer'");
        expect(query).toContain("AND EXISTS (SELECT 1 FROM target_identity)");
        expect(query).toContain("AND EXISTS (SELECT 1 FROM target_trainer)");
        expect(query).toContain("account_missing = false");
        expect(query).toContain("account_banned = false");
        expect(query).toContain("FOR UPDATE OF membership");
        expect(query).toContain("FOR SHARE");
        expect(query).toContain("INSERT INTO ulc_linz_trainer_identity_audit");
        expect(parameters).toEqual(["identity-1", "verein-1", "trainer-1", "admin-1"]);
        return [
          {
            identity_exists: true,
            trainer_exists: true,
            binding_conflict: false,
            released_conflict_count: 0,
            released_audit_count: 0,
            target_audit_count: 1,
            updated_count: 1,
            identity_id: "identity-1",
            username: "trainer.one",
            display_name: "Trainer One",
            trainer_id: "trainer-1",
          },
        ];
      },
    });

    await expect(
      repository.bindTrainer({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        identityId: "identity-1",
        trainerId: "trainer-1",
      }),
    ).resolves.toMatchObject({
      identityId: "identity-1",
      trainerId: "trainer-1",
    });
  });

  it("atomically releases a stale disabled identity before relinking its trainer", async () => {
    const repository = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe(query) {
        expect(query).toContain("releasable_conflict AS MATERIALIZED");
        expect(query).toContain("released_conflict AS");
        expect(query).toContain("'ulc-detached-trainer:' || md5(identity_id)");
        expect(query).toContain("account_banned = true");
        return [
          {
            identity_exists: true,
            trainer_exists: true,
            binding_conflict: false,
            released_conflict_count: 1,
            released_audit_count: 1,
            target_audit_count: 1,
            updated_count: 1,
            identity_id: "identity-2",
            username: "trainer.two",
            display_name: "Trainer Two",
            trainer_id: "trainer-1",
          },
        ];
      },
    });

    await expect(
      repository.bindTrainer({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        identityId: "identity-2",
        trainerId: "trainer-1",
      }),
    ).resolves.toMatchObject({
      identityId: "identity-2",
      trainerId: "trainer-1",
    });
  });

  it("maps a concurrent subject uniqueness race to an explicit conflict", async () => {
    const repository = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe() {
        throw {
          code: "23505",
          constraint_name: "ulc_linz_membership_subject_id_unique",
        };
      },
    });

    await expect(
      repository.bindTrainer({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        identityId: "identity-1",
        trainerId: "trainer-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityConflictError);
  });

  it("distinguishes missing targets from an already-linked trainer", async () => {
    const missing = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe() {
        return [
          {
            identity_exists: false,
            trainer_exists: true,
            binding_conflict: false,
            updated_count: 0,
            identity_id: null,
            username: null,
            display_name: null,
            trainer_id: null,
          },
        ];
      },
    });
    await expect(
      missing.bindTrainer({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        identityId: "missing",
        trainerId: "trainer-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityNotFoundError);

    const conflict = new PostgresUlcLinzTrainerIdentityLinks({
      async unsafe() {
        return [
          {
            identity_exists: true,
            trainer_exists: true,
            binding_conflict: true,
            updated_count: 0,
            identity_id: null,
            username: null,
            display_name: null,
            trainer_id: null,
          },
        ];
      },
    });
    await expect(
      conflict.bindTrainer({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        identityId: "identity-1",
        trainerId: "trainer-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzTrainerIdentityConflictError);
  });
});
