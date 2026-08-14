const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;

export function createIdentityRuntimeTemplate(input) {
  const appId = requiredIdentifier(input?.appId, "appId");
  const displayName = requiredDisplayName(input?.displayName);
  const packageName = `@appbasis/${appId}`;

  const files = [
    file("package.json", generatedPackageJson(packageName, displayName)),
    file("test/app.test.ts", generatedAppTest()),
    file("tsconfig.json", generatedTsconfig()),
    file("vitest.config.ts", generatedVitestConfig()),
    file("worker/app.ts", generatedWorkerApp(appId)),
  ];

  return Object.freeze({
    appId,
    files: Object.freeze(files),
  });
}

function generatedPackageJson(packageName, displayName) {
  return `${JSON.stringify(
    {
      name: packageName,
      version: "0.0.0",
      description: `${displayName} generated AppBasis mini application.`,
      private: true,
      type: "module",
      scripts: {
        typecheck: "tsc --noEmit -p tsconfig.json",
        test: "vitest run",
      },
      dependencies: {
        "@appbasis/identity": "workspace:*",
        hono: "4.13.1",
      },
      devDependencies: {
        "@types/node": "24.13.3",
        typescript: "5.9.3",
        vitest: "4.1.10",
      },
    },
    null,
    2,
  )}\n`;
}

function generatedTsconfig() {
  return `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        types: ["node"],
      },
      include: ["worker/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
    },
    null,
    2,
  )}\n`;
}

function generatedVitestConfig() {
  return `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    environment: "node",\n  },\n});\n`;
}

function generatedWorkerApp(appId) {
  return `import { Hono } from "hono";\n\nimport {\n  createIdentityHttpHandlers,\n  type IdentityHttpService,\n} from "@appbasis/identity/http";\n\nexport interface GeneratedAppDependencies {\n  identity: IdentityHttpService;\n  secureCookies?: boolean;\n}\n\nexport function createGeneratedApp(dependencies: GeneratedAppDependencies) {\n  const app = new Hono();\n  const identityHttp = createIdentityHttpHandlers({\n    identity: dependencies.identity,\n    secureCookies: dependencies.secureCookies ?? true,\n  });\n\n  app.get("/api/health", (context) =>\n    context.json({ status: "ok", appId: "${appId}" }),\n  );\n  app.post("/api/auth/sign-in", (context) =>\n    identityHttp.signIn(context.req.raw),\n  );\n  app.get("/api/auth/session", (context) =>\n    identityHttp.session(context.req.raw),\n  );\n  app.post("/api/auth/change-required-password", (context) =>\n    identityHttp.changeRequiredPassword(context.req.raw),\n  );\n\n  return app;\n}\n`;
}

function generatedAppTest() {
  return `import { describe, expect, it } from "vitest";\n\nimport type { IdentityHttpService } from "@appbasis/identity/http";\nimport { createGeneratedApp } from "../worker/app";\n\nconst currentIdentity = {\n  identity: {\n    identityId: "identity-1",\n    username: "mini.user",\n    displayName: "Mini User",\n    contactEmail: null,\n    personId: null,\n    mustChangePassword: false,\n    createdAt: new Date("2026-01-01T00:00:00.000Z"),\n    updatedAt: new Date("2026-01-01T00:00:00.000Z"),\n    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),\n    disabledAt: null,\n    accountStatus: "active" as const,\n  },\n  sessionToken: "appbasis.session=test-token",\n  access: "full" as const,\n};\n\nconst identity: IdentityHttpService = {\n  async signInWithUsername() {\n    return currentIdentity;\n  },\n  async getCurrentIdentity() {\n    return currentIdentity;\n  },\n  async changeRequiredPassword() {\n    return currentIdentity;\n  },\n};\n\ndescribe("generated AppBasis identity runtime", () => {\n  it("is runnable and exposes health", async () => {\n    const response = await createGeneratedApp({ identity }).request("/api/health");\n    expect(response.status).toBe(200);\n    expect(await response.json()).toMatchObject({ status: "ok" });\n  });\n\n  it("uses the shared identity HTTP contract", async () => {\n    const response = await createGeneratedApp({\n      identity,\n      secureCookies: false,\n    }).request("/api/auth/sign-in", {\n      method: "POST",\n      headers: { "content-type": "application/json" },\n      body: JSON.stringify({ username: "mini.user", password: "secret" }),\n    });\n\n    expect(response.status).toBe(200);\n    expect(response.headers.get("set-cookie")).toContain("appbasis.session=test-token");\n    expect(await response.json()).toMatchObject({\n      identity: { username: "mini.user" },\n      access: "full",\n    });\n  });\n});\n`;
}

function file(path, content) {
  return Object.freeze({ path, content });
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Generated runtime ${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return value;
}

function requiredDisplayName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 80 ||
    value.trim() !== value
  ) {
    throw new Error(
      "Generated runtime displayName must be a non-empty trimmed string with at most 80 characters.",
    );
  }
  return value;
}
