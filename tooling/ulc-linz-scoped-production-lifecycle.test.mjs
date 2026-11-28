import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { verifyUlcScopedProductionLifecycle } from "./ulc-linz-scoped-production-lifecycle.mjs";
import { evaluateAppProductionComposition } from "./production-contract.mjs";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const load=async()=>JSON.parse(await readFile(join(root,
  "apps/ulc-linz/production-scoped-module-lifecycle.json"),"utf8"));

test("ULC private M6 pilot scope is pinned, while standard module contracts stay blocked",async()=>{
  const scope=await verifyUlcScopedProductionLifecycle(root);
  assert.deepEqual(scope.verifiedModuleIds,[
    "exercise-catalog","training-blocks","training-documentation"
  ]);
  assert.equal(scope.deploymentAuthorized,false);
  assert.equal(scope.legalApproved,false);
  assert.equal(scope.privateMediaAllowed,false);
  assert.equal(scope.oldRestorePromotionAllowed,false);
  const composition=await evaluateAppProductionComposition(root,"ulc-linz");
  const app=JSON.parse(await readFile(join(root,
    "apps/ulc-linz/appbasis.production.json"),"utf8"));
  assert.equal(composition.status,app.status==="ready"?"ready":"blocked");
  assert.equal(composition.productionReleaseAuthorized,false);
  for(const id of scope.verifiedModuleIds){
    const scoped=composition.modules.find(x=>x.moduleId===id);
    assert.equal(scoped?.status,"ready",id);
    assert.equal(scoped?.requirements.lifecycle,"verified",id);
    const generic=JSON.parse(await readFile(join(root,`modules/${id}/appbasis.production.json`),"utf8"));
    assert.equal(generic.status,"blocked",id);
    assert.equal(generic.requirements.lifecycle,"blocked",id);
    assert.deepEqual(generic.evidence.lifecycle,[],id);
  }
});

test("scoped overlay rejects changed code, removed fences and widened pilot",async()=>{
  const valid=await load();
  const cases=[
    {...valid, appId:"other-app"},
    {...valid, scope:"all-apps"},
    {...valid, scopeLimitations:{...valid.scopeLimitations,privateMedia:"enabled"}},
    {...valid, moduleLifecycle:valid.moduleLifecycle.slice(1)},
    {...valid, moduleLifecycle:valid.moduleLifecycle.map((m,i)=>
      i===0?{...m,evidence:m.evidence.slice(1)}:m)},
    {...valid, moduleLifecycle:valid.moduleLifecycle.map((m,i)=>
      i===0?{...m,evidence:m.evidence.map((p,j)=>j===0?
        {...p,gitBlobSha:"f".repeat(40)}:p)}:m)},
    {...valid, productionEntrypoint:{...valid.productionEntrypoint,
      path:"apps/ulc-linz/worker/production-exercise-catalog-standard.ts"}},
    {...valid, productionEntrypointTest:{...valid.productionEntrypointTest,
      gitBlobSha:"f".repeat(40)}},
    {...valid, runtimeGuardEvidence:valid.runtimeGuardEvidence.slice(1)},
    {...valid, runtimeGuardEvidence:valid.runtimeGuardEvidence.map((ref,i)=>
      i===0?{...ref,gitBlobSha:"f".repeat(40)}:ref)},
    {...valid, runtimeGuardEvidence:valid.runtimeGuardEvidence.map((ref,i)=>
      i===0?{...ref,path:"apps/ulc-linz/worker/production-exercise-catalog-standard.ts"}:ref)},
  ];
  for(const proposal of cases){
    await assert.rejects(verifyUlcScopedProductionLifecycle(root,proposal),
      /ULC scoped T10 lifecycle denied/);
  }
});
