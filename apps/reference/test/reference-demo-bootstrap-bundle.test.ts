import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, mergeConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import demoBootstrapConfig from '../tooling/vite.demo-bootstrap.config';

describe('Reference demo bootstrap operational bundle', () => {
  it('builds a Node runner without embedding runtime credentials', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'appbasis-demo-bootstrap-'));
    try {
      await build(
        mergeConfig(demoBootstrapConfig, {
          build: {
            outDir,
            emptyOutDir: true,
          },
        }),
      );

      const output = await readFile(
        path.join(outDir, 'bootstrap-reference-demo-user.mjs'),
        'utf8',
      );
      expect(output.length).toBeGreaterThan(0);
      expect(output).not.toContain('APPBASIS_ROOT_ADMIN_PASSWORD=');
      expect(output).not.toContain('APPBASIS_DEMO_USER_TEMPORARY_PASSWORD=');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
