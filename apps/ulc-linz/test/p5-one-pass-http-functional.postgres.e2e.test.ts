import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import { createPostgresIdentityApplicationRuntime } from "@appbasis/identity/postgres-runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGeneratedWorker } from "../worker/index";

/**
 * Final P5 rehearsal of three real HTTP paths through the ACTUAL Worker:
 * Better Auth login/session, PostgreSQL plan persistence, and role/revoke
 * authorization. All subjects/accounts are synthetic and live in a private
 * disposable localhost database. This is not a live Cloudflare/Neon smoke,
 * production provider DPA confirmation, or deployment authorization.
 */
const inputUrl = process.env.DATABASE_URL;
if (inputUrl) {
  const u = new URL(inputUrl);
  if (
    u.protocol !== "postgres:" && u.protocol !== "postgresql:" ||
    !["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
    u.port !== "5432" ||
    u.username !== "postgres" ||
    u.pathname !== "/appbasis_identity_e2e"
  ) {
    throw new Error("P5 HTTP functional rehearsal requires the disposable localhost PostgreSQL CI server.");
  }
}
const suite = inputUrl ? describe : describe.skip;
const BASE = "https://p5-synthetic-ulc.example.test";
const SECRET = "P5-only-isolated-better-auth-test-secret-2026-11-21";
const PASSWORD = "P5-Synthetic-Temporary-Pass-2026!";
const NEW_PASSWORD = "P5-Synthetic-Final-Pass-2026!";
const ORG = "p5-synthetic-verein";
const SUBJECT = "p5-synthetic-athlete";
const DATE = "2026-11-23";

suite("ULC P5 one-pass synthetic real-HTTP functional admission", () => {
  const admin = inputUrl ? createPostgresDatabase(inputUrl) : null;
  const name = "ulc_p5_http_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const target = inputUrl ? new URL(inputUrl) : null;
  if (target) target.pathname = "/" + name;
  const logging = target ? new URL(target) : null;
  // Distinct local connection string for Worker validation; security-log
  // credential isolation is already proven by the M5 remote production smoke.
  if (logging) logging.searchParams.set("application_name", "p5-http-security-only");
  const env = target && logging ? {
    HYPERDRIVE: { connectionString: target.toString() },
    SECURITY_LOG_HYPERDRIVE: { connectionString: logging.toString() },
    APPBASIS_BASE_URL: BASE,
    BETTER_AUTH_SECRET: SECRET,
  } : null;
  const worker = createGeneratedWorker();
  let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
  let created = false;
  let trainerId = "";
  let functionaryId = "";

  function sql() {
    if (!isolated) throw new Error("P5 isolated database not ready.");
    return isolated.client;
  }
  async function send(path: string, options: {
    method?: string; cookie?: string; data?: unknown;
  } = {}) {
    if (!env) throw new Error("P5 local Worker environment missing.");
    const headers: Record<string,string> = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.data !== undefined) headers["content-type"] = "application/json";
    return worker.fetch(new Request(BASE + path, {
      method: options.method ?? "GET",
      headers,
      ...(options.data === undefined ? {} : {body: JSON.stringify(options.data)}),
    }), env);
  }
  function cookie(response: Response): string {
    const raw = response.headers.get("set-cookie");
    if (!raw) throw new Error("Signed-in identity did not receive a session cookie.");
    const first = raw.split(";")[0];
    if (!first || !/^(?:__Secure-|__Host-)?better-auth\.session_token=.+$/.test(first)) {
      throw new Error("Unexpected session cookie header.");
    }
    return first;
  }
  async function createIdentity(username: string, owner: string) {
    if (!target) throw new Error("No isolated identity target.");
    const identity = await createPostgresIdentityApplicationRuntime({
      connectionString: target.toString(), baseURL: BASE, secret: SECRET,
    });
    try {
      const user = await identity.provisioningIdentity.createInitialUser({
        username,
        temporaryPassword: PASSWORD,
        displayName: "Synthetic ULC P5",
      }, {
        provisioningOwner: owner,
        actorPrincipalId: "p5-test-provisioner",
        reason: "P5 disposable HTTP functional rehearsal",
      });
      return user.identityId;
    } finally {
      await identity.close();
    }
  }

  beforeAll(async () => {
    if (!admin || !target) throw new Error("Missing disposable localhost PostgreSQL.");
    const exists = await admin.client.unsafe(
      "SELECT 1 AS present FROM pg_database WHERE datname=$1", [name],
    );
    if (exists.length !== 0) throw new Error("Refuse to reuse a potentially persistent P5 database.");
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    isolated = createPostgresDatabase(target.toString());

    const manifest = JSON.parse(await readFile(
      new URL("../appbasis.database.json", import.meta.url), "utf8",
    )) as {owners: readonly {migrations: readonly string[]}[]};
    const migrations = manifest.owners.flatMap(o => o.migrations);
    if (migrations.length !== 44 || new Set(migrations).size !== 44) {
      throw new Error("P5 requires the current exact 44 canonical migrations.");
    }
    for (const path of migrations) {
      const body = await readFile(new URL("../../../" + path, import.meta.url), "utf8");
      for (const statement of body.split("--> statement-breakpoint")) {
        if (statement.trim()) await sql().unsafe(statement);
      }
    }
    const tables = await sql().unsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'",
    );
    if (tables[0]?.count !== 69) throw new Error("P5 requires the complete current 69-table schema.");

    trainerId = await createIdentity("p5.trainer", "ulc-linz:trainer-user");
    functionaryId = await createIdentity("p5.functionary", "ulc-linz:functionary-user");

    for (const role of ["trainer", "functionary"]) {
      await sql().unsafe("INSERT INTO appbasis_permission_role(role_id) VALUES ($1)",
        ["ulc-linz:" + role]);
    }
    // The four connected modules run under real SQL-backed capabilities:
    // trainer may read and write; functionary may only read.
    for (const module of [
      "training_planning", "exercise_catalog", "training_blocks",
      "training_documentation",
    ]) {
      for (const action of ["view", "edit"]) {
        const permission = "ulc-linz:module:" + module + ":" + action;
        await sql().unsafe(
          "INSERT INTO appbasis_permission_capability(capability_id) VALUES ($1)",
          [permission],
        );
        await sql().unsafe(
          "INSERT INTO appbasis_permission_role_capability(role_id,capability_id) VALUES ($1,$2)",
          ["ulc-linz:trainer", permission],
        );
        if (action === "view") {
          await sql().unsafe(
            "INSERT INTO appbasis_permission_role_capability(role_id,capability_id) VALUES ($1,$2)",
            ["ulc-linz:functionary", permission],
          );
        }
      }
    }
    for (const [identity,role] of [
      [trainerId, "trainer"], [functionaryId, "functionary"],
    ] as const) {
      await sql().unsafe(
        "INSERT INTO ulc_linz_membership(identity_id,organization_id,subject_id,source_role) VALUES ($1,$2,$3,$4)",
        [identity, ORG, identity + "-subject", role],
      );
      await sql().unsafe("INSERT INTO appbasis_permission_principal(principal_id) VALUES ($1)",
        [identity]);
      await sql().unsafe(
        "INSERT INTO appbasis_permission_principal_role(principal_id,role_id) VALUES ($1,$2)",
        [identity, "ulc-linz:" + role],
      );
    }
    await sql().unsafe(
      "INSERT INTO appbasis_athlete(id,organization_id,first_name,last_name) VALUES ($1,$2,$3,$4)",
      [SUBJECT, ORG, "Synthetic", "P5"],
    );
  }, 120_000);

  afterAll(async () => {
    if (isolated) {
      await isolated.client.end();
      isolated = null;
    }
    if (admin) {
      try {
        if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
      } finally {
        await admin.client.end();
      }
    }
  }, 120_000);

  it("checks HTTP sign-in -> password change -> persist/reload -> denies role and revoked edits -> sign-out", async () => {
    // (1) Live HTTP routes with real local Better Auth, not an identity stub.
    const noSession = await send("/api/auth/session");
    expect(noSession.status).toBe(401);
    const login = await send("/api/auth/sign-in", {
      method: "POST", data: {username:"p5.trainer",password:PASSWORD},
    });
    expect(login.status).toBe(200);
    expect((await login.json() as {access:string}).access).toBe("password-change-required");
    const oldCookie = cookie(login);
    const changed = await send("/api/auth/change-required-password", {
      method: "POST", cookie: oldCookie,
      data: { currentPassword:PASSWORD, newPassword:NEW_PASSWORD, idempotencyKey:randomUUID() },
    });
    expect(changed.status).toBe(200);
    expect((await changed.json() as {access:string}).access).toBe("full");
    const trainerCookie = cookie(changed);
    expect((await send("/api/auth/session",{cookie:trainerCookie})).status).toBe(200);
    expect((await send("/api/auth/session",{cookie:oldCookie})).status).toBe(401);

    // (2) Genuine HTTP POST and fresh GET, each constructing a new real
    // Worker runtime and separate PostgreSQL connection.
    const createdPlan = await send("/api/modules/training-plans", {
      method:"POST", cookie:trainerCookie,
      data:{subjectId:SUBJECT,planDate:DATE,note:"P5 synthetic technical plan",items:[]},
    });
    expect(createdPlan.status).toBe(201);
    const payload = await createdPlan.json() as {plan:{id:string;subjectId:string;revision:{note:string}}};
    expect(payload.plan.subjectId).toBe(SUBJECT);
    const url = "/api/modules/training-plans/day?subjectId=" + SUBJECT + "&planDate=" + DATE;
    const loaded = await send(url,{cookie:trainerCookie});
    expect(loaded.status).toBe(200);
    expect((await loaded.json() as {plan:{id:string;revision:{note:string}}}).plan)
      .toMatchObject({id:payload.plan.id,revision:{note:"P5 synthetic technical plan"}});
    const rows = await sql().unsafe(
      "SELECT count(*)::int AS total FROM appbasis_training_plan WHERE organization_id=$1",
      [ORG],
    );
    expect(rows[0]?.total).toBe(1);

    // (2b) Catalog, blocks and documentation are exercised through actual
    // Worker HTTP routes. Each fresh request reconstructs its SQL runtime.
    const catalogCreate = await send("/api/modules/exercise-catalog", {
      method:"POST",cookie:trainerCookie,
      data:{name:"P6 Synthetic Warmup",categoryKey:"warmup"},
    });
    expect(catalogCreate.status).toBe(201);
    const catalogItem = (await catalogCreate.json() as {item:{id:string;name:string}}).item;
    expect(catalogItem.name).toBe("P6 Synthetic Warmup");
    const catalogPath = "/api/modules/exercise-catalog/" + encodeURIComponent(catalogItem.id);
    const catalogReload = await send(catalogPath,{cookie:trainerCookie});
    expect(catalogReload.status).toBe(200);
    expect((await catalogReload.json() as {item:{id:string}}).item.id).toBe(catalogItem.id);

    const blockCreate = await send("/api/modules/training-blocks", {
      method:"POST",cookie:trainerCookie,
      data:{name:"P6 Synthetic Training Block",note:"Verified HTTP persistence",exercises:[]},
    });
    expect(blockCreate.status).toBe(201);
    // The live API exposes the persisted name under block.revision.name,
    // not as a top-level block.name property.
    const block = (await blockCreate.json() as {
      block:{id:string;currentRevision:number;revision:{name:string}}
    }).block;
    expect(block.revision.name).toBe("P6 Synthetic Training Block");
    const blockPath = "/api/modules/training-blocks/" + encodeURIComponent(block.id);
    const blockReload = await send(blockPath,{cookie:trainerCookie});
    expect(blockReload.status).toBe(200);
    expect((await blockReload.json() as {
      block:{id:string;currentRevision:number;revision:{name:string}}
    }).block).toMatchObject({
      id:block.id,
      currentRevision:block.currentRevision,
      revision:{name:"P6 Synthetic Training Block"},
    });

    const documentationStart = await send("/api/modules/training-documentation/start", {
      method:"POST",cookie:trainerCookie,
      data:{subjectId:SUBJECT,sessionDate:DATE},
    });
    expect(documentationStart.status).toBe(201);
    const documentation = (await documentationStart.json() as {
      documentation:{id:string;currentRevision:number}
    }).documentation;
    const documentationPath = "/api/modules/training-documentation/"
      + encodeURIComponent(documentation.id) + "/update";
    const documentationSave = await send(documentationPath, {
      method:"POST",cookie:trainerCookie,
      data:{expectedRevision:documentation.currentRevision,
        note:"P6 synthetic session documentation",items:[]},
    });
    expect(documentationSave.status).toBe(200);
    const docDayPath = "/api/modules/training-documentation/day?subjectId="
      + SUBJECT + "&sessionDate=" + DATE;
    const documentationReload = await send(docDayPath,{cookie:trainerCookie});
    expect(documentationReload.status).toBe(200);
    expect((await documentationReload.json() as {
      documentation:{id:string;revision:{note:string}}
    }).documentation).toMatchObject({
      id:documentation.id,revision:{note:"P6 synthetic session documentation"},
    });
    // Old client revision must never overwrite an already-saved document.
    expect((await send(documentationPath, {
      method:"POST",cookie:trainerCookie,
      data:{expectedRevision:documentation.currentRevision,
        note:"Stale overwrite",items:[]},
    })).status).toBe(409);

    // (3) A real functionary may read but not write; runtime rejects missing
    // session and a trainer whose edit permission is revoked in PostgreSQL.
    const functionaryLogin = await send("/api/auth/sign-in", {
      method:"POST",data:{username:"p5.functionary",password:PASSWORD},
    });
    expect(functionaryLogin.status).toBe(200);
    const functionaryChange = await send("/api/auth/change-required-password",{
      method:"POST",cookie:cookie(functionaryLogin),
      data:{currentPassword:PASSWORD,newPassword:NEW_PASSWORD,idempotencyKey:randomUUID()},
    });
    expect(functionaryChange.status).toBe(200);
    const functionaryCookie = cookie(functionaryChange);
    expect((await send(url,{cookie:functionaryCookie})).status).toBe(200);
    for (const path of [catalogPath,blockPath,docDayPath]) {
      expect((await send(path,{cookie:functionaryCookie})).status).toBe(200);
      expect((await send(path)).status).toBe(401);
    }
    for (const [path,data] of [
      ["/api/modules/exercise-catalog",{name:"Denied",categoryKey:"warmup"}],
      ["/api/modules/training-blocks",{name:"Denied",exercises:[]}],
      [documentationPath,{expectedRevision:documentation.currentRevision + 1,
        note:"Denied",items:[]}],
    ] as const) {
      expect((await send(path,{
        method:"POST",cookie:functionaryCookie,data,
      })).status).toBe(403);
    }
    const denied = await send("/api/modules/training-plans",{
      method:"POST",cookie:functionaryCookie,
      data:{subjectId:SUBJECT,planDate:"2026-11-24",items:[]},
    });
    expect(denied.status).toBe(403);
    expect((await send(url)).status).toBe(401);
    await sql().unsafe(
      "INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id) VALUES ($1,$2)",
      [trainerId,"ulc-linz:module:training_planning:edit"],
    );
    expect((await send("/api/modules/training-plans",{
      method:"POST",cookie:trainerCookie,
      data:{subjectId:SUBJECT,planDate:"2026-11-25",items:[]},
    })).status).toBe(403);
    expect((await send(url,{cookie:trainerCookie})).status).toBe(200);
    // Rights revocation is evaluated against current SQL, not a cached session.
    for (const module of ["exercise_catalog","training_blocks","training_documentation"]) {
      await sql().unsafe(
        "INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id) VALUES ($1,$2)",
        [trainerId,"ulc-linz:module:" + module + ":edit"],
      );
    }
    expect((await send("/api/modules/exercise-catalog", {
      method:"POST",cookie:trainerCookie,
      data:{name:"Revoked catalog write",categoryKey:"warmup"},
    })).status).toBe(403);
    expect((await send("/api/modules/training-blocks", {
      method:"POST",cookie:trainerCookie,
      data:{name:"Revoked block write",exercises:[]},
    })).status).toBe(403);
    expect((await send(documentationPath, {
      method:"POST",cookie:trainerCookie,
      data:{expectedRevision:documentation.currentRevision + 1,
        note:"Revoked document write",items:[]},
    })).status).toBe(403);
    for (const path of [catalogPath,blockPath,docDayPath]) {
      expect((await send(path,{cookie:trainerCookie})).status).toBe(200);
    }
    const countAfterDenied = await sql().unsafe(
      "SELECT count(*)::int AS total FROM appbasis_training_plan WHERE organization_id=$1",
      [ORG],
    );
    expect(countAfterDenied[0]?.total).toBe(1);
    const denials = await sql().unsafe(
      `SELECT count(*)::int AS total FROM ulc_linz_security_event_log
       WHERE category='security' AND event_type='authorization.denied'
         AND target_id='training_planning'`,
    );
    expect(Number(denials[0]?.total)).toBeGreaterThanOrEqual(2);

    expect((await send("/api/auth/sign-out",{
      method:"POST",cookie:trainerCookie,
    })).status).toBe(204);
    expect((await send("/api/auth/session",{cookie:trainerCookie})).status).toBe(401);
  },120_000);
});
