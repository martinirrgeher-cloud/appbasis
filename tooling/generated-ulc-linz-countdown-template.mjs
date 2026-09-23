const ULC_APP_ID = "ulc-linz";
const COUNTDOWN_MODULE_ID = "countdown";

export function extendUlcLinzCountdownTemplate(input, generated) {
  if (input?.appId !== ULC_APP_ID) return generated;
  const modules = input?.modules ?? [];
  const platformServices = input?.platformServices ?? ["identity"];
  if (!modules.includes(COUNTDOWN_MODULE_ID)) return generated;
  if (
    !platformServices.includes("identity") ||
    !platformServices.includes("permissions")
  ) {
    throw new Error(
      "ULC Linz countdown runtime requires identity and permissions.",
    );
  }

  const files = generated.files.map((entry) => {
    if (entry.path === "worker/app.ts") {
      return file(entry.path, withCountdownAppRoute(entry.content));
    }
    if (entry.path === "worker/index.ts") {
      return file(entry.path, withCountdownWorkerComposition(entry.content));
    }
    if (entry.path === "worker/postgres.ts") {
      return file(entry.path, withCountdownPostgresRuntime(entry.content));
    }
    if (entry.path === "test/worker.test.ts") {
      return file(entry.path, withCountdownWorkerTests(entry.content));
    }
    return entry;
  });

  const added = [
    file("worker/countdown-access.ts", countdownAccessSource()),
    file(
      "worker/countdown-membership-postgres.ts",
      countdownMembershipPostgresSource(),
    ),
    file("test/countdown-access.test.ts", countdownAccessTestSource()),
    file(
      "test/countdown-membership-postgres.test.ts",
      countdownMembershipPostgresTestSource(),
    ),
  ];
  for (const entry of added) {
    if (files.some((candidate) => candidate.path === entry.path)) {
      throw new Error(
        `ULC Linz countdown runtime path is already generated: ${entry.path}.`,
      );
    }
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze([...files, ...added]),
  });
}

function withCountdownAppRoute(content) {
  let next = replaceRequired(
    content,
    'import { Hono } from "hono";\n',
    'import { Hono, type Context } from "hono";\n',
  );
  next = replaceRequired(
    next,
    `import {
  createIdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
`,
    `import { IdentityError } from "@appbasis/identity";
import {
  createIdentityHttpHandlers,
  type IdentityHttpHandlers,
  type IdentityHttpService,
} from "@appbasis/identity/http";
import type { PermissionStore } from "@appbasis/permissions";
`,
  );
  next = replaceRequired(
    next,
    `import {
  recordUlcLinzSecurityEvent,
`,
    `import {
  assertUlcLinzCountdownAccess,
  ULC_LINZ_COUNTDOWN_MODULE_ID,
  UlcLinzCountdownAccessDeniedError,
  type UlcLinzCountdownMembershipResolver,
} from "./countdown-access";
import {
  recordUlcLinzSecurityEvent,
`,
  );
  next = replaceRequired(
    next,
    `export interface GeneratedAppDependencies {
  identity: IdentityHttpService;
  secureCookies?: boolean;
  securityEvents?: UlcLinzSecurityEventLogger;
}`,
    `export interface GeneratedAppDependencies {
  identity: IdentityHttpService;
  permissions?: PermissionStore;
  countdownMemberships?: UlcLinzCountdownMembershipResolver;
  secureCookies?: boolean;
  securityEvents?: UlcLinzSecurityEventLogger;
}`,
  );
  next = replaceRequired(
    next,
    `  app.post("/api/auth/change-required-password", async (context) =>
    identityResponseWithSecurityLogging(
      "change-required-password",
      identityHttp.changeRequiredPassword(context.req.raw),
      dependencies.securityEvents,
    ),
  );

  return app;
}`,
    `  app.post("/api/auth/change-required-password", async (context) =>
    identityResponseWithSecurityLogging(
      "change-required-password",
      identityHttp.changeRequiredPassword(context.req.raw),
      dependencies.securityEvents,
    ),
  );
  app.get("/api/modules/countdown/access", (context) =>
    countdownAccessResponse(context, dependencies, identityHttp),
  );

  return app;
}`,
  );
  next = replaceRequired(
    next,
    "async function identityResponseWithSecurityLogging(",
    `async function countdownAccessResponse(
  context: Context,
  dependencies: GeneratedAppDependencies,
  identityHttp: IdentityHttpHandlers,
): Promise<Response> {
  if (
    dependencies.permissions === undefined ||
    dependencies.countdownMemberships === undefined
  ) {
    return context.json(
      {
        error: {
          code: "COUNTDOWN_RUNTIME_NOT_CONFIGURED",
          message: "The countdown runtime is not configured.",
        },
      },
      503,
    );
  }

  const current = await identityHttp.resolveCurrentIdentity(context.req.raw);
  if (current instanceof Response) {
    recordUlcLinzSecurityEvent(dependencies.securityEvents, {
      eventType: "authorization.denied",
      actorPrincipalId: null,
      organizationId: null,
      action: "view",
      targetId: ULC_LINZ_COUNTDOWN_MODULE_ID,
      reasonCode: "identity-access-denied",
    });
    return current;
  }

  try {
    await assertUlcLinzCountdownAccess(current, {
      permissions: dependencies.permissions,
      memberships: dependencies.countdownMemberships,
      securityEvents: dependencies.securityEvents,
    });
    return context.json({
      moduleId: ULC_LINZ_COUNTDOWN_MODULE_ID,
      canView: true,
    });
  } catch (error) {
    if (error instanceof UlcLinzCountdownAccessDeniedError) {
      return context.json(
        {
          error: {
            code: error.code,
            message: "Countdown access is denied.",
          },
        },
        403,
      );
    }
    if (error instanceof IdentityError) {
      return identityHttp.identityErrorResponse(error);
    }
    throw error;
  }
}

async function identityResponseWithSecurityLogging(`,
  );
  return next;
}

