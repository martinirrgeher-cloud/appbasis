import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: path.join(toolingDirectory, 'reference-preview-permission-foundation.ts'),
    outDir: path.join(toolingDirectory, '.permission-foundation-dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'reference-preview-permission-foundation.mjs',
      },
    },
  },
  ssr: {
    noExternal: ['@appbasis/database'],
  },
});
