import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: path.join(toolingDirectory, 'bootstrap-reference-demo-orchestration.ts'),
    outDir: path.join(toolingDirectory, '.demo-orchestration-dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'bootstrap-reference-demo-user.mjs',
      },
    },
  },
  ssr: {
    noExternal: ['@appbasis/database', '@appbasis/identity'],
  },
});
