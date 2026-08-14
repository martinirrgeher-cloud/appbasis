import { verifyAppDefinitions } from "./app-definition.mjs";

const definitions = await verifyAppDefinitions();
const summary = definitions
  .map((definition) => `${definition.appId} [${definition.modules.join(", ") || "no modules"}]`)
  .join("; ");

console.log(`App definitions verified: ${summary}.`);
