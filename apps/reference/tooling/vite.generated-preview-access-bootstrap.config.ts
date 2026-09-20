import path from "node:path";
import { fileURLToPath } from "node:url";

const toolingDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolingDirectory, "../../..");

export default {
  build: {
    ssr: path.join(
      toolingDirectory,
      "generated-preview-access-bootstrap-runtime.mjs",
    ),
    outDir: path.join(
      toolingDirectory,
      ".generated-preview-access-dist",
    ),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "generated-app-preview-access-bootstrap.mjs",
      },
    },
  },
  ssr: {
    noExternal: [
      "@appbasis/database",
      "@appbasis/identity",
      "@appbasis/permissions",
      "@appbasis/tasks",
    ],
  },
};
