const ULC_APP_ID = "ulc-linz";
const REQUIRED_PATHS = Object.freeze([
  "package.json",
  "worker/index.ts",
  "worker/postgres.ts",
  "test/worker.test.ts",
]);

export function extendUlcLinzSecurityIngestTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;

  const seen = new Set();
  const files = generated.files.map((entry) => {
    if (!REQUIRED_PATHS.includes(entry.path)) return entry;
    seen.add(entry.path);
    if (entry.path === "package.json") {
      return file(entry.path, withDatabaseDependency(entry.content));
    }
    if (entry.path === "worker/index.ts") {
      return file(entry.path, withDedicatedSecurityLogBinding(entry.content));
    }
    if (entry.path === "worker/postgres.ts") {
      return file(entry.path, withDedicatedSecurityLogConnection(entry.content));
    }
    return file(entry.path, withDedicatedSecurityLogWorkerTests(entry.content));
  });

  for (const path of REQUIRED_PATHS) {
    if (!seen.has(path)) {
      throw new Error(`ULC Linz security ingest requires generated path: ${path}.`);
    }
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function withDatabaseDependency(content) {
  let packageJson;
  try {
    packageJson = JSON.parse(content);
  } catch {
    throw new Error("Generated ULC package.json is not valid JSON.");
  }
  if (
    packageJson === null ||
    typeof packageJson !== "object" ||
    Array.isArray(packageJson) ||
    packageJson.dependencies === null ||
    typeof packageJson.dependencies !== "object" ||
    Array.isArray(packageJson.dependencies)
  ) {
    throw new Error("Generated ULC package dependencies are invalid.");
  }
  const existing = packageJson.dependencies["@appbasis/database"];
  if (existing !== undefined && existing !== "workspace:*") {
    throw new Error("Generated ULC database dependency drifted.");
  }
  packageJson.dependencies = {
    "@appbasis/database": "workspace:*",
    ...packageJson.dependencies,
  };
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function withDedicatedSecurityLogBinding(content) {
  let next = replaceRequired(
    content,
    `  const hyperdrive = env.HYPERDRIVE;\n  if (!isRecord(hyperdrive)) return null;`,
    `  const hyperdrive = env.HYPERDRIVE;\n  const securityLogHyperdrive = env.SECURITY_LOG_HYPERDRIVE;\n  if (!isRecord(hyperdrive) || !isRecord(securityLogHyperdrive)) return null;`,
  );
  next = replaceRequired(
    next,
    `  const connectionString = normalizedPostgresConnectionString(\n    hyperdrive.connectionString,\n  );\n  const baseURL = normalizedHttpsOrigin(env.APPBASIS_BASE_URL);`,
    `  const connectionString = normalizedPostgresConnectionString(\n    hyperdrive.connectionString,\n  );\n  const securityLogConnectionString = normalizedPostgresConnectionString(\n    securityLogHyperdrive.connectionString,\n  );\n  const baseURL = normalizedHttpsOrigin(env.APPBASIS_BASE_URL);`,
  );
  next = replaceRequired(
    next,
    `  if (connectionString === null || baseURL === null || secret === null) {\n    return null;\n  }\n\n  return Object.freeze({ connectionString, baseURL, secret });`,
    `  if (\n    connectionString === null ||\n    securityLogConnectionString === null ||\n    connectionString === securityLogConnectionString ||\n    baseURL === null ||\n    secret === null\n  ) {\n    return null;\n  }\n\n  return Object.freeze({\n    connectionString,\n    securityLogConnectionString,\n    baseURL,\n    secret,\n  });`,
  );
  return next;
}

function withDedicatedSecurityLogConnection(content) {
  let next = replaceRequired(
    content,
    `import {\n  createPostgresIdentityApplicationRuntime,`,
    `import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";\nimport {\n  createPostgresIdentityApplicationRuntime,`,
  );
  next = replaceRequired(
    next,
    `export interface GeneratedPostgresApplicationRuntimeOptions {\n  connectionString: string;\n  baseURL: string;`,
    `export interface GeneratedPostgresApplicationRuntimeOptions {\n  connectionString: string;\n  securityLogConnectionString: string;\n  baseURL: string;`,
  );
  next = replaceRequired(
    next,
    `  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);\n\n  try {\n    const permissions = createPermissionStore(identityRuntime.sql);\n    const securityEvents = createPostgresUlcLinzSecurityEventLogger(identityRuntime.sql);`,
    `  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);\n  let securityLogConnection:\n    | ReturnType<typeof createPostgresDatabase>\n    | undefined;\n\n  try {\n    securityLogConnection = createPostgresDatabase(\n      requiredSecurityLogConnectionString(options.securityLogConnectionString),\n    );\n    const securityConnection = securityLogConnection;\n    const permissions = createPermissionStore(identityRuntime.sql);\n    const securityEvents = createPostgresUlcLinzSecurityEventLogger(\n      securityConnection.client,\n    );`,
  );
  next = replaceRequired(
    next,
    `      securityEvents,\n      async close() {\n        await identityRuntime.close();\n      },`,
    `      securityEvents,\n      async close() {\n        let closeError: unknown = null;\n        try {\n          await securityConnection.client.end();\n        } catch (error) {\n          closeError = error;\n        }\n        try {\n          await identityRuntime.close();\n        } catch (error) {\n          closeError ??= error;\n        }\n        if (closeError !== null) throw closeError;\n      },`,
  );
  next = replaceRequired(
    next,
    `  } catch (error) {\n    try {\n      await identityRuntime.close();`,
    `  } catch (error) {\n    if (securityLogConnection !== undefined) {\n      try {\n        await securityLogConnection.client.end();\n      } catch {\n        // Preserve the construction failure; cleanup errors must not replace it.\n      }\n    }\n    try {\n      await identityRuntime.close();`,
  );
  next = `${next}\nfunction requiredSecurityLogConnectionString(value: string): string {\n  if (typeof value !== "string" || value.trim() !== value) {\n    throw new Error("A dedicated security-log PostgreSQL connection string is required.");\n  }\n  try {\n    const url = new URL(value);\n    if (\n      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||\n      url.hostname.length === 0\n    ) {\n      throw new Error("invalid");\n    }\n    return value;\n  } catch {\n    throw new Error("A dedicated security-log PostgreSQL connection string is required.");\n  }\n}\n`;
  return next;
}

function withDedicatedSecurityLogWorkerTests(content) {
  let next = replaceRequired(
    content,
    `  HYPERDRIVE: Object.freeze({\n    connectionString: "postgresql://user:password@database.example.test/appbasis",\n  }),\n  APPBASIS_BASE_URL:`,
    `  HYPERDRIVE: Object.freeze({\n    connectionString: "postgresql://user:password@database.example.test/appbasis",\n  }),\n  SECURITY_LOG_HYPERDRIVE: Object.freeze({\n    connectionString:\n      "postgresql://security_ingest:password@database.example.test/appbasis",\n  }),\n  APPBASIS_BASE_URL:`,
  );
  next = replaceRequired(
    next,
    `        HYPERDRIVE: { connectionString: validEnv.HYPERDRIVE.connectionString },\n        APPBASIS_BASE_URL: validEnv.APPBASIS_BASE_URL,`,
    `        HYPERDRIVE: { connectionString: validEnv.HYPERDRIVE.connectionString },\n        APPBASIS_BASE_URL: validEnv.APPBASIS_BASE_URL,\n        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,`,
  );
  next = replaceRequired(
    next,
    `      connectionString: validEnv.HYPERDRIVE.connectionString,\n      baseURL: validEnv.APPBASIS_BASE_URL,`,
    `      connectionString: validEnv.HYPERDRIVE.connectionString,\n      securityLogConnectionString:\n        validEnv.SECURITY_LOG_HYPERDRIVE.connectionString,\n      baseURL: validEnv.APPBASIS_BASE_URL,`,
  );
  next = replaceRequired(
    next,
    `  it("maps validated bindings into one request-scoped runtime, flushes security events and closes it", async () => {`,
    `  it("rejects reuse of the application database credential for security-event ingest", async () => {\n    let runtimeCalls = 0;\n    const worker = createGeneratedWorker(() => {\n      runtimeCalls += 1;\n      return runtime();\n    });\n    const response = await worker.fetch(\n      new Request("https://ulc.example.test/api/auth/session"),\n      {\n        ...validEnv,\n        SECURITY_LOG_HYPERDRIVE: {\n          connectionString: validEnv.HYPERDRIVE.connectionString,\n        },\n      },\n    );\n\n    expect(response.status).toBe(503);\n    expect(runtimeCalls).toBe(0);\n  });\n\n  it("maps validated bindings into one request-scoped runtime, flushes security events and closes it", async () => {`,
  );
  return next;
}

function replaceRequired(content, from, to) {
  if (!content.includes(from)) {
    throw new Error("Generated ULC security ingest source drifted before hardening.");
  }
  return content.replace(from, to);
}

function file(path, content) {
  return Object.freeze({ path, content });
}
