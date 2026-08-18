import type { IdentityStateStore } from "@appbasis/identity";

import {
  UlcLinzDataExportBlockedError,
  type UlcLinzExportDataset,
  type UlcLinzExportScope,
} from "./data-export";
import type { UlcLinzSqlClient } from "./scope-persistence";

type MembershipRow = Record<string, unknown>;

/**
 * Concrete current-scope M5-E dataset reader.
 *
 * ULC-owned membership rows establish organization/subject -> identity mapping.
 * Identity master data is read only through the public IdentityStateStore owner
 * contract; this adapter never reaches into Identity-owned tables directly.
 */
export class PostgresUlcLinzExportDatasetReader {
  constructor(
    private readonly sql: UlcLinzSqlClient,
    private readonly identities: Pick<IdentityStateStore, "find">,
  ) {}

  async readDatasets(input: {
    readonly organizationId: string;
    readonly scope: UlcLinzExportScope;
    readonly subjectId: string | null;
  }): Promise<readonly UlcLinzExportDataset[]> {
    const organizationId = requiredIdentifier(input.organizationId);
    const mappings = await this.readMappings({
      organizationId,
      scope: input.scope,
      subjectId: input.subjectId,
    });

    const records = [];
    for (const mapping of mappings) {
      const identity = await this.identities.find(mapping.identityId);
      if (
        identity === null ||
        identity.identityId !== mapping.identityId ||
        identity.personId !== mapping.subjectId
      ) {
        incomplete();
      }
      records.push(
        Object.freeze({
          organizationId: mapping.organizationId,
          subjectId: mapping.subjectId,
          data: Object.freeze({
            username: requiredIdentifier(identity.username),
            displayName: requiredText(identity.displayName),
            contactEmail: optionalText(identity.contactEmail),
            createdAt: requiredDate(identity.createdAt).toISOString(),
            updatedAt: requiredDate(identity.updatedAt).toISOString(),
          }),
        }),
      );
    }

    return Object.freeze([
      Object.freeze({
        id: "member-contact",
        records: Object.freeze(records),
      }),
    ]);
  }

  private async readMappings(input: {
    organizationId: string;
    scope: UlcLinzExportScope;
    subjectId: string | null;
  }): Promise<readonly {
    identityId: string;
    organizationId: string;
    subjectId: string;
  }[]> {
    if (input.scope === "organization") {
      if (input.subjectId !== null) incomplete();
      const rows = await this.sql.unsafe(
        `SELECT identity_id, organization_id, subject_id
         FROM ulc_linz_membership
         WHERE organization_id = $1
           AND active = true
         ORDER BY subject_id ASC, identity_id ASC`,
        [input.organizationId],
      );
      return Object.freeze(rows.map(mappingFromRow));
    }

    const subjectId = requiredIdentifier(input.subjectId);
    const rows = await this.sql.unsafe(
      `SELECT identity_id, organization_id, subject_id
       FROM ulc_linz_membership
       WHERE organization_id = $1
         AND subject_id = $2
         AND active = true`,
      [input.organizationId, subjectId],
    );
    if (rows.length !== 1) incomplete();
    const mapping = mappingFromRow(rows[0]);
    if (
      mapping.organizationId !== input.organizationId ||
      mapping.subjectId !== subjectId
    ) {
      incomplete();
    }
    return Object.freeze([mapping]);
  }
}

function mappingFromRow(row: MembershipRow | undefined) {
  if (row === undefined) incomplete();
  return Object.freeze({
    identityId: requiredIdentifier(row.identity_id),
    organizationId: requiredIdentifier(row.organization_id),
    subjectId: requiredIdentifier(row.subject_id),
  });
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value !== value.trim()
  ) {
    incomplete();
  }
  return value;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    incomplete();
  }
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === null) return null;
  return requiredText(value);
}

function requiredDate(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) incomplete();
  return value;
}

function incomplete(): never {
  throw new UlcLinzDataExportBlockedError("DATASET_INCOMPLETE");
}
