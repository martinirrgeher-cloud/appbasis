import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertUlcVerifiedBlockUsagePreviewReadiness,
  UlcVerifiedBlockUsageUnavailableError,
} from "../worker/training-block-verified-runtime-readiness";

interface ScopeRecord {
  readonly database_name: string;
  readonly principal_name: string;
  readonly public_tables: number;
  readonly plan_table_exists: boolean;
  readonly plan_revision_exists: boolean;
  readonly plan_item_exists: boolean;
  readonly usage_table_exists: boolean;
  readonly subject_table_exists: boolean;
  readonly deletion_table_exists: boolean;
  readonly may_insert_subject: boolean;
  readonly may_read_subject: boolean;
  readonly may_read_deletion: boolean;
  readonly may_insert_usage: boolean;
  readonly may_read_plan: boolean;
  readonly may_read_plan_revision: boolean;
  readonly may_read_plan_item: boolean;
}

const BASE: ScopeRecord = {
  database_name: "appbasis_ulc_linz_preview",
  principal_name: "appbasis_ulc_linz_preview_application",
  public_tables: 66,
  plan_table_exists: true,
  plan_revision_exists: true,
  plan_item_exists: true,
  usage_table_exists: true,
  subject_table_exists: true,
  deletion_table_exists: true,
  may_insert_subject: true,
  may_read_subject: true,
  may_read_deletion: true,
  may_insert_usage: true,
  may_read_plan: true,
  may_read_plan_revision: true,
  may_read_plan_item: true,
};

function fakeSql(row: ScopeRecord = BASE) {
  const queries: string[] = [];
  let beginCount = 0;
  async function begin<T>(
    fn: (transaction: {
      unsafe(
        query: string,
        parameters?: Array<string | number | boolean | null>,
      ): PromiseLike<readonly Record<string, unknown>[]>;
    }) => Promise<T>,
  ): Promise<T> {
    beginCount += 1;
    return fn({
    async unsafe(query: string) {
      queries.push(query.trim());
      if (queries.length === 1) {
        if (
          query.trim() !==
            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
        ) {
          throw new Error("A read-only transaction is mandatory.");
        }
        return [];
      }
      if (queries.length === 2 && /^SELECT\b/.test(query.trim())) {
        return [row as unknown as Record<string, unknown>];
      }
      throw new Error("Unexpected SQL or extra query.");
    },
    });
  }
  return { client: { begin }, queries, getBeginCount: () => beginCount };
}

describe("P02-C verified plan/block runtime preflight", () => {
  it("reads only catalog metadata and the effective application-role permissions", async () => {
    const sql = fakeSql();
    await expect(assertUlcVerifiedBlockUsagePreviewReadiness(sql.client))
      .resolves.toBeUndefined();
    expect(sql.getBeginCount()).toBe(1);
    expect(sql.queries).toHaveLength(2);
    expect(sql.queries[1]).toContain("current_database()");
    expect(sql.queries[1]).toContain("current_user");
    expect(sql.queries[1]).toContain("has_table_privilege(current_user");
    expect(sql.queries[1]).toContain("appbasis_training_block_usage_subject");
    expect(sql.queries[1]).toContain("appbasis_training_plan_revision_item");
    expect(sql.queries[1]).toContain("appbasis_training_block_usage_subject_deletion");
    expect(sql.queries[1]).not.toMatch(/\b(DELETE\s+FROM|UPDATE\s+public|INSERT\s+INTO|TRUNCATE|GRANT|DROP)\b/i);
  });

  it("rejects wrong database or role, incomplete migrations and missing writer rights", async () => {
    const invalid: Array<Partial<ScopeRecord>> = [
      { database_name: "appbasis_ulc_linz_production" },
      { database_name: "ulc_linz_k2_restore_20261118" },
      { principal_name: "appbasis_ulc_linz_preview_migration" },
      { principal_name: "appbasis_ulc_linz_preview_security_log" },
      { public_tables: 62 },
      { public_tables: 67 },
      { plan_table_exists: false },
      { plan_revision_exists: false },
      { plan_item_exists: false },
      { usage_table_exists: false },
      { subject_table_exists: false },
      { deletion_table_exists: false },
      { may_insert_subject: false },
      { may_read_subject: false },
      { may_read_deletion: false },
      { may_insert_usage: false },
      { may_read_plan: false },
      { may_read_plan_revision: false },
      { may_read_plan_item: false },
    ];
    for (const change of invalid) {
      const sql = fakeSql({ ...BASE, ...change });
      await expect(assertUlcVerifiedBlockUsagePreviewReadiness(sql.client))
        .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
      expect(sql.queries).toHaveLength(2);
    }
  });

  it("fails closed on absent, malformed or failing SQL without leaking query details", async () => {
    await expect(assertUlcVerifiedBlockUsagePreviewReadiness(null as never))
      .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
    for (const bad of [
      { ...BASE, public_tables: "66" as never },
      { ...BASE, may_insert_subject: "true" as never },
      { ...BASE, may_insert_subject: null as never },
      { ...BASE, principal_name: "" },
    ]) {
      await expect(assertUlcVerifiedBlockUsagePreviewReadiness(fakeSql(bad).client))
        .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
    }
    const unavailable = {
      begin: async () => {
        throw new Error("provider-secret-diagnostic-do-not-log");
      },
    };
    await expect(assertUlcVerifiedBlockUsagePreviewReadiness(unavailable))
      .rejects.toMatchObject({
        message: "ULC verified training block usage is not authorized in this Preview database.",
      });
  });
});

describe("P02-C runtime composition remains explicitly opt-in", () => {
  it("wires the canonical plan owner and attributed block writer together without legacy fallback", async () => {
    const code = await readFile(new URL("../worker/postgres.ts", import.meta.url), "utf8");
    expect(code).toContain(
      'options.trainingBlockUsageMode === "isolated-preview-verified-subject"',
    );
    expect(code).toContain("await assertUlcVerifiedBlockUsagePreviewReadiness(applicationSql)");
    expect(code).toContain("const blockRepository = new PostgresTrainingBlockRepository(applicationSql)");
    expect(code).toContain("const planRepository = new PostgresTrainingPlanRepository(applicationSql)");
    expect(code).toContain("verifiedUsageBooking: createUlcTrainingPlanVerifiedUsageBooking({");
    expect(code).toContain("plans: planRepository,");
    expect(code).toContain("usage: blockRepository,");
    expect(code).toContain('usageWriteMode: "verified-subject-only"');
    // A deployed Worker never reads the Preview-only activation from env.
    expect(code).not.toContain("process.env.APPBASIS_ULC_BLOCK_VERIFIED");
    expect(code).not.toContain("options.trainingBlockUsageMode ??");
  });
});
