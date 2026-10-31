import { hashIdentityTemporaryPassword } from "@appbasis/identity";

type SqlValue = string | number | boolean | null;
type Rows = readonly Record<string, unknown>[];

export interface UlcUserAccountSql {
  unsafe(query: string, parameters?: SqlValue[]): PromiseLike<Rows>;
  begin<T>(callback: (transaction: { unsafe(query: string, parameters?: SqlValue[]): PromiseLike<Rows> }) => Promise<T>): Promise<T>;
}

export class UlcUserAccountError extends Error {
  constructor(readonly code: "INVALID" | "NOT_FOUND" | "DENIED" | "CONFLICT") {
    super("ULC user account administration " + code.toLowerCase());
    this.name = "UlcUserAccountError";
  }
}

const ID_OK = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 200 && s.trim() === s &&
  !/[\u0000-\u001f\u007f]/.test(s);
const VALID_PASSWORD = (v: unknown): v is string =>
  typeof v === "string" && v.length >= 8 && v.length <= 128 && v.trim() === v &&
  !/[\u0000-\u001f\u007f]/.test(v);

interface Target {
  identity_id: string;
  username: string;
  source_role: string;
  active: boolean;
  banned: boolean;
  role: string | null;
  subject_active: boolean | null;
  credential_id: string | null;
  disabled_at: string | null;
}

export class UlcLinzUserAccountService {
  constructor(
    private readonly sql: UlcUserAccountSql,
    private readonly hashPassword: (password: string) => Promise<string> = hashIdentityTemporaryPassword,
  ) {}

  private async target(tx: UlcUserAccountSql, org: string, id: string): Promise<Target> {
    const rows = await tx.unsafe(
      `SELECT membership.identity_id, membership.source_role, membership.active,
              account.username, COALESCE(account.banned,false) AS banned,
              account.role, state.disabled_at,
              credential.id AS credential_id,
              CASE
                WHEN membership.source_role='trainer' THEN trainer.is_active
                WHEN membership.source_role='athlete' THEN athlete.is_active
                ELSE false
              END AS subject_active
       FROM ulc_linz_membership membership
       JOIN "user" account ON account.id=membership.identity_id
       JOIN appbasis_identity_security_state state ON state.identity_id=account.id
       LEFT JOIN account credential ON credential.user_id=account.id AND credential.provider_id='credential'
       LEFT JOIN appbasis_trainer trainer ON trainer.organization_id=membership.organization_id
         AND trainer.id=membership.subject_id AND membership.source_role='trainer'
       LEFT JOIN appbasis_athlete athlete ON athlete.organization_id=membership.organization_id
         AND athlete.id=membership.subject_id AND membership.source_role='athlete'
       WHERE membership.organization_id=$1 AND membership.identity_id=$2
       FOR UPDATE OF membership, account, state`,
      [org, id],
    );
    if (rows.length === 0) throw new UlcUserAccountError("NOT_FOUND");
    if (rows.length !== 1) throw new UlcUserAccountError("CONFLICT");
    const row = rows[0] as unknown as Target;
    // Business-admin or technical Better Auth administrators are never
    // editable by this organization-scoped endpoint.
    if ((row.source_role !== "trainer" && row.source_role !== "athlete") ||
      row.role?.split(",").map(s => s.trim()).includes("admin") ||
      row.role?.split(",").map(s => s.trim()).includes("superadmin")) {
      throw new UlcUserAccountError("DENIED");
    }
    if (!ID_OK(row.username)) throw new UlcUserAccountError("CONFLICT");
    return row;
  }

  async resetTemporaryPassword(
    organizationId: string,
    actorPrincipalId: string,
    userId: string,
    temporaryPassword: unknown,
  ): Promise<Readonly<{ identityId: string; username: string }>> {
    if (![organizationId, actorPrincipalId, userId].every(ID_OK) ||
      actorPrincipalId === userId || !VALID_PASSWORD(temporaryPassword)) {
      throw new UlcUserAccountError("INVALID");
    }
    // Use Better Auth's own scrypt implementation; never store plaintext.
    const hash = await this.hashPassword(temporaryPassword);
    if (!hash || typeof hash !== "string") throw new UlcUserAccountError("CONFLICT");

    return this.sql.begin(async (tx) => {
      const target = await this.target(tx, organizationId, userId);
      if (!target.active || target.banned || target.subject_active !== true ||
        target.disabled_at !== null || !target.credential_id) {
        throw new UlcUserAccountError("DENIED");
      }
      const credentials = await tx.unsafe(
        'UPDATE account SET password=$1, updated_at=now() WHERE id=$2 AND user_id=$3 AND provider_id=\'credential\' RETURNING id',
        [hash, target.credential_id, userId],
      );
      if (credentials.length !== 1) throw new UlcUserAccountError("CONFLICT");
      const states = await tx.unsafe(
        'UPDATE appbasis_identity_security_state SET must_change_password=true, password_changed_at=NULL, updated_at=now() WHERE identity_id=$1 RETURNING identity_id',
        [userId],
      );
      if (states.length !== 1) throw new UlcUserAccountError("CONFLICT");
      await tx.unsafe('DELETE FROM "session" WHERE user_id=$1', [userId]);
      return Object.freeze({ identityId: userId, username: target.username });
    });
  }

  async changeStatus(
    organizationId: string,
    actorPrincipalId: string,
    userId: string,
    action: "block" | "unblock" | "reactivate",
  ): Promise<Readonly<{ identityId: string; username: string; action: string }>> {
    if (![organizationId, actorPrincipalId, userId].every(ID_OK) ||
      actorPrincipalId === userId ||
      !["block", "unblock", "reactivate"].includes(action)) {
      throw new UlcUserAccountError("INVALID");
    }
    return this.sql.begin(async (tx) => {
      const target = await this.target(tx, organizationId, userId);
      if (target.subject_active !== true || target.disabled_at !== null) {
        throw new UlcUserAccountError("DENIED");
      }
      if (action === "block") {
        if (!target.active || target.banned) throw new UlcUserAccountError("CONFLICT");
        await tx.unsafe(
          `UPDATE "user" SET banned=true, ban_reason='ULC administrator blocked account',
             ban_expires=NULL, updated_at=now() WHERE id=$1`,
          [userId],
        );
      } else if (action === "unblock") {
        if (!target.active || !target.banned) throw new UlcUserAccountError("CONFLICT");
        await tx.unsafe(
          `UPDATE "user" SET banned=false, ban_reason=NULL, ban_expires=NULL,
             updated_at=now() WHERE id=$1`,
          [userId],
        );
      } else {
        // Re-enable only the user membership. Expired group memberships are
        // deliberately left unchanged and are NOT resurrected.
        if (target.active || target.banned) throw new UlcUserAccountError("CONFLICT");
        await tx.unsafe(
          `UPDATE ulc_linz_membership SET active=true, ended_at=NULL,
             updated_at=now() WHERE organization_id=$1 AND identity_id=$2`,
          [organizationId, userId],
        );
      }
      await tx.unsafe('DELETE FROM "session" WHERE user_id=$1', [userId]);
      return Object.freeze({ identityId: userId, username: target.username, action });
    });
  }
}