function withCountdownWorkerComposition(content) {
  return replaceRequired(
    content,
    `          identity: runtime.identity,
          secureCookies: url.protocol === "https:",
          securityEvents: runtime.securityEvents,`,
    `          identity: runtime.identity,
          permissions: runtime.permissions,
          countdownMemberships: runtime.countdownMemberships,
          secureCookies: url.protocol === "https:",
          securityEvents: runtime.securityEvents,`,
  );
}

function withCountdownPostgresRuntime(content) {
  let next = replaceRequired(
    content,
    `import {
  createPostgresUlcLinzSecurityEventLogger,
  type BufferedUlcLinzSecurityEventLogger,
} from "./security-events-postgres";`,
    `import {
  createPostgresUlcLinzSecurityEventLogger,
  type BufferedUlcLinzSecurityEventLogger,
} from "./security-events-postgres";
import {
  PostgresUlcLinzCountdownMembershipResolver,
  type UlcLinzCountdownSqlClient,
} from "./countdown-membership-postgres";
import type { UlcLinzCountdownMembershipResolver } from "./countdown-access";`,
  );
  next = replaceRequired(
    next,
    `  permissions: PermissionStore;
  securityEvents: BufferedUlcLinzSecurityEventLogger;`,
    `  permissions: PermissionStore;
  countdownMemberships: UlcLinzCountdownMembershipResolver;
  securityEvents: BufferedUlcLinzSecurityEventLogger;`,
  );
  next = replaceRequired(
    next,
    `    const permissions = createPermissionStore(identityRuntime.sql);
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(`,
    `    const permissions = createPermissionStore(identityRuntime.sql);
    const countdownMemberships =
      new PostgresUlcLinzCountdownMembershipResolver(
        createCountdownSqlClient(identityRuntime.sql),
      );
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(`,
  );
  next = replaceRequired(
    next,
    `      identity: identityRuntime.identity,
      permissions,
      securityEvents,`,
    `      identity: identityRuntime.identity,
      permissions,
      countdownMemberships,
      securityEvents,`,
  );
  next = replaceRequired(
    next,
    `function requiredSecurityLogConnectionString(value: string): string {`,
    `function createCountdownSqlClient(
  client: IdentityPostgresRuntimeSqlClient,
): UlcLinzCountdownSqlClient {
  return Object.freeze({
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  });
}

function requiredSecurityLogConnectionString(value: string): string {`,
  );
  return next;
}

