type SqlParameter = string | number | boolean | null;

export interface UlcLinzUserAdminSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzUserAdminEntry {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly sourceRole: "admin" | "trainer" | "athlete" | "parent" | "functionary";
  readonly active: boolean;
  readonly blocked: boolean;
  readonly subjectId: string;
}

const SOURCE_ROLES = new Set(["admin", "trainer", "athlete", "parent", "functionary"]);

export class PostgresUlcLinzUserAdminOverview {
  constructor(private readonly sql: UlcLinzUserAdminSqlClient) {}

  async listUsers(organizationId: string): Promise<readonly UlcLinzUserAdminEntry[]> {
    if (!organizationId || organizationId.trim() !== organizationId || organizationId.length > 200) {
      throw new Error("Invalid user administration organization scope.");
    }
    const rows = await this.sql.unsafe(
      `SELECT membership.identity_id,
              account.username,
              account.name AS display_name,
              membership.source_role,
              membership.subject_id,
              membership.active,
              COALESCE(account.banned, false) AS blocked
       FROM ulc_linz_membership AS membership
       JOIN "user" AS account ON account.id = membership.identity_id
       WHERE membership.organization_id = $1
       ORDER BY lower(account.name), lower(account.username), membership.identity_id
       LIMIT 1000`,
      [organizationId],
    );
    const seen = new Set<string>();
    const users = rows.map((row) => {
      const identityId = requiredString(row.identity_id);
      const username = requiredString(row.username);
      const displayName = requiredString(row.display_name);
      const sourceRole = row.source_role;
      if (seen.has(identityId) || !SOURCE_ROLES.has(String(sourceRole)) ||
          typeof row.active !== "boolean" || typeof row.blocked !== "boolean") {
        throw new Error("Invalid user administration membership state.");
      }
      seen.add(identityId);
      return Object.freeze({
        identityId,
        username,
        displayName,
        sourceRole: sourceRole as UlcLinzUserAdminEntry["sourceRole"],
        subjectId: requiredString(row.subject_id),
        active: row.active,
        blocked: row.blocked,
      });
    });
    return Object.freeze(users);
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > 200 || value !== value.trim()) {
    throw new Error("Invalid user administration record.");
  }
  return value;
}
