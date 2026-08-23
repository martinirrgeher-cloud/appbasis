const ULC_APP_ID = "ulc-linz";

export function extendUlcLinzSecurityLoggingTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;

  const modules = input?.modules ?? [];
  const platformServices = input?.platformServices ?? ["identity"];
  if (
    modules.length !== 0 ||
    !platformServices.includes("identity") ||
    !platformServices.includes("permissions")
  ) {
    throw new Error(
      "ULC Linz security logging requires the canonical identity+permissions composition.",
    );
  }

  const files = generated.files.map((entry) => {
    if (entry.path === "worker/index.ts") {
      return file(entry.path, withSecurityEventFlush(entry.content));
    }
    if (entry.path === "worker/postgres.ts") {
      return file(entry.path, withSecurityEventRuntime(entry.content));
    }
    if (entry.path === "test/worker.test.ts") {
      return file(entry.path, withSecurityEventWorkerTests(entry.content));
    }
    return entry;
  });

  if (files.some((entry) => entry.path === "worker/security-events-postgres.ts")) {
    throw new Error("ULC Linz security-event sink path is already generated.");
  }
  if (files.some((entry) => entry.path === "migrations/0002_ulc_linz_security_event_log.sql")) {
    throw new Error("ULC Linz security-event migration path is already generated.");
  }

  files.push(
    file("worker/security-events-postgres.ts", securityEventPostgresSource()),
    file("migrations/0002_ulc_linz_security_event_log.sql", securityEventMigration()),
  );

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function withSecurityEventRuntime(content) {
  let next = replaceRequired(
    content,
    `import {\n  PostgresPermissionStore,\n  type PermissionStore,\n} from "@appbasis/permissions";\n`,
    `import {\n  PostgresPermissionStore,\n  type PermissionStore,\n} from "@appbasis/permissions";\n\nimport {\n  createPostgresUlcLinzSecurityEventLogger,\n  type BufferedUlcLinzSecurityEventLogger,\n} from "./security-events-postgres";\n`,
  );
  next = replaceRequired(
    next,
    `  permissions: PermissionStore;\n  close(): Promise<void>;`,
    `  permissions: PermissionStore;\n  securityEvents: BufferedUlcLinzSecurityEventLogger;\n  close(): Promise<void>;`,
  );
  next = replaceRequired(
    next,
    `    const permissions = createPermissionStore(identityRuntime.sql);\n    return Object.freeze({\n      identity: identityRuntime.identity,\n      permissions,`,
    `    const permissions = createPermissionStore(identityRuntime.sql);\n    const securityEvents = createPostgresUlcLinzSecurityEventLogger(identityRuntime.sql);\n    return Object.freeze({\n      identity: identityRuntime.identity,\n      permissions,\n      securityEvents,`,
  );
  return next;
}

function withSecurityEventFlush(content) {
  let next = replaceRequired(
    content,
    `type WorkerErrorKind = "UNEXPECTED_RUNTIME_ERROR" | "RUNTIME_CLOSE_ERROR";`,
    `type WorkerErrorKind =\n  | "UNEXPECTED_RUNTIME_ERROR"\n  | "SECURITY_EVENT_FLUSH_ERROR"\n  | "RUNTIME_CLOSE_ERROR";`,
  );
  next = replaceRequired(
    next,
    `          identity: runtime.identity,\n          secureCookies: url.protocol === "https:",`,
    `          identity: runtime.identity,\n          secureCookies: url.protocol === "https:",\n          securityEvents: runtime.securityEvents,`,
  );
  next = replaceRequired(
    next,
    `      if (runtime !== null) {\n        await closeRuntimeSafely(runtime);`,
    `      if (runtime !== null) {\n        await flushSecurityEventsSafely(runtime);\n        await closeRuntimeSafely(runtime);`,
  );
  next = replaceRequired(
    next,
    `async function closeRuntimeSafely(\n  runtime: GeneratedPostgresApplicationRuntime,\n): Promise<void> {`,
    `async function flushSecurityEventsSafely(\n  runtime: GeneratedPostgresApplicationRuntime,\n): Promise<void> {\n  try {\n    await runtime.securityEvents.flush();\n  } catch {\n    logWorkerError(\n      "generated_worker_security_event_flush_failed",\n      "SECURITY_EVENT_FLUSH_ERROR",\n    );\n  }\n}\n\nasync function closeRuntimeSafely(\n  runtime: GeneratedPostgresApplicationRuntime,\n): Promise<void> {`,
  );
  return next;
}

