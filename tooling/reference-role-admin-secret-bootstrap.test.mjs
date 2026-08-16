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
    /JSON\.stringify\(\{ name: "BETTER_AUTH_SECRET", text: process\.env\.APPBASIS_BETTER_AUTH_SECRET, type: "secret_text" \}\)/,
  );
  assert.match(
    workflow,
    /https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\$CLOUDFLARE_ACCOUNT_ID\/workers\/scripts\/appbasis-reference-role-admin\/secrets/,
  );
  assert.match(workflow, /curl --fail-with-body --silent --show-error/);
  assert.match(workflow, /--request PUT/);
  assert.match(workflow, /--data-binary @-/);
  assert.match(workflow, /response\?\.success !== true/);
  assert.match(workflow, /response\?\.result\?\.name !== 'BETTER_AUTH_SECRET'/);
  assert.match(workflow, /response\?\.result\?\.type !== 'secret_text'/);
  assert.doesNotMatch(workflow, /wrangler secret put/);
  assert.doesNotMatch(workflow, /APPBASIS_DATABASE_URL/);
  assert.doesNotMatch(workflow, /APPBASIS_HYPERDRIVE_ID/);
  assert.doesNotMatch(workflow, /wrangler deploy(?:\s|$)/);
  assert.doesNotMatch(workflow, /secret delete/);
});
