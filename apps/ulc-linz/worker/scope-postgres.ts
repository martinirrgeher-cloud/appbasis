import type { IdentityPostgresRuntimeSqlClient } from "@appbasis/identity/postgres-runtime";

import type {
  UlcLinzMembershipResolution,
  UlcLinzMembershipResolver,
  UlcLinzSubjectRelation,
  UlcLinzSubjectScopeResolver,
} from "./authorization";

export interface UlcLinzScopeResolver
  extends UlcLinzMembershipResolver,
    UlcLinzSubjectScopeResolver {
  resolveActiveOrganizationId(identityId: string): Promise<string | null>;
}

export class PostgresUlcLinzScopeResolver implements UlcLinzScopeResolver {
  constructor(private readonly sql: IdentityPostgresRuntimeSqlClient) {}

  async resolveActiveOrganizationId(identityId: string): Promise<string | null> {
    const normalizedIdentityId = requiredIdentifier(identityId);
    const rows = await this.sql.unsafe(
      `SELECT organization_id
       FROM ulc_linz_membership
       WHERE identity_id = $1
         AND active = true
       LIMIT 2`,
      [normalizedIdentityId],
    );

    if (!Array.isArray(rows) || rows.length !== 1) return null;
    return rowIdentifier(rows[0], "organization_id");
  }

  async resolveMembership(input: {
    identityId: string;
    organizationId: string;
  }): Promise<UlcLinzMembershipResolution | null> {
    const identityId = requiredIdentifier(input.identityId);
    const organizationId = requiredIdentifier(input.organizationId);
    const rows = await this.sql.unsafe(
      `SELECT organization_id, source_role, active
       FROM ulc_linz_membership
       WHERE identity_id = $1
         AND organization_id = $2
       LIMIT 2`,
      [identityId, organizationId],
    );

    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const row = record(rows[0]);
    if (row === null) return null;
    const resolvedOrganizationId = rowIdentifier(row, "organization_id");
    const sourceRole = rowString(row, "source_role");
    const active = row.active;
    if (
      resolvedOrganizationId === null ||
      sourceRole === null ||
      typeof active !== "boolean"
    ) {
      return null;
    }

    return Object.freeze({
      organizationId: resolvedOrganizationId,
      sourceRole,
      active,
    });
  }

  async hasRelation(input: {
    identityId: string;
    organizationId: string;
    subjectId: string;
    relationType: UlcLinzSubjectRelation;
  }): Promise<boolean> {
    const identityId = requiredIdentifier(input.identityId);
    const organizationId = requiredIdentifier(input.organizationId);
    const subjectId = requiredIdentifier(input.subjectId);
    if (input.relationType !== "self" && input.relationType !== "managed") {
      return false;
    }

    const rows = await this.sql.unsafe(
      `SELECT 1 AS related
       FROM ulc_linz_subject_scope
       WHERE identity_id = $1
         AND organization_id = $2
         AND subject_id = $3
         AND relation_type = $4
       LIMIT 1`,
      [identityId, organizationId, subjectId, input.relationType],
    );

    return Array.isArray(rows) && rows.length === 1;
  }
}

function requiredIdentifier(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new Error("ULC Linz scope identifier is invalid.");
  }
  return value;
}

function rowIdentifier(value: unknown, field: string): string | null {
  const row = record(value);
  if (row === null) return null;
  const candidate = row[field];
  return typeof candidate === "string" &&
    candidate.length > 0 &&
    candidate.length <= 200 &&
    candidate.trim() === candidate
    ? candidate
    : null;
}

function rowString(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];
  return typeof candidate === "string" &&
    candidate.length > 0 &&
    candidate.length <= 200 &&
    candidate.trim() === candidate
    ? candidate
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