function withCountdownWorkerTests(content) {
  let next = replaceRequired(
    content,
    'import { InMemoryPermissionStore } from "@appbasis/permissions";',
    `import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";`,
  );
  next = replaceRequired(
    next,
    `function runtime(
  close = async () => {},
  flush = async () => {},
): GeneratedPostgresApplicationRuntime {
  return {
    identity,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [],
      roles: [],
      principals: [],
    }),
    securityEvents: {`,
    `function runtime(
  close = async () => {},
  flush = async () => {},
): GeneratedPostgresApplicationRuntime {
  const countdownView = capabilityId("ulc-linz:module:countdown:view");
  const trainerRole = roleId("ulc-linz:trainer");
  return {
    identity,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [countdownView],
      roles: [{ roleId: trainerRole, capabilities: [] }],
      principals: [
        {
          principalId: principalId(currentIdentity.identity.identityId),
          roleIds: [trainerRole],
          grants: [countdownView],
          revokes: [],
        },
      ],
    }),
    countdownMemberships: {
      async resolveMembershipForIdentity(identityId) {
        if (identityId !== currentIdentity.identity.identityId) return null;
        return {
          organizationId: "verein-worker-1",
          sourceRole: "trainer",
          active: true,
        };
      },
    },
    securityEvents: {`,
  );
  next = replaceRequired(
    next,
    `  it("returns a generic runtime failure without leaking provider error details", async () => {`,
    `  it("serves countdown access only after session, membership, role and capability checks", async () => {
    let flushCalls = 0;
    let closeCalls = 0;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {
          closeCalls += 1;
        },
        async () => {
          flushCalls += 1;
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/access", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      moduleId: "countdown",
      canView: true,
    });
    expect(flushCalls).toBe(1);
    expect(closeCalls).toBe(1);
  });

  it("denies countdown access without a valid session and still flushes security events", async () => {
    let flushCalls = 0;
    let closeCalls = 0;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {
          closeCalls += 1;
        },
        async () => {
          flushCalls += 1;
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/access"),
      validEnv,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_INVALID" },
    });
    expect(flushCalls).toBe(1);
    expect(closeCalls).toBe(1);
  });

  it("returns a generic runtime failure without leaking provider error details", async () => {`,
  );
  return next;
}

