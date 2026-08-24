import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { createIdentityRuntime, PostgresIdentityStateStore } from "@appbasis/identity/server";
import { PostgresPermissionStore } from "@appbasis/permissions";
import { describe, expect, it, vi } from "vitest";

import { PostgresUlcLinzExportDatasetReader } from "../worker/data-export-postgres";
import { exportUlcLinzDataWithCanonicalAuthorization } from "../worker/data-export-service";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const RECONCILIATION_EVIDENCE_PATH =
  process.env.APPBASIS_M5_RESTORE_RECONCILIATION_EVIDENCE_PATH?.trim() ?? "";
const RESTORE_BASE_URL = "https://m5-restore-export.invalid";
const ORGANIZATION_ID = "ulc-linz";
const runOnRestore =
  DATABASE_URL.length > 0 && RECONCILIATION_EVIDENCE_PATH.length > 0 ? it : it.skip;

describe("ULC restored production export evidence", () => {
  runOnRestore(
    "executes the canonical authorized PostgreSQL export and rejects cross-organization access on the exact restored database",
    async () => {
      // The companion restore smoke reconciles the same isolated database. Wait for
      // its evidence before adding export fixtures so both test files cannot race.
      await waitForReconciliationEvidence(RECONCILIATION_EVIDENCE_PATH);

      const connection = createPostgresDatabase(DATABASE_URL);
      const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
      const bootstrapUsername = `m5.restore.export.bootstrap.${suffix}`;
      const bootstrapPassword = `M5!RestoreExportBootstrap-${randomUUID()}Aa7`;
      const username = `m5.restore.export.admin.${suffix}`;
      const temporaryPassword = `M5!RestoreExportAdmin-${randomUUID()}Aa7`;
      const authSecret = `restore-export-${randomUUID()}-${randomUUID()}`;

      try {
        const auth = createBetterAuthRuntime({
          database: connection.database,
          baseURL: RESTORE_BASE_URL,
          secret: authSecret,
        });
        await auth.api.createUser({
          body: {
            email: `${bootstrapUsername}@identity.invalid`,
            password: bootstrapPassword,
            name: "M5 Restore Export Bootstrap",
            role: "admin",
            data: {
              username: bootstrapUsername,
              displayUsername: bootstrapUsername,
            },
          },
        });
        const administrativeSessionToken = await signInCookie(
          auth,
          bootstrapUsername,
          bootstrapPassword,
        );
        const identityRuntime = createIdentityRuntime({
          auth,
          sql: connection.client,
          baseURL: RESTORE_BASE_URL,
          administrativeSessionToken,
        });
        const identity = await identityRuntime.service.createInitialUser({
          username,
          temporaryPassword,
          displayName: "M5 Restore Export Admin",
          contactEmail: `${username}@identity.invalid`,
        });
        if (identity.personId === null) {
          throw new Error("Restore export probe requires a person id.");
        }

        const signedIn = await identityRuntime.service.signInWithUsername({
          username,
          password: temporaryPassword,
        });
        expect(signedIn.access).toBe("password-change-required");
        const current = await identityRuntime.service.changeRequiredPassword({
          sessionToken: signedIn.sessionToken,
          currentPassword: temporaryPassword,
          newPassword: `${temporaryPassword}-changed`,
          idempotencyKey: randomUUID(),
        });
        expect(current.access).toBe("full");

        await connection.client.unsafe(
          `INSERT INTO appbasis_permission_role (role_id)
           VALUES ('ulc-linz:admin')
           ON CONFLICT (role_id) DO NOTHING`,
        );
        await connection.client.unsafe(
          `INSERT INTO appbasis_permission_principal (principal_id)
           VALUES ($1)`,
          [identity.identityId],
        );
        await connection.client.unsafe(
          `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
           VALUES ($1, 'ulc-linz:admin')`,
          [identity.identityId],
        );
        await connection.client.unsafe(
          `INSERT INTO ulc_linz_membership
             (identity_id, organization_id, subject_id, source_role, active, ended_at)
           VALUES ($1, $2, $3, 'admin', true, NULL)`,
          [identity.identityId, ORGANIZATION_ID, identity.personId],
        );

        const scopes = new PostgresUlcLinzScopePersistence(connection.client);
        const permissions = new PostgresPermissionStore(connection.client);
        const identities = new PostgresIdentityStateStore(connection.client);
        const reader = new PostgresUlcLinzExportDatasetReader(connection.client, identities);
        const recordExportAudit = vi.fn(async () => {});
        const readDatasets = vi.fn(reader.readDatasets.bind(reader));
        const dependencies = {
          permissions,
          memberships: scopes,
          subjectScopes: scopes,
          readDatasets,
          recordExportAudit,
          now: () => new Date(),
        };

        const result = await exportUlcLinzDataWithCanonicalAuthorization(
          current,
          dependencies,
          {
            organizationId: ORGANIZATION_ID,
            scope: "organization",
          },
        );
        expect(result.json.datasets["member-contact"]).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              username,
              displayName: "M5 Restore Export Admin",
              contactEmail: `${username}@identity.invalid`,
            }),
          ]),
        );
        expect(recordExportAudit).toHaveBeenCalledTimes(1);
        expect(readDatasets).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain(temporaryPassword);
        expect(JSON.stringify(result)).not.toContain(current.sessionToken);

        readDatasets.mockClear();
        await expect(
          exportUlcLinzDataWithCanonicalAuthorization(
            current,
            dependencies,
            {
              organizationId: "other-organization",
              scope: "organization",
            },
          ),
        ).rejects.toMatchObject({ code: "AUTHORIZATION_MISMATCH" });
        expect(readDatasets).not.toHaveBeenCalled();
      } finally {
        await connection.client.end();
      }
    },
    30_000,
  );
});

async function waitForReconciliationEvidence(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Restore reconciliation evidence was not produced before export verification.");
}

async function signInCookie(
  auth: ReturnType<typeof createBetterAuthRuntime>,
  username: string,
  password: string,
): Promise<string> {
  const response = await auth.handler(
    new Request(`${RESTORE_BASE_URL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) {
    throw new Error("Restore export bootstrap sign-in failed.");
  }
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) {
    throw new Error("Restore export bootstrap returned no session cookie.");
  }
  return cookie.split(";", 1)[0] ?? cookie;
}
