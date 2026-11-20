import { describe, expect, it } from "vitest";
import {
  assessUlcP3CrossOwnerRestoreQuarantine,
  ULC_P3_PERSISTENT_OWNERS,
  type UlcP3OwnerInspection,
  type UlcP3QuarantineContext,
  type UlcP3Risk,
} from "../worker/p3-cross-owner-restore-admission";

const NOW = new Date("2026-11-20T21:00:00.000Z");
const COMPLETED = new Date("2026-11-19T21:00:00.000Z");
const PURGE = new Date(COMPLETED.getTime() + 35*24*3600*1000);
const CONTEXT: UlcP3QuarantineContext = {
  kind: "isolated-restore-review",
  now: NOW,
  writesFrozenAndIsolated: true,
  source: {
    organizationId:"p3-unit-org",
    subjectId:"p3-erased-subject",
    completedAt:COMPLETED,
    purgeAfter:PURGE,
    independentSourceVerified:true,
    fullRestoreBackupHorizonVerified:true,
  },
};
const proof = (owner: UlcP3OwnerInspection["owner"]): UlcP3OwnerInspection => ({
  owner,
  organizationId:CONTEXT.source.organizationId,
  subjectId:CONTEXT.source.subjectId,
  sourceCompletedAt:COMPLETED,
  inspectedAt:NOW,
  subjectDeletionReplayed:true,
  structuredResidualRows:0,
  historicalUnstructuredData:"reviewed-clear",
  staleWriterFence:"verified",
  privateMedia:owner==="exercise-catalog"?"no-private-media-verified":"not-applicable",
});
const completed=()=>ULC_P3_PERSISTENT_OWNERS.map(proof);
const assess=(inspections:readonly UlcP3OwnerInspection[]=completed(),context=CONTEXT)=>
  assessUlcP3CrossOwnerRestoreQuarantine(context,inspections);
function risks(code:UlcP3Risk, reports=completed(),context=CONTEXT){
  const result=assess(reports,context);
  expect(result.risks.map(x=>x.code)).toContain(code);
  expect(result.status).toBe("QUARANTINE_BLOCKED");
  expect(result.permitsPromotion).toBe(false);
  return result;
}
describe("ULC P3 isolated cross-owner erasure/restore admission",()=>{
  it("all eight complete owner reports remain operator-review-only, NEVER automatic promotion",()=>{
    const result=assess();
    expect(result.status).toBe("OPERATOR_REVIEW_REQUIRED");
    expect(result.risks).toEqual([]);
    expect(result.permitsPromotion).toBe(false);
    expect(result.permitsDeployment).toBe(false);
    expect(result.permitsDeletion).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(ULC_P3_PERSISTENT_OWNERS).toHaveLength(8);
  });
  it("rejects incomplete and duplicate owners rather than interpreting six owners as full proof",()=>{
    const missing=assess(completed().slice(0,6));
    expect(missing.risks.filter(x=>x.code==="MISSING_OWNER")).toHaveLength(2);
    risks("DUPLICATE_OWNER",[...completed(),proof("identity")]);
    risks("UNKNOWN_OWNER",[...completed(),{...proof("identity"),owner:"fictional-owner" as never}]);
  });
  it("rejects forged independent source, incomplete backup horizon and expiry",()=>{
    risks("SOURCE_INVALID",completed(),{...CONTEXT,source:{...CONTEXT.source,independentSourceVerified:false}});
    risks("SOURCE_INVALID",completed(),{...CONTEXT,source:{...CONTEXT.source,fullRestoreBackupHorizonVerified:false}});
    risks("SOURCE_INVALID",completed(),{...CONTEXT,source:{...CONTEXT.source,purgeAfter:new Date(PURGE.getTime()+1)}});
    risks("SOURCE_EXPIRED",completed(),{...CONTEXT,now:PURGE});
    risks("RESTORE_NOT_FROZEN",completed(),{...CONTEXT,writesFrozenAndIsolated:false});
  });
  it("rejects cross-org/subject substitutions and mismatch to canonical marker timestamp",()=>{
    risks("FOREIGN_SCOPE",completed().map(x=>x.owner==="training-documentation"?{...x,organizationId:"other-org"}:x));
    risks("FOREIGN_SCOPE",completed().map(x=>x.owner==="athletes"?{...x,subjectId:"someone-else"}:x));
    risks("OWNER_TIMESTAMP_DRIFT",completed().map(x=>x.owner==="training-blocks"?{...x,sourceCompletedAt:new Date(COMPLETED.getTime()+1)}:x));
  });
  it("fails on partially committed owner retry, residual revisions and stale inspection snapshot",()=>{
    risks("OWNER_REPLAY_UNPROVEN",completed().map(x=>x.owner==="ulc-linz-lifecycle"?{...x,subjectDeletionReplayed:false}:x));
    risks("STRUCTURED_RESIDUAL",completed().map(x=>x.owner==="training-documentation"?{...x,structuredResidualRows:2}:x));
    risks("STRUCTURED_RESIDUAL",completed().map(x=>x.owner==="training-plans"?{...x,structuredResidualRows:null}:x));
    risks("OWNER_PROOF_STALE",completed().map(x=>x.owner==="identity"?{...x,inspectedAt:new Date(COMPLETED.getTime()-1)}:x));
    risks("STALE_WRITER_FENCE_UNPROVEN",completed().map(x=>x.owner==="ulc-linz-lifecycle"?{...x,staleWriterFence:"unverified" as const}:x));
  });
  it("treats unknown free-text, older foreign-owner participant notes and provider media as BLOCKED",()=>{
    risks("UNSTRUCTURED_REVIEW_OPEN",completed().map(x=>x.owner==="training-documentation"?{...x,historicalUnstructuredData:"personal-data-present" as const}:x));
    risks("UNSTRUCTURED_REVIEW_OPEN",completed().map(x=>x.owner==="ulc-linz-lifecycle"?{...x,historicalUnstructuredData:"unverified" as const}:x));
    risks("MEDIA_ABSENCE_UNPROVEN",completed().map(x=>x.owner==="exercise-catalog"?{...x,privateMedia:"unverified" as const}:x));
    risks("MEDIA_ABSENCE_UNPROVEN",completed().map(x=>x.owner==="permissions"?{...x,privateMedia:"no-private-media-verified" as const}:x));
  });
  it("rejects invalid counts, date objects and malformed owners, never discloses personal identifiers",()=>{
    risks("STRUCTURED_RESIDUAL",completed().map(x=>x.owner==="athletes"?{...x,structuredResidualRows:-1}:x));
    risks("OWNER_PROOF_STALE",completed().map(x=>x.owner==="training-blocks"?{...x,inspectedAt:new Date("invalid")}:x));
    const result=risks("FOREIGN_SCOPE",completed().map(x=>x.owner==="identity"?{...x,subjectId:"other-athlete"}:x));
    expect(JSON.stringify(result)).not.toContain("p3-erased-subject");
    expect(JSON.stringify(result)).not.toContain("other-athlete");
  });
});
