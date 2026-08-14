import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: path.join(toolingDirectory, 'reference-preview-permission-cutover.ts'),
    outDir: path.join(toolingDirectory, '.permission-cutover-dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'reference-preview-permission-cutover.mjs',
      },
    },
  },
  ssr: {
    noExternal: ['@appbasis/database', '@appbasis/permissions'],
  },
});
