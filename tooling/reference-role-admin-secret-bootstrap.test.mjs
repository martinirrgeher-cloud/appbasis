import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/reference-role-admin-secret-bootstrap.yml', import.meta.url),
  'utf8',
);

test('role admin secret bootstrap is explicit, pre-created and ingress-guarded', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:\n[\s\S]*type: boolean/);
  assert.match(workflow, /environment: reference-preview/);
  assert.match(
    workflow,
    /APPBASIS_ROLE_ADMIN_SECRET_BOOTSTRAP_APPLY: \$\{\{ inputs\.apply && '1' \|\| '0' \}\}/,
  );
  assert.match(
    workflow,
    /test "\$APPBASIS_ROLE_ADMIN_SECRET_BOOTSTRAP_APPLY" = '1'/,
  );
  assert.match(
    workflow,
    /wrangler deployments list --name appbasis-reference-role-admin --json/,
  );
  assert.equal(
    (workflow.match(/node \.\/tooling\/reference-role-admin-ingress\.mjs/g) ?? []).length,
    2,
  );
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
});

test('role admin secret bootstrap reuses only the protected existing auth secret', () => {
  assert.match(
    workflow,
    /APPBASIS_BETTER_AUTH_SECRET: \$\{\{ secrets\.APPBASIS_BETTER_AUTH_SECRET \}\}/,
  );
  assert.match(
    workflow,
    /test -n "\$APPBASIS_BETTER_AUTH_SECRET"/,
  );
  assert.match(
    workflow,
    /printf '%s' "\$APPBASIS_BETTER_AUTH_SECRET" \| pnpm exec wrangler secret put BETTER_AUTH_SECRET/,
  );
  assert.match(workflow, /--name appbasis-reference-role-admin/);
  assert.doesNotMatch(workflow, /APPBASIS_DATABASE_URL/);
  assert.doesNotMatch(workflow, /APPBASIS_HYPERDRIVE_ID/);
  assert.doesNotMatch(workflow, /wrangler deploy/);
  assert.doesNotMatch(workflow, /secret delete/);
});
