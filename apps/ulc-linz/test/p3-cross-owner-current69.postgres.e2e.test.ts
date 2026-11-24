import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresTrainingDocumentationRepository,
  TrainingDocumentationService,
  type TrainingDocumentationPostgresClient,
} from "@appbasis/training-documentation";
import {
  PostgresUlcMarkedTrainingHistoryRehearsalRepository,
} from "../worker/training-subject-marked-history-rehearsal";
import type { UlcTrainingSubjectHistoryTransactionClient } from "../worker/training-subject-history-deletion-postgres";
import { PostgresUlcTrainingSubjectPrivacyInspector } from "../worker/training-subject-privacy-postgres";
import { assessUlcP3CrossOwnerRestoreQuarantine } from "../worker/p3-cross-owner-restore-admission";
import { PostgresUlcT07ResidualInspector } from "../worker/t07-protected-residual-inspector";
import { PostgresUlcT07EightOwnerInspector } from "../worker/t07-eight-owner-reconciliation";

/**
 * P3-C: real PostgreSQL 18, disposable isolated 47-migration/69-table schema.
 * This is NOT a live deletion, production grant, runtime handler or release
 * approval. The old P03 legacy-v16 vulnerability test remains untouched.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG="p3-current-org", FOREIGN="p3-foreign-org";
const TARGET="p3-subject", NEIGHBOR="p3-neighbor";
if (!DATABASE_URL) {
  describe.skip("P3-C cross-owner 69-table restore rehearsal",()=>{
    it("requires DATABASE_URL",()=>{});
  });
} else {
  const source = new URL(DATABASE_URL);
  if (!["localhost","127.0.0.1","::1"].includes(source.hostname) ||
      source.username!=="postgres" || source.port!=="5432" ||
      source.pathname!=="/appbasis_identity_e2e") {
    throw new Error("P3-C current-schema integration tests require disposable localhost PostgreSQL only.");
  }
  describe("P3-C cross-owner 69-table restore rehearsal",()=>{
    const admin=createPostgresDatabase(DATABASE_URL);
    const name="ulc_p3_69_"+randomUUID().replaceAll("-","").slice(0,12);
    const databaseUrl=new URL(DATABASE_URL);
    databaseUrl.pathname="/"+name;
    let db:ReturnType<typeof createPostgresDatabase>|null=null;
    let created=false;
    function required(){
      if(!db) throw new Error("P3-C isolated database not initialized");
      return db;
    }
    function docs(){
      const client=required().client;
      const txClient:TrainingDocumentationPostgresClient={
        unsafe(query,parameters){return client.unsafe(query,parameters);},
        begin(callback){
          return client.begin(async t=>callback({
            unsafe(query,parameters){return t.unsafe(query,parameters);},
          }));
        },
      };
      return new PostgresTrainingDocumentationRepository(txClient);
    }
    function training(failOnce=false){
      let pending=failOnce;
      const sql=required().client;
      const client:UlcTrainingSubjectHistoryTransactionClient={
        unsafe(query,parameters){return sql.unsafe(query,parameters);},
        begin(callback){
          return sql.begin(async t=>callback({
            async unsafe(query,parameters){
              if(pending && query.includes("DELETE FROM ulc_linz_training_registration\n")){
                pending=false;
                throw new Error("P3-C_INJECTED_OWNER_TRANSACTION_FAILURE");
              }
              return t.unsafe(query,parameters);
            },
          }));
        },
      };
      return new PostgresUlcMarkedTrainingHistoryRehearsalRepository(client);
    }
    async function seed(organization:string,session:string,subject:string,id:string){
      await required().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id,session_id,athlete_id,status)
         VALUES ($1,$2,$3,'present')`,[organization,session,subject]);
      await required().client.unsafe(
        `INSERT INTO ulc_linz_training_registration
           (organization_id,session_id,athlete_id,intention,updated_by_identity_id)
         VALUES ($1,$2,$3,'attending','p3-actor')`,[organization,session,subject]);
      await required().client.unsafe(
        `INSERT INTO ulc_linz_training_registration_change
           (id,organization_id,session_id,athlete_id,intention,revision,actor_identity_id)
         VALUES ($1,$2,$3,$4,'attending',1,'p3-actor')`,[id,organization,session,subject]);
    }
    beforeAll(async()=>{
      await admin.client.unsafe("CREATE DATABASE "+name);
      created=true;
      db=createPostgresDatabase(databaseUrl.toString());
      const manifest=JSON.parse(await readFile(new URL("../appbasis.database.json",import.meta.url),"utf8")) as
        {owners:readonly {migrations:readonly string[]}[]};
      const paths=manifest.owners.flatMap(o=>o.migrations);
      if(paths.length!==47 || new Set(paths).size!==47 ||
        !paths.some(p=>p.endsWith("0017_ulc_linz_training_subject_write_fence.sql")))
        throw new Error("P3-C needs the exact current 47-migration/69-table manifest");
      for(const path of paths){
        const sql=await readFile(new URL("../../../"+path,import.meta.url),"utf8");
        for(const statement of sql.split("--> statement-breakpoint")){
          if(statement.trim()) await required().client.unsafe(statement);
        }
      }
      const count=await required().client.unsafe(
        "SELECT count(*)::int AS total FROM pg_tables WHERE schemaname='public'");
      if(count[0]?.total!==69) throw new Error("P3-C current-schema table count changed.");
    });
    afterAll(async()=>{
      if(db){await db.client.end();db=null;}
      if(created)await admin.client.unsafe("DROP DATABASE "+name+" WITH (FORCE)");
      await admin.client.end();
    });
    it("denies incomplete cross-owner erasure, permits isolated idempotent retry and still blocks free-text/old backups",async()=>{
      const documentation=docs();
      const ids=["p3-owned-doc","p3-neighbor-doc"];
      let index=0;
      const service=new TrainingDocumentationService({
        repository:documentation,
        createId:()=>ids[index++]??"unexpected",
        now:()=>new Date("2026-11-19T11:00:00Z"),
      });
      await service.create(ORG,{
        subjectId:TARGET,sessionDate:"2026-11-19",
        sourcePlanId:"p3-plan",sourcePlanRevision:1,
        attendance:[{participantId:TARGET,displayName:"Person P3",status:"present"}],
      });
      const other=await service.create(ORG,{
        subjectId:NEIGHBOR,sessionDate:"2026-11-19",
        sourcePlanId:"p3-other-plan",sourcePlanRevision:1,
        note:"Personal name Person P3 in trainer note",
        attendance:[
          {participantId:TARGET,displayName:"Person P3",status:"present"},
          {participantId:NEIGHBOR,displayName:"Neighbor",status:"present"},
        ],
      });
      for(const [org,id] of [[ORG,"p3-session"],[FOREIGN,"p3-foreign-session"]] as const)
        await required().client.unsafe(
          `INSERT INTO ulc_linz_training_session
            (id,organization_id,module_id,group_id,session_date,note)
           VALUES ($1,$2,'u12','p3-group','2026-11-19','Shared training note')`,[id,org]);
      await seed(ORG,"p3-session",TARGET,"p3-change-1");
      await seed(ORG,"p3-session",NEIGHBOR,"p3-change-2");
      await seed(FOREIGN,"p3-foreign-session",TARGET,"p3-change-3");

      const completedAt=new Date(Date.now()-60_000);
      const purgeAfter=new Date(completedAt.getTime()+35*24*3600*1000);
      await required().client.unsafe(
        `INSERT INTO appbasis_athletes_deletion
          (entity_type,entity_id,organization_id,completed_at,purge_after)
         VALUES ('athlete',$1,$2,$3,$4)`,[TARGET,ORG,completedAt.toISOString(),purgeAfter.toISOString()]);
      await expect(documentation.removeSubjectDataAfterVerifiedDeletion(
        ORG,TARGET,completedAt,
      )).resolves.toMatchObject({
        markerInserted:true,deletedDocuments:1,deletedRevisions:1,
        redactedOtherSubjectRevisions:1,
      });
      await expect(training(true).markAndEraseOnIsolatedStore(ORG,TARGET))
        .rejects.toThrow(/P3-C_INJECTED_OWNER_TRANSACTION_FAILURE/);
      const privacy=new PostgresUlcTrainingSubjectPrivacyInspector(required().client);
      const before=await privacy.inspectSubjectPrivacy(ORG,TARGET);
      expect(before).toMatchObject({attendanceRows:1,registrationRows:1,registrationHistoryRows:1});
      const afterDocs=await documentation.inspectSubjectPrivacy(ORG,TARGET);
      expect(afterDocs).toMatchObject({
        ownedDocuments:0,ownedRevisions:0,otherSubjectRevisionsWithParticipant:0,
      });
      const review=(rows:number)=>{
        const inspectedAt=new Date(completedAt.getTime()+3_000);
        return assessUlcP3CrossOwnerRestoreQuarantine({
          kind:"isolated-restore-review",now:inspectedAt,writesFrozenAndIsolated:true,
          source:{
            organizationId:ORG,subjectId:TARGET,completedAt,purgeAfter,
            independentSourceVerified:false,fullRestoreBackupHorizonVerified:false,
          },
        },[
          {owner:"training-documentation",organizationId:ORG,subjectId:TARGET,
            sourceCompletedAt:completedAt,inspectedAt,subjectDeletionReplayed:true,
            structuredResidualRows:0,historicalUnstructuredData:"unverified",
            staleWriterFence:"verified",privateMedia:"not-applicable"},
          {owner:"ulc-linz-lifecycle",organizationId:ORG,subjectId:TARGET,
            sourceCompletedAt:completedAt,inspectedAt,subjectDeletionReplayed:rows===0,
            structuredResidualRows:rows,historicalUnstructuredData:"unverified",
            staleWriterFence:"verified",privateMedia:"not-applicable"},
        ]);
      };
      const incomplete=review(before.attendanceRows+before.registrationRows+before.registrationHistoryRows);
      expect(incomplete.status).toBe("QUARANTINE_BLOCKED");
      expect(incomplete.risks).toContainEqual({
        owner:"ulc-linz-lifecycle",code:"STRUCTURED_RESIDUAL",
      });

      await expect(training().markAndEraseOnIsolatedStore(ORG,TARGET))
        .resolves.toMatchObject({markerInserted:true,deletedAttendanceRows:1,deletedRegistrationRows:1,deletedRegistrationHistoryRows:1});
      await expect(training().markAndEraseOnIsolatedStore(ORG,TARGET))
        .resolves.toMatchObject({markerInserted:false,deletedAttendanceRows:0,deletedRegistrationRows:0,deletedRegistrationHistoryRows:0});
      expect(await privacy.inspectSubjectPrivacy(ORG,TARGET))
        .toMatchObject({attendanceRows:0,registrationRows:0,registrationHistoryRows:0});
      expect(await privacy.inspectSubjectPrivacy(ORG,NEIGHBOR))
        .toMatchObject({attendanceRows:1,registrationRows:1,registrationHistoryRows:1});
      expect(await privacy.inspectSubjectPrivacy(FOREIGN,TARGET))
        .toMatchObject({attendanceRows:1,registrationRows:1,registrationHistoryRows:1});
      await expect(required().client.unsafe(
        `INSERT INTO ulc_linz_training_attendance
           (organization_id,session_id,athlete_id,status)
         VALUES ($1,'p3-session',$2,'present')`,[ORG,TARGET],
      )).rejects.toThrow(/deletion marker/i);
      const persisted=await service.listRevisions(ORG,other.id);
      expect(persisted.some(x=>(x.note??"").includes("Person P3"))).toBe(true);
      const stillBlocked=review(0);
      expect(stillBlocked.status).toBe("QUARANTINE_BLOCKED");
      expect(stillBlocked.risks).toContainEqual({owner:"training-documentation",code:"UNSTRUCTURED_REVIEW_OPEN"});
      expect(stillBlocked.risks).toContainEqual({owner:"exercise-catalog",code:"MISSING_OWNER"});
      expect(stillBlocked.permitsPromotion).toBe(false);
    });

    it("queries all eight physical owners on real v19 SQL while keeping source/recovery gates closed", async () => {
      const inspector = new PostgresUlcT07EightOwnerInspector(required().client);
      const row = await required().client.unsafe(
        `SELECT completed_at FROM appbasis_athletes_deletion
          WHERE entity_type = 'athlete' AND organization_id=$1 AND entity_id=$2`,
        [ORG, TARGET]);
      const completedAt = new Date(row[0]?.completed_at as string);
      expect(Number.isFinite(completedAt.getTime())).toBe(true);
      const report = await inspector.inspect(ORG, TARGET, completedAt);
      expect(report.owners).toHaveLength(8);
      expect(report.owners.map(x=>x.owner)).toEqual([
        "identity", "permissions", "athletes", "exercise-catalog",
        "training-blocks", "training-documentation", "training-plans",
        "ulc-linz-lifecycle",
      ]);
      expect(report.owners.find(x=>x.owner==="identity")).toMatchObject({
        status: "identity-link-unverified", remainingReferences: null,
      });
      expect(report.owners.find(x=>x.owner==="exercise-catalog")).toMatchObject({
        status: "identity-link-unverified", remainingReferences: null,
      });
      expect(report.owners.find(x=>x.owner==="training-documentation")).toMatchObject({
        status: "scoped-evidence-clear-manual-review-required", remainingReferences: 0,
        markerPresent: true,
      });
      expect(report.owners.find(x=>x.owner==="ulc-linz-lifecycle")).toMatchObject({
        status: "scoped-evidence-clear-manual-review-required", remainingReferences: 0,
        markerPresent: true,
      });
      expect(report.owners.find(x=>x.owner==="training-plans")?.status)
        .toBe("owner-marker-missing");
      expect(report.actorAuditReferences).toBeNull();
      expect(report.humanFreeTextReviewRequired).toBe(true);
      expect(report.allEightOwnersProvenComplete).toBe(false);
      expect(report.olderRestorePromotionAllowed).toBe(false);
      expect(report.privacyReady).toBe(false);
      const foreign = await inspector.inspect(FOREIGN, TARGET, completedAt);
      expect(foreign.owners.find(x=>x.owner==="identity")?.status)
        .toBe("identity-link-unverified");
      expect(foreign.allEightOwnersProvenComplete).toBe(false);
      expect(JSON.stringify(report)).not.toContain("Person P3");
      expect(JSON.stringify(report)).not.toContain(TARGET);
    });

    it("runs the real 69-table count-only T07 residual SQL after subject erasure", async () => {
      const inspector = new PostgresUlcT07ResidualInspector(required().client);
      const result = await inspector.inspect(ORG, TARGET);
      // No identity deletion marker exists, so it must NOT report zero actor
      // references as verified. Both real session and documentation notes
      // are present and require a separate human privacy review.
      expect(result).toMatchObject({
        sourceIdentityLinks: 0,
        identityScopedReferenceRows: null,
        actorAndAuditReferenceRows: null,
        identityMappingReviewRequired: true,
        freeTextReviewed: false,
        actorAuditReviewed: false,
        mediaProviderAbsenceVerified: false,
        fullPrivacyComplete: false,
      });
      expect(result.organizationWideFreeTextCandidates).toBeGreaterThanOrEqual(2);
      expect(result.organizationWidePrivateMediaMetadata).toBe(0);
      const foreign = await inspector.inspect(FOREIGN, TARGET);
      expect(foreign.organizationWideFreeTextCandidates).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(result)).not.toContain(TARGET);
      expect(JSON.stringify(result)).not.toContain("Person P3");
    });
  });
}