function countdownAccessSource() {
  return "import { COUNTDOWN_CAPABILITIES } from \"@appbasis/countdown\";\nimport { assertIdentityActionAllowed } from \"@appbasis/identity/access\";\nimport {\n  can,\n  capabilityId,\n  principalId,\n  roleId,\n  type PermissionStore,\n} from \"@appbasis/permissions\";\n\nimport roleDataScope from \"./role-data-scope.json\";\nimport {\n  recordUlcLinzSecurityEvent,\n  type UlcLinzAuthorizationDenyReason,\n  type UlcLinzSecurityEventLogger,\n} from \"./security-events\";\nimport type { UlcLinzCurrentIdentity } from \"./authorization\";\n\ntype UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;\n\nexport interface UlcLinzCountdownMembership {\n  readonly organizationId: string;\n  readonly sourceRole: string;\n  readonly active: boolean;\n}\n\nexport interface UlcLinzCountdownMembershipResolver {\n  resolveMembershipForIdentity(\n    identityId: string,\n  ): Promise<UlcLinzCountdownMembership | null>;\n}\n\nexport interface UlcLinzCountdownAccessDependencies {\n  readonly permissions: PermissionStore;\n  readonly memberships: UlcLinzCountdownMembershipResolver;\n  readonly securityEvents?: UlcLinzSecurityEventLogger;\n}\n\nconst COUNTDOWN_CONTRACT = countdownCapabilityContract();\n\nexport const ULC_LINZ_COUNTDOWN_MODULE_ID = COUNTDOWN_CONTRACT.moduleId;\n\nexport class UlcLinzCountdownAccessDeniedError extends Error {\n  readonly code = \"ULC_LINZ_COUNTDOWN_ACCESS_DENIED\";\n\n  constructor() {\n    super(\"ULC Linz countdown access denied.\");\n    this.name = \"UlcLinzCountdownAccessDeniedError\";\n  }\n}\n\nexport async function assertUlcLinzCountdownAccess(\n  current: UlcLinzCurrentIdentity,\n  dependencies: UlcLinzCountdownAccessDependencies,\n): Promise<void> {\n  const contract = COUNTDOWN_CONTRACT;\n  try {\n    assertIdentityActionAllowed(current, \"application\");\n  } catch (error) {\n    recordDenial(\n      dependencies.securityEvents,\n      current.identity.identityId,\n      null,\n      contract.moduleId,\n      \"identity-access-denied\",\n    );\n    throw error;\n  }\n\n  const identityId = requiredIdentifier(current.identity.identityId, () =>\n    deny(\n      dependencies.securityEvents,\n      null,\n      null,\n      contract.moduleId,\n      \"invalid-request\",\n    ),\n  );\n\n  const membership =\n    await dependencies.memberships.resolveMembershipForIdentity(identityId);\n  if (\n    membership === null ||\n    membership.active !== true ||\n    !isSourceRole(membership.sourceRole) ||\n    !isValidIdentifier(membership.organizationId)\n  ) {\n    deny(\n      dependencies.securityEvents,\n      identityId,\n      null,\n      contract.moduleId,\n      \"membership-denied\",\n    );\n  }\n\n  const organizationId = membership.organizationId;\n  const currentPrincipalId = principalId(identityId);\n  const principal = await dependencies.permissions.findPrincipal(currentPrincipalId);\n  const expectedRoleId = roleId(\n    roleDataScope.runtimeRoleIds[membership.sourceRole],\n  );\n  if (\n    principal === null ||\n    principal.roleIds.length !== 1 ||\n    principal.roleIds[0] !== expectedRoleId\n  ) {\n    deny(\n      dependencies.securityEvents,\n      identityId,\n      organizationId,\n      contract.moduleId,\n      \"role-mismatch\",\n    );\n  }\n\n  const allowed = await can(dependencies.permissions, {\n    principalId: currentPrincipalId,\n    capability: capabilityId(contract.runtimeCapability),\n  });\n  if (!allowed) {\n    deny(\n      dependencies.securityEvents,\n      identityId,\n      organizationId,\n      contract.moduleId,\n      \"capability-denied\",\n    );\n  }\n}\n\nfunction countdownCapabilityContract(): {\n  readonly moduleId: string;\n  readonly runtimeCapability: string;\n} {\n  const moduleCapability = COUNTDOWN_CAPABILITIES.view;\n  const parts = moduleCapability.split(\":\");\n  if (\n    parts.length !== 2 ||\n    parts[0] === undefined ||\n    parts[1] === undefined ||\n    !isValidIdentifier(parts[0]) ||\n    parts[1] !== roleDataScope.principalPermissionMapping.viewAction ||\n    roleDataScope.principalPermissionMapping.capabilityNamespace !==\n      \"ulc-linz:module\"\n  ) {\n    throw new Error(\"Countdown capability contract is not compatible with ULC Linz.\");\n  }\n  return Object.freeze({\n    moduleId: parts[0],\n    runtimeCapability:\n      `${roleDataScope.principalPermissionMapping.capabilityNamespace}:${moduleCapability}`,\n  });\n}\n\nfunction isSourceRole(value: string): value is UlcLinzSourceRole {\n  return Object.hasOwn(roleDataScope.runtimeRoleIds, value);\n}\n\nfunction isValidIdentifier(value: unknown): value is string {\n  return (\n    typeof value === \"string\" &&\n    value.length > 0 &&\n    value.length <= 200 &&\n    value === value.trim()\n  );\n}\n\nfunction requiredIdentifier(value: unknown, onInvalid: () => never): string {\n  if (!isValidIdentifier(value)) onInvalid();\n  return value;\n}\n\nfunction deny(\n  securityEvents: UlcLinzSecurityEventLogger | undefined,\n  actorPrincipalId: string | null,\n  organizationId: string | null,\n  moduleId: string,\n  reasonCode: UlcLinzAuthorizationDenyReason,\n): never {\n  recordDenial(\n    securityEvents,\n    actorPrincipalId,\n    organizationId,\n    moduleId,\n    reasonCode,\n  );\n  throw new UlcLinzCountdownAccessDeniedError();\n}\n\nfunction recordDenial(\n  securityEvents: UlcLinzSecurityEventLogger | undefined,\n  actorPrincipalId: string | null,\n  organizationId: string | null,\n  moduleId: string,\n  reasonCode: UlcLinzAuthorizationDenyReason,\n): void {\n  recordUlcLinzSecurityEvent(securityEvents, {\n    eventType: \"authorization.denied\",\n    actorPrincipalId,\n    organizationId,\n    action: \"view\",\n    targetId: moduleId,\n    reasonCode,\n  });\n}\n";
}

