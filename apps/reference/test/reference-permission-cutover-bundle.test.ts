import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, mergeConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import permissionCutoverConfig from '../tooling/vite.permission-cutover.config';

describe('Reference permission cutover operational bundle', () => {
  it('builds the isolated Node cutover runner', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'appbasis-permission-cutover-'));
    try {
      await build(
        mergeConfig(permissionCutoverConfig, {
          build: {
            outDir,
            emptyOutDir: true,
          },
        }),
      );

      const output = await readFile(
        path.join(outDir, 'reference-preview-permission-cutover.mjs'),
        'utf8',
      );
      expect(output.length).toBeGreaterThan(0);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 15_000);
});