function withSecurityEventWorkerTests(content) {
  let next = replaceRequired(
    content,
    `function runtime(close = async () => {}) {\n  return {`,
    `function runtime(\n  close = async () => {},\n  flush = async () => {},\n): GeneratedPostgresApplicationRuntime {\n  return {`,
  );
  next = replaceRequired(
    next,
    `    permissions: new InMemoryPermissionStore({\n      knownCapabilities: [],\n      roles: [],\n      principals: [],\n    }),\n    close,\n  } satisfies GeneratedPostgresApplicationRuntime;`,
    `    permissions: new InMemoryPermissionStore({\n      knownCapabilities: [],\n      roles: [],\n      principals: [],\n    }),\n    securityEvents: {\n      record() {},\n      flush,\n    },\n    close,\n  };`,
  );
  next = replaceRequired(
    next,
    `  it("maps validated bindings into one request-scoped runtime and closes it", async () => {\n    let closeCalls = 0;`,
    `  it("maps validated bindings into one request-scoped runtime, flushes security events and closes it", async () => {\n    let flushCalls = 0;\n    let closeCalls = 0;`,
  );
  next = replaceRequired(
    next,
    `      return runtime(async () => {\n        closeCalls += 1;\n      });`,
    `      return runtime(\n        async () => {\n          closeCalls += 1;\n        },\n        async () => {\n          flushCalls += 1;\n        },\n      );`,
  );
  next = replaceRequired(
    next,
    `    expect(closeCalls).toBe(1);\n  });\n\n  it("returns a generic runtime failure`,
    `    expect(flushCalls).toBe(1);\n    expect(closeCalls).toBe(1);\n  });\n\n  it("returns a generic runtime failure`,
  );
  next = replaceRequired(
    next,
    `  it("keeps a successful response when runtime close fails", async () => {`,
    `  it("keeps a successful response when security-event flush fails and still closes the runtime", async () => {\n    const originalError = console.error;\n    const logged: string[] = [];\n    let closeCalls = 0;\n    console.error = (...values: unknown[]) => {\n      logged.push(values.map(String).join(" "));\n    };\n    try {\n      const worker = createGeneratedWorker(() =>\n        runtime(\n          async () => {\n            closeCalls += 1;\n          },\n          async () => {\n            throw new Error("postgresql://security-log-secret/private");\n          },\n        ),\n      );\n      const response = await worker.fetch(\n        new Request("https://ulc.example.test/api/auth/session", {\n          headers: { cookie: currentIdentity.sessionToken },\n        }),\n        validEnv,\n      );\n\n      expect(response.status).toBe(200);\n      expect(closeCalls).toBe(1);\n      expect(logged.join("\\n")).toContain("SECURITY_EVENT_FLUSH_ERROR");\n      expect(logged.join("\\n")).not.toContain("security-log-secret");\n    } finally {\n      console.error = originalError;\n    }\n  });\n\n  it("keeps a successful response when runtime close fails", async () => {`,
  );
  return next;
}

