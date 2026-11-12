import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER, LABELS, isAuthorizedIssue, isSafeChangedPath, checkChangedPaths, branchName, buildPrompt,
} from './ulc-autodev-policy.mjs';

const task = () => ({ number: 600, title: 'Mobile Regression', body: 'Bitte Tests ergänzen', state: 'OPEN', author: {login: OWNER}, labels: [{ name: LABELS.ready }] });

test('nur explizit freigegebene Issues vom Owner werden akzeptiert', () => {
  assert.ok(isAuthorizedIssue(task()));
  assert.equal(isAuthorizedIssue({...task(), author: {login:'attacker'}}), false);
  assert.equal(isAuthorizedIssue({...task(), labels: []}), false);
  assert.equal(isAuthorizedIssue({...task(), state:'CLOSED'}), false);
  assert.equal(isAuthorizedIssue({...task(), labels: [{name:LABELS.ready},{name:LABELS.running}]}), false);
  assert.equal(isAuthorizedIssue({...task(), labels: [{name:LABELS.ready},{name:LABELS.review}]}), false);
  assert.equal(isAuthorizedIssue({...task(), labels: [{name:LABELS.ready},{name:LABELS.blocked}]}), false);
});

test('nur gewöhnlicher ULC-Code und ULC-Tests im Standard-Scope', () => {
  for (const p of ['apps/ulc-linz/worker/ui.ts', 'apps/ulc-linz/test/attendance.test.ts', 'apps/ulc-linz/worker/api/handler.ts']) {
    assert.equal(isSafeChangedPath(p), true, p);
  }
  for (const p of ['.github/workflows/ci.yml', 'AGENTS.md', 'CURRENT-GATE.md', 'modules/core/index.ts',
    'apps/ulc-linz/db/migrations/0001.sql', 'apps/ulc-linz/.env', 'apps/ulc-linz/wrangler.toml',
    'apps/ulc-linz/package.json', 'apps/ulc-linz/schema.ts', 'apps/ulc-linz/../tasks/index.ts',
    '/apps/ulc-linz/index.ts', 'apps\\ulc-linz\\worker\\ui.ts', 'apps/ulc-linz/secrets/key.txt']) {
    assert.equal(isSafeChangedPath(p), false, p);
  }
  assert.deepEqual(checkChangedPaths(['apps/ulc-linz/worker/ui.ts','AGENTS.md']).blocked, ['AGENTS.md']);
});

test('Branchname eindeutig formatiert, Prompt übernimmt feste Grenzen', () => {
  assert.equal(branchName(600, new Date('2026-11-11T12:03:04Z')), 'autodev/ulc-600-20261111120304');
  const prompt = buildPrompt(task());
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /keine Git-Pushes/i);
  assert.match(prompt, /Issue #600/);
  assert.match(buildPrompt(task(), {repairLog:'Typecheck FAIL'}), /Typecheck FAIL/);
});
