import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeTasksModuleFixture(
  repositoryRoot,
  { compatibility = [2] } = {},
) {
  const moduleRoot = join(repositoryRoot, "modules", "tasks");
  await rm(moduleRoot, { recursive: true, force: true });
  await mkdir(join(moduleRoot, "migrations"), { recursive: true });

  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId: "tasks",
        displayName: "Aufgaben",
        packageName: "@appbasis/tasks",
        compatibility: {
          appDefinitionSchemaVersions: compatibility,
        },
        capabilities: ["tasks:manage"],
        database: {
          schemaVersion: 1,
          migrations: [
            "modules/tasks/migrations/0000_appbasis_tasks_foundation.sql",
          ],
        },
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify(
      {
        name: "@appbasis/tasks",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(
      moduleRoot,
      "migrations",
      "0000_appbasis_tasks_foundation.sql",
    ),
    "SELECT 1;\n",
  );
}


export async function writeCountdownModuleFixture(
  repositoryRoot,
  { compatibility = [2] } = {},
) {
  const moduleRoot = join(repositoryRoot, "modules", "countdown");
  await rm(moduleRoot, { recursive: true, force: true });
  await mkdir(moduleRoot, { recursive: true });

  await writeFile(
    join(moduleRoot, "appbasis.module.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        moduleId: "countdown",
        displayName: "Intervall-Countdown",
        packageName: "@appbasis/countdown",
        compatibility: {
          appDefinitionSchemaVersions: compatibility,
        },
        capabilities: ["countdown:view"],
        database: null,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify(
      {
        name: "@appbasis/countdown",
        version: "0.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  );
}
