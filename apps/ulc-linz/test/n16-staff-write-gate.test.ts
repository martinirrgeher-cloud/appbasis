import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// N16 is security groundwork only. No trainer/admin impersonation must become
// an active HTTP write before a canonical Better Auth session can be locked
// or revalidated in the SAME PostgreSQL transaction as the registration.
const source = (file: string) => readFileSync(
  new URL("../worker/" + file, import.meta.url),
  "utf8",
);

describe("N16 staff write activation gate – intentionally blocked", () => {
  it("does not expose the new staff guard from the active HTTP router", () => {
    const router = source("index.ts");
    expect(router).not.toContain('from "./staff-registration-guard"');
    expect(router).not.toContain('from "./staff-registration-module-authority"');
    expect(router).not.toContain('from "./staff-session-guard"');
    expect(router).not.toContain('from "./staff-registration-transaction"');
    expect(router).not.toContain("assertUlcStaffRegistrationGuard(");
    expect(router).not.toContain("withAuthorizedRegistrationTransaction(");
    // Only the previously accepted athlete-based proxy is live.
    expect(router).toContain('"/api/modules/kindertraining/registration/proxy"');
  });

  it("does not route the existing athlete registration service through an unreviewed staff writer", () => {
    const active = source("self-registration-service.ts");
    expect(active).not.toContain("assertUlcStaffRegistrationGuard");
    expect(active).not.toContain("assertUlcStaffRegistrationModuleAuthority");
    expect(active).not.toContain("withGuardedUlcStaffRegistration");
    expect(active).not.toContain("withAuthorizedRegistrationTransaction");
    expect(active).toContain("withRegistrationTransaction");
  });

  it("keeps the new staff transaction helper independent of the legacy writer", () => {
    const repository = source("training-session-postgres.ts");
    expect(repository).toContain("async withAuthorizedRegistrationTransaction<T>(");
    expect(repository).toContain("await authorize(transaction);");
    expect(repository).toContain("return callback(scopedSessions, transaction);");
    const composite = source("staff-registration-transaction.ts");
    expect(composite).toContain("assertActiveUlcStaffSession(");
    expect(composite).toContain("assertUlcStaffRegistrationGuard(");
    expect(composite).toContain("await assertUlcStaffSessionStillValid(");
    expect(repository).toContain("async withRegistrationTransaction<T>(");
    expect(repository).toContain("callback(sessions)");
  });

  it("requires a self-registration group and locks actor/membership/group/target rows", () => {
    const guard = source("staff-registration-guard.ts");
    expect(guard).toContain("attendance_mode = 'self_registration'");
    expect(guard).toContain("FOR SHARE");
    expect(guard).toContain("memberships.length !== 1");
    expect(guard).toContain("eligible.length !== 1");
    expect(guard).toContain("const permission = await new PostgresPermissionStore(transaction)");
  });
});
