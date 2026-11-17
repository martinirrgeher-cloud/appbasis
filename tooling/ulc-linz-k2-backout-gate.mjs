/**
 * K2-A08: OFFLINE ONLY. Evaluate the branch-wide restore prerequisite.
 * A valid snapshot is a necessary condition, never sufficient to authorize SQL,
 * Neon restores, merges, deployments or a branch-finalization.
 */
export const K2_BACKOUT_TARGET = Object.freeze({
  projectId:"cool-unit-46141580",
  branchId:"br-small-wind-b10p67j8",
  quarantineDb:"ulc_linz_k2_restore_quarantine",
  branchDatabases:Object.freeze([
    "appbasis_ulc_linz_preview",
    "neondb",
    "ulc_linz_k2_restore_quarantine",
  ]),
});
export const K2_BACKOUT_MAX_SNAPSHOT_AGE_MS = 2*60*60*1000;
function blocked(reason){
 return Object.freeze({
  status:"BLOCK",
  failures:Object.freeze([reason]),
  k2SnapshotVerified:false,
  branchWideRollbackAffectsThreeDatabases:true,
  restoreMustFirstUseNewIsolatedBranch:true,
  finalizeAllowed:false,
  dbWriteAuthorized:false,
  deployAuthorized:false,
  appReady:false,
 });
}
export function reviewK2Backout({
 projectId,branchId,databases,snapshots,selectedSnapshotId,nowIso
}={}){
 if(projectId!==K2_BACKOUT_TARGET.projectId ||
    branchId!==K2_BACKOUT_TARGET.branchId) return blocked("WRONG_TARGET_BRANCH");
 if(!Array.isArray(databases) ||
    !databases.every(x=>typeof x==="string") ||
    JSON.stringify([...databases].sort())!==JSON.stringify([...K2_BACKOUT_TARGET.branchDatabases].sort()))
  return blocked("BRANCH_DATABASE_SET_CHANGED");
 if(!Array.isArray(snapshots) ||
    !snapshots.every(s=>s && typeof s==="object" && !Array.isArray(s)))
  return blocked("SNAPSHOT_INVENTORY_UNAVAILABLE");
 if(typeof nowIso!=="string" || !Number.isFinite(Date.parse(nowIso))) return blocked("NOW_UNVERIFIED");
 const now=Date.parse(nowIso);
 if(typeof selectedSnapshotId!=="string" || !/^snap-[a-z0-9-]{5,60}$/.test(selectedSnapshotId))
  return blocked("NO_EXPLICIT_K2_SNAPSHOT_SELECTED");
 const matches=snapshots.filter(s=>s.id===selectedSnapshotId);
 if(matches.length!==1) return blocked("SELECTED_SNAPSHOT_NOT_FOUND");
 const snap=matches[0];
 if(snap.source_branch_id!==K2_BACKOUT_TARGET.branchId) return blocked("SNAPSHOT_FROM_OTHER_BRANCH");
 if(snap.manual!==true) return blocked("SNAPSHOT_NOT_MANUAL");
 const created=Date.parse(snap.created_at);
 if(!Number.isFinite(created)||created>now||now-created>K2_BACKOUT_MAX_SNAPSHOT_AGE_MS)
  return blocked("SNAPSHOT_STALE_OR_UNDATED");
 if(snap.expires_at!==null && snap.expires_at!==undefined){
  const expiry=Date.parse(snap.expires_at);
  if(!Number.isFinite(expiry)||expiry<=now+K2_BACKOUT_MAX_SNAPSHOT_AGE_MS)
   return blocked("SNAPSHOT_EXPIRES_TOO_SOON");
 }
 return Object.freeze({
  status:"SNAPSHOT_METADATA_MATCH_ONLY",
  failures:Object.freeze([]),
  selectedSnapshotId,
  snapshotSourceBranchId:snap.source_branch_id,
  k2SnapshotVerified:true,
  snapshotRestorationActuallyTested:false,
  branchWideRollbackAffectsThreeDatabases:true,
  restoreMustFirstUseNewIsolatedBranch:true,
  restoreToCurrentBranchAllowed:false,
  finalizeAllowed:false,
  dbWriteAuthorized:false,
  mergeAuthorized:false,
  deployAuthorized:false,
  appReady:false,
 });
}
