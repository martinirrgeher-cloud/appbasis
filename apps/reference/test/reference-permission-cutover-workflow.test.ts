import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function readWorkflow(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../.github/workflows/${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const cutoverWorkflow = readWorkflow('reference-preview-permission-cutover.yml');
const deployWorkflow = readWorkflow('reference-preview-deploy.yml');
const smokeWorkflow = readWorkflow('reference-preview-smoke.yml');
const deploymentContract = readFileSync(
  fileURLToPath(
    new URL('../../../docs/PHASE-2E7-REFERENCE-PREVIEW-DEPLOYMENT-CONTRACT.md', import.meta.url),
  ),
  'utf8',
);

describe('Reference preview permission authority cutover workflow', () => {
  it('keeps schema upgrade and legacy assignment migration in an explicit separate control-plane workflow', () => {
    expect(cutoverWorkflow).toContain('workflow_dispatch:');
    expect(cutoverWorkflow).toContain('inputs:');
    expect(cutoverWorkflow).toContain('apply:');
    expect(cutoverWorkflow).toContain('APPBASIS_PERMISSION_CUTOVER_MODE: apply');
    expect(cutoverWorkflow).toContain('APPBASIS_DATABASE_URL: ${{ secrets.APPBASIS_DATABASE_URL }}');
    expect(cutoverWorkflow).toContain('build:permission-cutover');
    expect(cutoverWorkflow).toContain('/workers/scripts/appbasis-reference/settings');
    expect(cutoverWorkflow).toContain('group: reference-preview-deploy');
  });

  it('checks admin ingress before upload and again after deploy before the public gateway', () => {
    const verifyIndex = deployWorkflow.indexOf(
      'Verify persistent permission authority before deploy',
    );
    const cacheIndex = deployWorkflow.indexOf(
      'Disable Reference Hyperdrive query caching for fresh reads',
    );
    const preIngressIndex = deployWorkflow.indexOf(
      'Verify existing role administration Worker has no public ingress',
    );
    const roleAdminDeployIndex = deployWorkflow.indexOf(
      'Deploy internal Reference role administration Worker',
    );
    const roleAdminSnapshotIndex = deployWorkflow.indexOf(
      'Snapshot deployed role administration Worker bindings',
    );
    const roleAdminVerifyIndex = deployWorkflow.indexOf(
      'Verify internal role administration Worker authority',
    );
    const postIngressIndex = deployWorkflow.indexOf(
      'Verify deployed role administration Worker has no public ingress',
    );
    const deployIndex = deployWorkflow.indexOf(
      'Deploy Reference preview with repository-owned plaintext variables',
    );
    const snapshotIndex = deployWorkflow.indexOf(
      'Snapshot deployed Reference Worker bindings',
    );
    const bindingVerifyIndex = deployWorkflow.indexOf(
      'Verify deployed Reference Worker binding authority',
    );
    const healthIndex = deployWorkflow.indexOf('Verify deployed health');

    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(cacheIndex).toBeGreaterThan(verifyIndex);
    expect(preIngressIndex).toBeGreaterThan(cacheIndex);
    expect(roleAdminDeployIndex).toBeGreaterThan(preIngressIndex);
    expect(roleAdminSnapshotIndex).toBeGreaterThan(roleAdminDeployIndex);
    expect(roleAdminVerifyIndex).toBeGreaterThan(roleAdminSnapshotIndex);
    expect(postIngressIndex).toBeGreaterThan(roleAdminVerifyIndex);
    expect(deployIndex).toBeGreaterThan(postIngressIndex);
    expect(snapshotIndex).toBeGreaterThan(deployIndex);
    expect(bindingVerifyIndex).toBeGreaterThan(snapshotIndex);
    expect(healthIndex).toBeGreaterThan(bindingVerifyIndex);

    expect(
      deployWorkflow.match(/node \.\/tooling\/reference-role-admin-ingress\.mjs/g),
    ).toHaveLength(2);
    expect(deployWorkflow).not.toContain('/zones');
    expect(deployWorkflow).toContain('build:permission-authority');
    expect(deployWorkflow).toContain(
      'APPBASIS_PERMISSION_AUTHORITY_TARGET: reference-preview',
    );
    expect(deployWorkflow).toContain('appbasis-reference-role-admin');
    expect(deployWorkflow).toContain('wrangler.role-admin.preview.generated.json');
    expect(deployWorkflow).toContain(
      'APPBASIS_REFERENCE_ROLE_ADMIN_DEPLOYED_WORKER_SETTINGS_PATH',
    );
    expect(deployWorkflow).toContain("APPBASIS_SMOKE_ROLE_ADMIN_GATEWAY: '1'");
    expect(deployWorkflow).toContain('APPBASIS_DATABASE_URL: ${{ secrets.APPBASIS_DATABASE_URL }}');
    expect(deployWorkflow).not.toContain('Snapshot existing Reference Worker permission bindings');
    expect(deployWorkflow).not.toContain('APPBASIS_REFERENCE_WORKER_SETTINGS_PATH');
    expect(deployWorkflow).not.toContain('APPBASIS_PERMISSION_CUTOVER_MODE');
  });

  it('keeps historical pre-cutover settings separate from post-deploy binding verification', () => {
    expect(cutoverWorkflow).toContain('umask 077');
    expect(cutoverWorkflow).toContain('--output ./apps/reference/tooling/.reference-worker-settings.json');
    expect(cutoverWorkflow).toContain('rm -f ./apps/reference/tooling/.reference-worker-settings.json');
    expect(cutoverWorkflow).toContain('rm -rf ./apps/reference/tooling/.permission-cutover-dist');
    expect(cutoverWorkflow).not.toContain('.reference-worker-settings-after-deploy.json');

    expect(deployWorkflow).toContain('/workers/scripts/appbasis-reference/settings');
    expect(deployWorkflow).toContain(
      '/workers/scripts/appbasis-reference-role-admin/settings',
    );
    expect(deployWorkflow).toContain('.reference-worker-settings-after-deploy.json');
    expect(deployWorkflow).toContain('.reference-role-admin-worker-settings-after-deploy.json');
    expect(deployWorkflow).toContain('APPBASIS_REFERENCE_DEPLOYED_WORKER_SETTINGS_PATH');
    expect(deployWorkflow).toContain('node ./tooling/reference-preview-worker-settings.mjs');
    expect(deployWorkflow).toContain(
      'rm -f ./apps/reference/tooling/.reference-worker-settings-after-deploy.json',
    );
    expect(deployWorkflow).toContain(
      'rm -f ./apps/reference/tooling/.reference-role-admin-worker-settings-after-deploy.json',
    );
    expect(deployWorkflow).toContain('rm -rf ./apps/reference/tooling/.permission-authority-dist');
  });

  it('pins repository ownership of plaintext variables and the internal role-admin service contract', () => {
    expect(deploymentContract).toContain('`keep_vars: false`');
    expect(deploymentContract).not.toContain('`keep_vars: true`');
    expect(deploymentContract).toContain(
      '`APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` sind sowohl als `plain_text` als auch als `json` verboten',
    );
    expect(deploymentContract).toContain(
      'Jedes `json`-Binding blockiert den Deploy-Abschluss.',
    );
    expect(deploymentContract).toContain(
      'Worker-Secrets werden durch einen normalen Deploy unabhängig von `keep_vars` nicht gelöscht.',
    );
    expect(deploymentContract).toContain('`ROLE_ADMIN`');
    expect(deploymentContract).toContain('`appbasis-reference-role-admin`');
    expect(deploymentContract).toContain('`workers_dev: false`');
    expect(deploymentContract).toContain('`preview_urls: false`');
    expect(deploymentContract).toContain('tooling/reference-preview-worker-settings.mjs');
    expect(deploymentContract).toContain('tooling/reference-role-admin-ingress.mjs');
  });

  it('self-validates permission and role-admin runtime changes through the existing main smoke trigger', () => {
    expect(smokeWorkflow).toContain('.github/workflows/reference-preview-permission-cutover.yml');
    expect(smokeWorkflow).toContain('apps/reference/wrangler.jsonc');
    expect(smokeWorkflow).toContain('apps/reference/wrangler.role-admin.jsonc');
    expect(smokeWorkflow).toContain('apps/reference/worker/index.ts');
    expect(smokeWorkflow).toContain('apps/reference/worker/role-admin.ts');
    expect(smokeWorkflow).toContain('apps/reference/worker/role-admin-app.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/reference-preview-permission-cutover.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/vite.permission-cutover.config.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/reference-preview-permission-authority.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/vite.permission-authority.config.ts');
    expect(smokeWorkflow).toContain('tooling/reference-preview-deploy-config.mjs');
    expect(smokeWorkflow).toContain('tooling/reference-preview-worker-settings.mjs');
    expect(smokeWorkflow).toContain('tooling/reference-role-admin-ingress.mjs');
  });
});
