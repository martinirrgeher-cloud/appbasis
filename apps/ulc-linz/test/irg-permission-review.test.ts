import { describe,expect,it } from "vitest";

import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { reviewUlcIrgTrainerPermission } from "../worker/irg-permission-review";

const view="ulc-linz:module:performance_registration:view";
const edit="ulc-linz:module:performance_registration:edit";
const other="ulc-linz:module:countdown:edit";
const source={
  targetSourceRole:"trainer",expectedRoleIds:["ulc-linz:trainer"],
  expectedGrants:[other],expectedRevokes:[],
  roleCapabilities:[],choice:"none" as const,
};

describe("N16 disconnected IRG permission administration review",()=>{
  it("produces exact view+edit proposals without touching other modules or technical roles",()=>{
    const plan=reviewUlcIrgTrainerPermission({...source,choice:"edit"});
    expect(plan.proposedGrants).toEqual([other,edit,view].sort());
    expect(plan.proposedRevokes).toEqual([]);
    expect(plan.expectedRoleIds).toEqual(["ulc-linz:trainer"]);
    expect(plan.expectedGrants).toEqual([other]);
    expect(Object.isFrozen(plan)).toBe(true);
  });
  it("removes IRG overrides without removing unrelated grants",()=>{
    const plan=reviewUlcIrgTrainerPermission({
      ...source,expectedGrants:[other,view,edit],choice:"none",
    });
    expect(plan.proposedGrants).toEqual([other]);
    expect(plan.proposedRevokes).toEqual([]);
  });
  it("supports explicit revocation of default edit and preserve view for trainer",()=>{
    const plan=reviewUlcIrgTrainerPermission({
      ...source,roleCapabilities:[view,edit],choice:"view",
    });
    expect(plan.proposedGrants).toEqual([other]);
    expect(plan.proposedRevokes).toEqual([edit]);
  });
  it("denies functionary, athlete, parent, admin, wrong roles or conflicted CAS",()=>{
    for(const targetSourceRole of ["functionary","athlete","parent","admin"]){
      expect(()=>reviewUlcIrgTrainerPermission({
        ...source,targetSourceRole,choice:"edit",
      })).toThrow(UlcLinzAuthorizationDeniedError);
    }
    expect(()=>reviewUlcIrgTrainerPermission({
      ...source,expectedRoleIds:["ulc-linz:admin"],choice:"edit",
    })).toThrow(UlcLinzAuthorizationDeniedError);
    expect(()=>reviewUlcIrgTrainerPermission({
      ...source,expectedGrants:[view],expectedRevokes:[view],
    })).toThrow(UlcLinzAuthorizationDeniedError);
    expect(()=>reviewUlcIrgTrainerPermission({
      ...source,expectedGrants:[other,other],
    })).toThrow(UlcLinzAuthorizationDeniedError);
  });
});
