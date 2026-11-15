import test from 'node:test';
import assert from 'node:assert/strict';
import { checkIntegrationInventory, EXPECTED } from './ulc-linz-k2-pr-integration.mjs';
const fixture = () => ({ pullRequests: EXPECTED.map(n => ({
  number:n,base:'main',draft:true,merged:false,sha:'a'.repeat(40),
  files:['tooling/k2-fixture-' + n + '.mjs'],
  checks:[{status:'completed',conclusion:'success'}]
})) });
test('six clean independent PRs only qualify for human review', () => {
  assert.equal(checkIntegrationInventory(fixture()).status, 'READY_FOR_HUMAN_REVIEW');
});
test('missing PR blocks', () => { const f=fixture();f.pullRequests.pop();assert.equal(checkIntegrationInventory(f).status,'BLOCK'); });
test('overlapping file paths block', () => { const f=fixture();f.pullRequests[1].files=f.pullRequests[0].files;assert.match(checkIntegrationInventory(f).errors.join(','),/overlap/); });
test('failed and pending CI block', () => { for(const status of ['failure','pending']) {const f=fixture();f.pullRequests[0].checks=[{status:'completed',conclusion:status}];assert.equal(checkIntegrationInventory(f).status,'BLOCK');} });
test('non-draft, merged and wrong-base PRs block', () => { for(const key of ['draft','merged','base']) {const f=fixture();f.pullRequests[0][key]=key==='base'?'production':key==='draft'?false:true;assert.equal(checkIntegrationInventory(f).status,'BLOCK');} });
test('missing or malformed HEAD SHA blocks', () => {const f=fixture();f.pullRequests[0].sha='latest';assert.equal(checkIntegrationInventory(f).status,'BLOCK');});
test('empty CI or files blocks', () => {for(const key of ['checks','files']) {const f=fixture();f.pullRequests[0][key]=[];assert.equal(checkIntegrationInventory(f).status,'BLOCK');}});
test('duplicate and unexpected PR numbers block', () => {const f=fixture();f.pullRequests[1].number=633;assert.equal(checkIntegrationInventory(f).status,'BLOCK');});
test('unsafe file paths block', () => {const f=fixture();f.pullRequests[0].files=['../secrets'];assert.equal(checkIntegrationInventory(f).status,'BLOCK');});
test('missing input blocks', () => assert.equal(checkIntegrationInventory(null).status,'BLOCK'));
