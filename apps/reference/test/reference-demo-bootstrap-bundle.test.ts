import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, mergeConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import demoOrchestrationConfig from '../tooling/vite.demo-orchestration.config';

describe('Reference demo bootstrap operational bundle', () => {
  it('builds the isolated Node orchestration runner', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'appbasis-demo-orchestration-'));
    try {
      await build(
        mergeConfig(demoOrchestrationConfig, {
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
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