function securityEventPostgresSource() {
  return `import type {\n  UlcLinzSecurityEvent,\n  UlcLinzSecurityEventLogger,\n} from "./security-events";\n\nexport type UlcLinzSecurityEventSqlParameter = string | number | boolean | null;\n\nexport interface UlcLinzSecurityEventSqlClient {\n  unsafe(\n    query: string,\n    parameters?: UlcLinzSecurityEventSqlParameter[],\n  ): PromiseLike<unknown>;\n}\n\nexport interface BufferedUlcLinzSecurityEventLogger\n  extends UlcLinzSecurityEventLogger {\n  flush(): Promise<void>;\n}\n\nconst INSERT_SECURITY_EVENT_SQL = \`\nINSERT INTO ulc_linz_security_event_log (\n  schema_version, app_id, category, event_type, occurred_at, actor_principal_id,\n  organization_id, action, target_type, target_id, operation, http_status,\n  error_code, reason_code, retained_until\n)\nVALUES (\n  $1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13, $14,\n  $5::timestamptz + interval '12 months'\n)\n\`;\n\nconst PURGE_SECURITY_EVENT_SQL = \`\nDELETE FROM ulc_linz_security_event_log\nWHERE retained_until < $1::timestamptz\n\`;\n\nexport function createPostgresUlcLinzSecurityEventLogger(\n  client: UlcLinzSecurityEventSqlClient,\n): BufferedUlcLinzSecurityEventLogger {\n  let pending: Array<Promise<boolean>> = [];\n  return Object.freeze({\n    record(event: UlcLinzSecurityEvent): void {\n      pending.push(persistEvent(client, event));\n    },\n    async flush(): Promise<void> {\n      const batch = pending;\n      pending = [];\n      if (batch.length === 0) return;\n      const results = await Promise.all(batch);\n      if (results.some((result) => result !== true)) {\n        throw new Error("ULC Linz security-event persistence failed.");\n      }\n    },\n  });\n}\n\nexport async function purgeExpiredUlcLinzSecurityEvents(\n  client: UlcLinzSecurityEventSqlClient,\n  now: Date,\n): Promise<void> {\n  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {\n    throw new Error("A valid retention evaluation time is required.");\n  }\n  await client.unsafe(PURGE_SECURITY_EVENT_SQL, [now.toISOString()]);\n}\n\nasync function persistEvent(\n  client: UlcLinzSecurityEventSqlClient,\n  event: UlcLinzSecurityEvent,\n): Promise<boolean> {\n  try {\n    await client.unsafe(INSERT_SECURITY_EVENT_SQL, eventParameters(event));\n    return true;\n  } catch {\n    return false;\n  }\n}\n\nfunction eventParameters(event: UlcLinzSecurityEvent): UlcLinzSecurityEventSqlParameter[] {\n  if (event.eventType === "identity.request.denied") {\n    return [event.schemaVersion, event.appId, event.category, event.eventType, event.occurredAt,\n      event.actorPrincipalId, event.organizationId, event.action, event.targetType, event.targetId,\n      event.operation, event.httpStatus, event.errorCode, null];\n  }\n  return [event.schemaVersion, event.appId, event.category, event.eventType, event.occurredAt,\n    event.actorPrincipalId, event.organizationId, event.action, event.targetType, event.targetId,\n    null, null, null, event.reasonCode];\n}\n`;
}

function securityEventMigration() {
  return `CREATE TABLE IF NOT EXISTS ulc_linz_security_event_log (\n  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  schema_version integer NOT NULL CHECK (schema_version = 1),\n  app_id text NOT NULL CHECK (app_id = 'ulc-linz'),\n  category text NOT NULL CHECK (category = 'security'),\n  event_type text NOT NULL CHECK (event_type IN ('identity.request.denied', 'authorization.denied')),\n  occurred_at timestamptz NOT NULL,\n  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),\n  actor_principal_id text,\n  organization_id text,\n  action text NOT NULL,\n  target_type text NOT NULL,\n  target_id text,\n  operation text,\n  http_status integer CHECK (http_status BETWEEN 400 AND 599),\n  error_code text,\n  reason_code text,\n  retained_until timestamptz NOT NULL,\n  CHECK (retained_until = occurred_at + interval '12 months'),\n  CHECK (\n    (event_type = 'identity.request.denied' AND actor_principal_id IS NULL AND organization_id IS NULL\n      AND target_type = 'identity-endpoint' AND operation IS NOT NULL AND http_status IS NOT NULL\n      AND error_code IS NOT NULL AND reason_code IS NULL)\n    OR\n    (event_type = 'authorization.denied' AND target_type = 'module' AND operation IS NULL\n      AND http_status IS NULL AND error_code IS NULL AND reason_code IS NOT NULL)\n  )\n);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS ulc_linz_security_event_log_retention_idx\n  ON ulc_linz_security_event_log (retained_until);\n--> statement-breakpoint\nCREATE INDEX IF NOT EXISTS ulc_linz_security_event_log_occurred_at_idx\n  ON ulc_linz_security_event_log (occurred_at DESC);\n`;
}

function replaceRequired(content, from, to) {
  if (!content.includes(from)) {
    throw new Error("Canonical ULC generator source drifted before security logging extension.");
  }
  return content.replace(from, to);
}

function file(path, content) {
  return Object.freeze({ path, content });
}
