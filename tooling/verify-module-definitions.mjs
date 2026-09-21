import { verifyModuleDefinitions } from "./module-definition.mjs";

verifyModuleDefinitions()
  .then((definitions) => {
    console.log(
      `Verified ${definitions.length} AppBasis module definition${definitions.length === 1 ? "" : "s"}.`,
    );
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