function countdownMembershipPostgresSource() {
  return "import type {\n  UlcLinzCountdownMembership,\n  UlcLinzCountdownMembershipResolver,\n} from \"./countdown-access\";\n\ntype UlcLinzCountdownSqlParameter = string | number | boolean | null;\n\nexport interface UlcLinzCountdownSqlClient {\n  unsafe(\n    query: string,\n    parameters?: UlcLinzCountdownSqlParameter[],\n  ): PromiseLike<readonly Record<string, unknown>[]>;\n}\n\nexport class PostgresUlcLinzCountdownMembershipResolver\n  implements UlcLinzCountdownMembershipResolver\n{\n  constructor(private readonly sql: UlcLinzCountdownSqlClient) {}\n\n  async resolveMembershipForIdentity(\n    identityId: string,\n  ): Promise<UlcLinzCountdownMembership | null> {\n    const normalizedIdentityId = requiredIdentifier(identityId);\n    const rows = await this.sql.unsafe(\n      `SELECT organization_id, source_role, active\n       FROM ulc_linz_membership\n       WHERE identity_id = $1`,\n      [normalizedIdentityId],\n    );\n    if (rows.length === 0) return null;\n    if (rows.length !== 1) blocked();\n\n    const row = rows[0];\n    if (row === undefined) blocked();\n    const organizationId = row.organization_id;\n    const sourceRole = row.source_role;\n    const active = row.active;\n    if (\n      typeof organizationId !== \"string\" ||\n      organizationId.length === 0 ||\n      organizationId.length > 200 ||\n      organizationId !== organizationId.trim() ||\n      typeof sourceRole !== \"string\" ||\n      sourceRole.length === 0 ||\n      sourceRole.length > 200 ||\n      sourceRole !== sourceRole.trim() ||\n      typeof active !== \"boolean\"\n    ) {\n      blocked();\n    }\n\n    return Object.freeze({\n      organizationId,\n      sourceRole,\n      active,\n    });\n  }\n}\n\nexport class UlcLinzCountdownMembershipStateError extends Error {\n  readonly code = \"ULC_LINZ_COUNTDOWN_MEMBERSHIP_STATE_INVALID\";\n\n  constructor() {\n    super(\"ULC Linz countdown membership state is invalid.\");\n    this.name = \"UlcLinzCountdownMembershipStateError\";\n  }\n}\n\nfunction requiredIdentifier(value: string): string {\n  if (\n    typeof value !== \"string\" ||\n    value.length === 0 ||\n    value.length > 200 ||\n    value !== value.trim()\n  ) {\n    blocked();\n  }\n  return value;\n}\n\nfunction blocked(): never {\n  throw new UlcLinzCountdownMembershipStateError();\n}\n";
}

