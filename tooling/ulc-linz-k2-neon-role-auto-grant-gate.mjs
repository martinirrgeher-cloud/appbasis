/**
 * K2-A10: Evidence-based, READ-ONLY operator decision helper.
 *
 * PostgreSQL 18 CREATEROLE automatically grants ADMIN TRUE, SET FALSE,
 * INHERIT FALSE on a newly created role back to its creator. In Neon the
 * automatic grantor was cloud_admin, which the K2 migration connection
 * cannot revoke. This is NOT a bypass or implicit approval.
 */
export const K2_NEON_AUTO_GRANT = Object.freeze({
  newOwner:"ulc_linz_k2_object_owner",
  creator:"ulc_linz_k2_restore_owner",
  providerGrantor:"cloud_admin",
});
export function evaluateNeonOwnerRoleGrant({
  observedMemberships, explicitOperatorExceptionApproved=false,
  exactK2TargetVerified=false, independentlyVerifiedRollbackCheckpoint=false,
}={}){
 const blocked=(code)=>Object.freeze({
  status:"BLOCK",failures:Object.freeze([code]),
  autoGrantAcceptedForReview:false,
  databaseWriteAuthorized:false,mergeAuthorized:false,
  deployAuthorized:false,appRestoreReady:false,
 });
 if(!Array.isArray(observedMemberships)||observedMemberships.length!==1)
  return blocked("MEMBERSHIP_COUNT_OR_EVIDENCE_DRIFT");
 const a=observedMemberships[0];
 if(!a||a.role!==K2_NEON_AUTO_GRANT.newOwner||
    a.member!==K2_NEON_AUTO_GRANT.creator||
    a.grantor!==K2_NEON_AUTO_GRANT.providerGrantor||
    a.admin_option!==true||a.inherit_option!==false||a.set_option!==false)
  return blocked("UNEXPECTED_GRANTOR_OR_ESCALATING_MEMBERSHIP");
 if(explicitOperatorExceptionApproved!==true)
  return blocked("NEON_CLOUD_ADMIN_AUTO_GRANT_REQUIRES_NEW_APPROVAL");
 if(exactK2TargetVerified!==true||independentlyVerifiedRollbackCheckpoint!==true)
  return blocked("K2_ISOLATION_OR_BACKOUT_NOT_CONFIRMED");
 return Object.freeze({
  status:"ADMIN_ONLY_AUTO_GRANT_REVIEWED_NOT_AUTHORIZED",
  failures:Object.freeze([]),
  autoGrantAcceptedForReview:true,
  conditionalReviewAcceptance:"Only exact cloud_admin admin-only auto grant, no SET/INHERIT, no runtime memberships",
  databaseWriteAuthorized:false,mergeAuthorized:false,
  deployAuthorized:false,appRestoreReady:false,
 });
}
