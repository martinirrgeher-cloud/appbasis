import type {
  UlcLinzCountdownMembership,
  UlcLinzCountdownMembershipResolver,
} from "./countdown-access";

type UlcLinzCountdownSqlParameter = string | number | boolean | null;

export interface UlcLinzCountdownSqlClient {
  unsafe(
    query: string,
    parameters?: UlcLinzCountdownSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export class PostgresUlcLinzCountdownMembershipResolver
  implements UlcLinzCountdownMembershipResolver
{
  constructor(private readonly sql: UlcLinzCountdownSqlClient) {}

  async resolveMembershipForIdentity(
    identityId: string,
  ): Promise<UlcLinzCountdownMembership | null> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const rows = await this.sql.unsafe(
      `SELECT organization_id, source_role, active
       FROM ulc_linz_membership
       WHERE identity_id = $1`,
      [normalizedIdentityId],
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) blocked();

    const row = rows[0];
    if (row === undefined) blocked();
    const organizationId = row.organization_id;
    const sourceRole = row.source_role;
    const active = row.active;
    if (
      typeof organizationId !== "string" ||
      organizationId.length === 0 ||
      organizationId.length > 200 ||
      organizationId !== organizationId.trim() ||
      typeof sourceRole !== "string" ||
      sourceRole.length === 0 ||
      sourceRole.length > 200 ||
      sourceRole !== sourceRole.trim() ||
      typeof active !== "boolean"
    ) {
      blocked();
    }

    return Object.freeze({
      organizationId,
      sourceRole,
      active,
    });
  }
}

export class UlcLinzCountdownMembershipStateError extends Error {
  readonly code = "ULC_LINZ_COUNTDOWN_MEMBERSHIP_STATE_INVALID";

  constructor() {
    super("ULC Linz countdown membership state is invalid.");
    this.name = "UlcLinzCountdownMembershipStateError";
  }
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    blocked();
  }
  return value;
}

function blocked(): never {
  throw new UlcLinzCountdownMembershipStateError();
}
