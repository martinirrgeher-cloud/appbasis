import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: path.join(toolingDirectory, 'reference-preview-permission-authority.ts'),
    outDir: path.join(toolingDirectory, '.permission-authority-dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'reference-preview-permission-authority.mjs',
      },
    },
  },
  ssr: {
    noExternal: ['@appbasis/database', '@appbasis/permissions'],
  },
});
