import { readFile } from "node:fs/promises";

const ROLE_DATA_SCOPE_URL = new URL("../worker/role-data-scope.json", import.meta.url).href;

function isRelativeTypescriptCandidate(specifier) {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("file:")
  ) && !/\.(?:[cm]?[jt]s|json|node)(?:[?#].*)?$/.test(specifier);
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !isRelativeTypescriptCandidate(specifier)) {
      throw error;
    }

    for (const suffix of [".ts", "/index.ts"]) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch (candidateError) {
        if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") {
          throw candidateError;
        }
      }
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url === ROLE_DATA_SCOPE_URL) {
    return {
      format: "json",
      source: await readFile(new URL(url), "utf8"),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
