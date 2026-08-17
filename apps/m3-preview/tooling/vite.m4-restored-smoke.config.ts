import path from "node:path";
import { fileURLToPath } from "node:url";

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));

export default {
  build: {
    ssr: path.join(toolingDirectory, "m4-restored-functional-smoke.mjs"),
    outDir: path.join(toolingDirectory, ".smoke-bootstrap-dist"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "m4-restored-functional-smoke.mjs",
      },
    },
  },
  ssr: {
    noExternal: [
      "@appbasis/database",
      "@appbasis/identity",
      "@appbasis/permissions",
      "@appbasis/tasks",
      "hono",
    ],
  },
};
