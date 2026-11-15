import test from "node:test";
import assert from "node:assert/strict";
import {
  checkIntegrationInventory, EXPECTED, EXPECTED_HEADS,
  EXPECTED_BASE_SHA, EXPECTED_FILES,
} from "./ulc-linz-k2-pr-integration.mjs";

const fixture=()=>({pullRequests:EXPECTED.map(number=>({
  number,base:"main",baseSha:EXPECTED_BASE_SHA,draft:true,merged:false,
  mergeable:true,sha:EXPECTED_HEADS[number],files:[...EXPECTED_FILES[number]],
  checks:[{status:"completed",conclusion:"success",headSha:EXPECTED_HEADS[number]}],
}))});
const check=change=>checkIntegrationInventory(change||fixture());

test("six exact audited draft heads only permit human review",()=>{
  assert.equal(check().status,"READY_FOR_HUMAN_REVIEW");
});
test("missing PR blocks",()=>{const f=fixture();f.pullRequests.pop();assert.equal(check(f).status,"BLOCK");});
test("changed HEAD is blocked even when it is a syntactically valid SHA",()=>{
  const f=fixture();f.pullRequests[0].sha="f".repeat(40);
  f.pullRequests[0].checks[0].headSha="f".repeat(40);
  assert.match(check(f).errors.join(" "),/unreviewed or changed HEAD/);
});
test("CI on a different SHA fails closed",()=>{
  const f=fixture();f.pullRequests[0].checks[0].headSha="f".repeat(40);
  assert.equal(check(f).status,"BLOCK");
});
test("CI absent, pending and failed all block",()=>{
  for(const checks of [[],[{status:"pending",conclusion:null,headSha:EXPECTED_HEADS[633]}],
    [{status:"completed",conclusion:"failure",headSha:EXPECTED_HEADS[633]}]]){
    const f=fixture();f.pullRequests[0].checks=checks;
    assert.equal(check(f).status,"BLOCK");
  }
});
test("wrong main base SHA and wrong branch block",()=>{
  for(const change of [{baseSha:"f".repeat(40)},{base:"production"}]){
    const f=fixture();Object.assign(f.pullRequests[0],change);
    assert.equal(check(f).status,"BLOCK");
  }
});
test("merged, ready-for-review and not mergeable block",()=>{
  for(const change of [{merged:true},{draft:false},{mergeable:false}]){
    const f=fixture();Object.assign(f.pullRequests[0],change);
    assert.equal(check(f).status,"BLOCK");
  }
});
test("missing file, arbitrary additional file and duplicate file block",()=>{
  for(const files of [
    EXPECTED_FILES[633].slice(1),
    [...EXPECTED_FILES[633],"tooling/rogue.mjs"],
    [...EXPECTED_FILES[633],EXPECTED_FILES[633][0]],
  ]){
    const f=fixture();f.pullRequests[0].files=files;
    assert.equal(check(f).status,"BLOCK");
  }
});
test("file overlap across draft PRs blocks",()=>{
  const f=fixture();f.pullRequests[1].files=[...f.pullRequests[0].files];
  assert.match(check(f).errors.join(" "),/overlap/);
});
test("unexpected and duplicate PR numbers block",()=>{
  for(const bad of [633,640]){
    const f=fixture();f.pullRequests[1].number=bad;
    assert.equal(check(f).status,"BLOCK");
  }
});
test("invalid paths and missing or malformed metadata block",()=>{
  const f=fixture();f.pullRequests[0].files=["../.env"];
  assert.equal(check(f).status,"BLOCK");
  f.pullRequests[0].files=[...EXPECTED_FILES[633]];
  f.pullRequests[0].sha="latest";
  assert.equal(check(f).status,"BLOCK");
  assert.equal(checkIntegrationInventory(null).status,"BLOCK");
});
