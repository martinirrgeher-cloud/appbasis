import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  assertUlcProtectedCatalogProductionReadiness,
  assertUlcProtectedCatalogPreviewReadiness,
  UlcProtectedCatalogUnavailableError,
} from "../worker/exercise-catalog-protected-runtime-readiness";
import {
  assertUlcVerifiedBlockUsageProductionReadiness,
  assertUlcVerifiedBlockUsagePreviewReadiness,
  UlcVerifiedBlockUsageUnavailableError,
} from "../worker/training-block-verified-runtime-readiness";

const catalog = Object.freeze({
  database_name: "neondb",
  principal_name: "ulc_linz_application",
  public_tables: 69,
  item_exists: true,
  favorite_exists: true,
  marker_exists: true,
  usage_subject_exists: true,
  training_subject_marker_exists: true,
  training_subject_fence_triggers: 3,
  may_access_training_subject_marker: false,
  may_write_item: true,
  may_write_favorite: true,
  may_write_children: true,
  may_read_marker: true,
  may_mutate_marker: false,
});
const block = Object.freeze({
  database_name: "neondb",
  principal_name: "ulc_linz_application",
  public_tables: 69,
  catalog_favorite_guard_exists: true,
  catalog_subject_guard_exists: true,
  training_subject_marker_exists: true,
  training_subject_fence_triggers: 3,
  may_access_training_subject_marker: false,
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
});

function harness(row: Record<string,unknown>|null, fail=false) {
  const statements:string[]=[];
  const sql={
    async begin<T>(callback: (tx:{unsafe(query:string):Promise<readonly Record<string,unknown>[]>})=>Promise<T>):Promise<T>{
      return callback({
        async unsafe(query:string) {
          statements.push(query);
          if(fail) throw new Error("database unavailable");
          return query.startsWith("SET TRANSACTION") ? [] : row===null ? [] : [row];
        },
      });
    },
  };
  return {sql, statements};
}
const catalogCheck = (row:Record<string,unknown>|null,fail=false)=>
  assertUlcProtectedCatalogProductionReadiness(harness(row,fail).sql);
const blockCheck = (row:Record<string,unknown>|null,fail=false)=>
  assertUlcVerifiedBlockUsageProductionReadiness(harness(row,fail).sql);

describe("P3 production protected-writing admission is opt-in and fail-closed",()=>{
  it("accepts only actual 69-table application-role privileges, using a read-only metadata transaction",async()=>{
    for(const [candidate,check] of [
      [catalog,assertUlcProtectedCatalogProductionReadiness],
      [block,assertUlcVerifiedBlockUsageProductionReadiness],
    ] as const){
      const h=harness(candidate);
      await expect(check(h.sql)).resolves.toBeUndefined();
      expect(h.statements).toHaveLength(2);
      expect(h.statements[0]).toContain("REPEATABLE READ, READ ONLY");
      expect(h.statements[1]).toContain("current_database()");
      expect(h.statements[1]).toContain("current_user");
      expect(h.statements[1]).toContain("ulc_linz_training_subject_write_fence()");
      expect(h.statements.every(x=>!/\b(?:GRANT|INSERT INTO|DELETE FROM|UPDATE\s+public|TRUNCATE TABLE)\b/i.test(x))).toBe(true);
    }
  });
  it("rejects wrong database, role, table counts, missing fences and marker privileges for catalog",async()=>{
    for(const drift of [
      {database_name:"appbasis_ulc_linz_preview"},
      {principal_name:"ulc_linz_security_log_ingest"},
      {public_tables:68},
      {training_subject_fence_triggers:2},
      {training_subject_marker_exists:false},
      {may_access_training_subject_marker:true},
      {may_write_children:false},
      {may_mutate_marker:true},
      {usage_subject_exists:false},
    ]){
      await expect(catalogCheck({...catalog,...drift})).rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    }
    await expect(catalogCheck(null)).rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    await expect(catalogCheck(catalog,true)).rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
  });
  it("rejects wrong production role, false owner guards and unreadable block deletion marker",async()=>{
    for(const drift of [
      {database_name:"appbasis_ulc_linz_preview"},
      {principal_name:"ulc_linz_security_log_read"},
      {public_tables:68},
      {training_subject_fence_triggers:2},
      {may_access_training_subject_marker:true},
      {catalog_subject_guard_exists:false},
      {catalog_favorite_guard_exists:false},
      {may_read_deletion:false},
      {may_insert_subject:false},
      {may_insert_usage:false},
    ]){
      await expect(blockCheck({...block,...drift})).rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
    }
    await expect(blockCheck(null)).rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);
  });
  it("does not weaken original Preview checks or enable either protected production writer by default",async()=>{
    await expect(assertUlcProtectedCatalogPreviewReadiness(harness(catalog).sql))
      .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    await expect(assertUlcVerifiedBlockUsagePreviewReadiness(harness(block).sql))
      .rejects.toBeInstanceOf(UlcVerifiedBlockUsageUnavailableError);

    const [runtime, catalogMode, deployedOptions, productionContract] = await Promise.all([
      readFile(new URL("../worker/postgres.ts",import.meta.url),"utf8"),
      readFile(new URL("../worker/exercise-catalog-runtime.ts",import.meta.url),"utf8"),
      readFile(new URL("../worker/production-exercise-catalog-standard.ts",import.meta.url),"utf8"),
      readFile(new URL("../../../modules/exercise-catalog/appbasis.production.json",import.meta.url),"utf8"),
    ]);
    expect(runtime).toContain('options.exerciseCatalogRuntimeMode === "standard-module-protected-production"');
    expect(runtime).toContain("await assertUlcProtectedCatalogProductionReadiness(applicationSql)");
    expect(runtime).toContain('options.trainingBlockUsageMode === "protected-production-verified-subject"');
    expect(runtime).toContain("await assertUlcVerifiedBlockUsageProductionReadiness(applicationSql)");
    expect(runtime).toContain('options.exerciseCatalogRuntimeMode ?? "legacy"');
    expect(catalogMode).toContain('mode === "standard-module-protected-production"');
    expect(deployedOptions).toContain('exerciseCatalogRuntimeMode: "standard-module"');
    expect(JSON.parse(productionContract).status).toBe("blocked");
  });
});
