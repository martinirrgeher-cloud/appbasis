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

describe('Reference preview permission authority cutover workflow', () => {
  it('keeps schema upgrade and legacy assignment migration in an explicit separate control-plane workflow', () => {
    expect(cutoverWorkflow).toContain('workflow_dispatch:');
    expect(cutoverWorkflow).toContain('inputs:');
    expect(cutoverWorkflow).toContain('apply:');
    expect(cutoverWorkflow).toContain("APPBASIS_PERMISSION_CUTOVER_MODE: apply");
    expect(cutoverWorkflow).toContain('APPBASIS_DATABASE_URL: ${{ secrets.APPBASIS_DATABASE_URL }}');
    expect(cutoverWorkflow).toContain('build:permission-cutover');
    expect(cutoverWorkflow).toContain('/workers/scripts/appbasis-reference/settings');
    expect(cutoverWorkflow).toContain('group: reference-preview-deploy');
  });

  it('makes normal deploy verify only the persistent PostgreSQL authority before touching Hyperdrive or deploying the Worker', () => {
    const verifyIndex = deployWorkflow.indexOf(
      'Verify persistent permission authority before deploy',
    );
    const cacheIndex = deployWorkflow.indexOf(
      'Disable Reference Hyperdrive query caching for fresh reads',
    );
    const deployIndex = deployWorkflow.indexOf(
      'Deploy Reference preview without provisioning while preserving dashboard variables',
    );

    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(cacheIndex).toBeGreaterThan(verifyIndex);
    expect(deployIndex).toBeGreaterThan(cacheIndex);
    expect(deployWorkflow).toContain('build:permission-authority');
    expect(deployWorkflow).toContain(
      'APPBASIS_PERMISSION_AUTHORITY_TARGET: reference-preview',
    );
    expect(deployWorkflow).toContain('APPBASIS_DATABASE_URL: ${{ secrets.APPBASIS_DATABASE_URL }}');
    expect(deployWorkflow).not.toContain('Snapshot existing Reference Worker permission bindings');
    expect(deployWorkflow).not.toContain('/workers/scripts/appbasis-reference/settings');
    expect(deployWorkflow).not.toContain('APPBASIS_REFERENCE_WORKER_SETTINGS_PATH');
    expect(deployWorkflow).not.toContain('APPBASIS_PERMISSION_CUTOVER_MODE');
  });

  it('keeps the historical Cloudflare binding snapshot only in the explicit cutover workflow', () => {
    expect(cutoverWorkflow).toContain('umask 077');
    expect(cutoverWorkflow).toContain('--output ./apps/reference/tooling/.reference-worker-settings.json');
    expect(cutoverWorkflow).toContain('rm -f ./apps/reference/tooling/.reference-worker-settings.json');
    expect(cutoverWorkflow).toContain('rm -rf ./apps/reference/tooling/.permission-cutover-dist');

    expect(deployWorkflow).not.toContain('.reference-worker-settings.json');
    expect(deployWorkflow).toContain('rm -rf ./apps/reference/tooling/.permission-authority-dist');
  });

  it('self-validates permission authority changes through the existing main smoke trigger', () => {
    expect(smokeWorkflow).toContain('.github/workflows/reference-preview-permission-cutover.yml');
    expect(smokeWorkflow).toContain('apps/reference/tooling/reference-preview-permission-cutover.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/vite.permission-cutover.config.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/reference-preview-permission-authority.ts');
    expect(smokeWorkflow).toContain('apps/reference/tooling/vite.permission-authority.config.ts');
  });
});
