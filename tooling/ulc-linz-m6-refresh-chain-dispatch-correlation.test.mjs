import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const parentPath = new URL('../.github/workflows/m6-ulc-production-refresh-chain.yml', import.meta.url);
const childPaths = [
  '../.github/workflows/m6-ulc-production-runtime-refresh-config.yml',
  '../.github/workflows/m6-ulc-private-production-refresh-deploy.yml',
  '../.github/workflows/m5-ulc-private-security-smoke.yml',
  '../.github/workflows/m5-ulc-protected-lifecycle-operations.yml',
  '../.github/workflows/m5-ulc-production-evidence.yml',
  '../.github/workflows/m6-ulc-production-pilot-ingress.yml',
  '../.github/workflows/m6-ulc-production-smoke-principal-bootstrap.yml',
  '../.github/workflows/m6-ulc-production-post-deploy-smoke.yml',
];

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('M6 refresh chain recovers an ambiguous dispatch by a unique child run name', () => {
  const source = readFileSync(parentPath, 'utf8');

  assert.match(source, /m6-chain-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}-\$\{SELECTED_STEP\}/);
  assert.match(source, /chain_attempt_id:\$chain_attempt_id/);
  assert.match(source, /return_run_details:true/);
  assert.match(source, /set \+e[\s\S]*dispatch_rc=\$\?[\s\S]*set -e/);
  assert.match(source, /discover_attempt_run/);
  assert.match(source, /\.display_title == \$attempt/);
  assert.match(source, /M6_CHILD_ATTEMPT_ID=\$attempt_id/);
  assert.match(source, /cancelled\(\) && env\.M6_CHILD_ATTEMPT_ID != ''/);
});

test('all canonical M6 refresh-chain children expose the correlation token as run-name', () => {
  for (const path of childPaths) {
    const source = read(path);
    assert.match(source, /run-name: \$\{\{ inputs\.chain_attempt_id \|\| github\.workflow \}\}/, path);
    assert.match(source, /chain_attempt_id:\n\s+description: 'Optional unique parent-chain attempt ID for fail-closed dispatch correlation'/, path);
  }
});