function countdownAccessTestSource() {
  return "import { describe, expect, it } from \"vitest\";\n\nimport { COUNTDOWN_CAPABILITIES } from \"@appbasis/countdown\";\nimport {\n  capabilityId,\n  InMemoryPermissionStore,\n  principalId,\n  roleId,\n} from \"@appbasis/permissions\";\n\nimport {\n  assertUlcLinzCountdownAccess,\n  UlcLinzCountdownAccessDeniedError,\n  type UlcLinzCountdownAccessDependencies,\n} from \"../worker/countdown-access\";\nimport type { UlcLinzCurrentIdentity } from \"../worker/authorization\";\n\nconst IDENTITY_ID = \"identity-countdown-1\";\nconst ORGANIZATION_ID = \"verein-1\";\nconst COUNTDOWN_RUNTIME_CAPABILITY = capabilityId(\n  `ulc-linz:module:${COUNTDOWN_CAPABILITIES.view}`,\n);\n\nfunction currentIdentity(\n  access: UlcLinzCurrentIdentity[\"access\"] = \"full\",\n): UlcLinzCurrentIdentity {\n  return {\n    identity: {\n      identityId: IDENTITY_ID,\n      username: \"countdown.user\",\n      displayName: \"Countdown User\",\n      contactEmail: null,\n      personId: null,\n      mustChangePassword: access === \"password-change-required\",\n      createdAt: new Date(\"2026-01-01T00:00:00.000Z\"),\n      updatedAt: new Date(\"2026-01-01T00:00:00.000Z\"),\n      passwordChangedAt: new Date(\"2026-01-01T00:00:00.000Z\"),\n      disabledAt: null,\n      accountStatus: \"active\",\n    },\n    sessionToken: \"appbasis.session=countdown-test-token\",\n    access,\n  };\n}\n\nfunction dependencies(input: {\n  sourceRole?: \"admin\" | \"trainer\" | \"athlete\" | \"parent\";\n  active?: boolean;\n  roleIds?: string[];\n  grants?: ReturnType<typeof capabilityId>[];\n  revokes?: ReturnType<typeof capabilityId>[];\n  adminCapability?: boolean;\n  membership?: boolean;\n  events?: Array<Record<string, unknown>>;\n} = {}): UlcLinzCountdownAccessDependencies {\n  const sourceRole = input.sourceRole ?? \"trainer\";\n  const runtimeRole = roleId(`ulc-linz:${sourceRole}`);\n  return {\n    permissions: new InMemoryPermissionStore({\n      knownCapabilities: [COUNTDOWN_RUNTIME_CAPABILITY],\n      roles: ([\"admin\", \"trainer\", \"athlete\", \"parent\"] as const).map(\n        (role) => ({\n          roleId: roleId(`ulc-linz:${role}`),\n          capabilities:\n            role === \"admin\" && input.adminCapability !== false\n              ? [COUNTDOWN_RUNTIME_CAPABILITY]\n              : [],\n        }),\n      ),\n      principals: [\n        {\n          principalId: principalId(IDENTITY_ID),\n          roleIds: (input.roleIds ?? [runtimeRole]).map(roleId),\n          grants:\n            input.grants ??\n            (sourceRole === \"admin\" ? [] : [COUNTDOWN_RUNTIME_CAPABILITY]),\n          revokes: input.revokes ?? [],\n        },\n      ],\n    }),\n    memberships: {\n      async resolveMembershipForIdentity(identityId) {\n        expect(identityId).toBe(IDENTITY_ID);\n        if (input.membership === false) return null;\n        return {\n          organizationId: ORGANIZATION_ID,\n          sourceRole,\n          active: input.active ?? true,\n        };\n      },\n    },\n    ...(input.events === undefined\n      ? {}\n      : {\n          securityEvents: {\n            record(event: unknown) {\n              input.events?.push(event as Record<string, unknown>);\n            },\n          },\n        }),\n  };\n}\n\ndescribe(\"ULC Linz countdown runtime access\", () => {\n  it(\"maps the public countdown capability into the ULC permission namespace\", async () => {\n    expect(COUNTDOWN_CAPABILITIES.view).toBe(\"countdown:view\");\n    await expect(\n      assertUlcLinzCountdownAccess(currentIdentity(), dependencies()),\n    ).resolves.toBeUndefined();\n  });\n\n  it.each([\"trainer\", \"athlete\", \"parent\"] as const)(\n    \"allows an active %s only with the persisted countdown view grant\",\n    async (sourceRole) => {\n      await expect(\n        assertUlcLinzCountdownAccess(\n          currentIdentity(),\n          dependencies({ sourceRole }),\n        ),\n      ).resolves.toBeUndefined();\n\n      await expect(\n        assertUlcLinzCountdownAccess(\n          currentIdentity(),\n          dependencies({ sourceRole, grants: [] }),\n        ),\n      ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n    },\n  );\n\n  it(\"allows admin through the canonical role capability\", async () => {\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({ sourceRole: \"admin\" }),\n      ),\n    ).resolves.toBeUndefined();\n  });\n\n  it(\"denies missing or inactive membership before capability access\", async () => {\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({ membership: false }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({ active: false }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n  });\n\n  it(\"requires the principal role to match the membership role exactly\", async () => {\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({\n          sourceRole: \"trainer\",\n          roleIds: [\"ulc-linz:athlete\"],\n        }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({\n          sourceRole: \"trainer\",\n          roleIds: [\"ulc-linz:trainer\", \"ulc-linz:admin\"],\n        }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n  });\n\n  it(\"keeps explicit revokes deny-by-default\", async () => {\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({\n          revokes: [COUNTDOWN_RUNTIME_CAPABILITY],\n        }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n  });\n\n  it(\"records a normalized module denial without subject data\", async () => {\n    const events: Array<Record<string, unknown>> = [];\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(),\n        dependencies({ grants: [], events }),\n      ),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownAccessDeniedError);\n\n    expect(events).toHaveLength(1);\n    expect(events[0]).toMatchObject({\n      eventType: \"authorization.denied\",\n      actorPrincipalId: IDENTITY_ID,\n      organizationId: ORGANIZATION_ID,\n      action: \"view\",\n      targetType: \"module\",\n      targetId: \"countdown\",\n      reasonCode: \"capability-denied\",\n    });\n    expect(JSON.stringify(events[0])).not.toContain(\"subject\");\n  });\n\n  it(\"blocks countdown access while a required password change is pending\", async () => {\n    await expect(\n      assertUlcLinzCountdownAccess(\n        currentIdentity(\"password-change-required\"),\n        dependencies(),\n      ),\n    ).rejects.toMatchObject({ code: \"PASSWORD_CHANGE_REQUIRED\" });\n  });\n});\n";
}

function countdownMembershipPostgresTestSource() {
  return "import { describe, expect, it } from \"vitest\";\n\nimport {\n  PostgresUlcLinzCountdownMembershipResolver,\n  UlcLinzCountdownMembershipStateError,\n} from \"../worker/countdown-membership-postgres\";\n\ndescribe(\"ULC Linz countdown PostgreSQL membership resolver\", () => {\n  it(\"resolves the identity-owned single membership without client organization input\", async () => {\n    const calls: Array<{ query: string; parameters?: (string | number | boolean | null)[] }> = [];\n    const resolver = new PostgresUlcLinzCountdownMembershipResolver({\n      async unsafe(query, parameters) {\n        calls.push({ query, ...(parameters === undefined ? {} : { parameters }) });\n        return [\n          {\n            organization_id: \"verein-1\",\n            source_role: \"athlete\",\n            active: true,\n          },\n        ];\n      },\n    });\n\n    await expect(\n      resolver.resolveMembershipForIdentity(\"identity-1\"),\n    ).resolves.toEqual({\n      organizationId: \"verein-1\",\n      sourceRole: \"athlete\",\n      active: true,\n    });\n    expect(calls).toHaveLength(1);\n    expect(calls[0]?.query).toContain(\"WHERE identity_id = $1\");\n    expect(calls[0]?.parameters).toEqual([\"identity-1\"]);\n  });\n\n  it(\"returns null for an identity without membership\", async () => {\n    const resolver = new PostgresUlcLinzCountdownMembershipResolver({\n      async unsafe() {\n        return [];\n      },\n    });\n    await expect(\n      resolver.resolveMembershipForIdentity(\"identity-1\"),\n    ).resolves.toBeNull();\n  });\n\n  it(\"fails closed for impossible duplicate or malformed membership state\", async () => {\n    const duplicate = new PostgresUlcLinzCountdownMembershipResolver({\n      async unsafe() {\n        return [\n          { organization_id: \"verein-1\", source_role: \"trainer\", active: true },\n          { organization_id: \"verein-2\", source_role: \"trainer\", active: true },\n        ];\n      },\n    });\n    await expect(\n      duplicate.resolveMembershipForIdentity(\"identity-1\"),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownMembershipStateError);\n\n    const malformed = new PostgresUlcLinzCountdownMembershipResolver({\n      async unsafe() {\n        return [\n          { organization_id: \" verein-1\", source_role: \"trainer\", active: true },\n        ];\n      },\n    });\n    await expect(\n      malformed.resolveMembershipForIdentity(\"identity-1\"),\n    ).rejects.toBeInstanceOf(UlcLinzCountdownMembershipStateError);\n  });\n});\n";
}

function replaceRequired(content, from, to) {
  if (!content.includes(from)) {
    throw new Error(
      "Canonical ULC generator source drifted before countdown extension.",
    );
  }
  return content.replace(from, to);
}

function file(path, content) {
  return Object.freeze({ path, content });
}
