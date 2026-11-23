import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

/**
 * T08 private, pre-composition remote-HTTP authorization proof.
 *
 * NO production user creation, data erasure, documentation persistence,
 * Worker deployment or ingress activation. This exclusively borrows the
 * already-existing dedicated synthetic `ulc.m6.smoke` membership, grants
 * documentation view/edit temporarily, and restores the exact deny-by-default
 * two-capability baseline. Real document persistence remains separately
 * blocked until a privileged, tested full cleanup route exists.
 */
const USERNAME = "ulc.m6.smoke";
const ORG = "ulc-linz-m6-smoke";
const ROLE = "trainer";
const CAPABILITIES = Object.freeze([
  "ulc-linz:module:training_documentation:view",
  "ulc-linz:module:training_documentation:edit",
]);
const TARGET = "http://127.0.0.1:8787";
const ABSENT_SUBJECT = "ulc-m6-t08-absent-subject";
const DATE = "2026-11-24";

export function assertT08SyntheticBaseline(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("T08 dedicated smoke principal must exist exactly once.");
  }
  const row = rows[0];
  if (
    row?.organization_id !== ORG ||
    row?.source_role !== ROLE ||
    row?.active !== true ||
    row?.banned === true ||
    row?.role_count !== 1 ||
    row?.trainer_role_count !== 1 ||
    row?.revoke_count !== 2 ||
    row?.grant_count !== 0 ||
    row?.active_session_count !== 0 ||
    row?.docs_count !== 0 ||
    row?.plans_count !== 0 ||
    row?.athletes_count !== 0
  ) {
    throw new Error("T08 smoke account/organization rights or data baseline is not isolated.");
  }
}

function required(value, name) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("Missing or invalid " + name + ".");
  }
  return value;
}

function createConnection(env) {
  const value = required(env.ULC_LINZ_PRODUCTION_DATABASE_URL, "ULC_LINZ_PRODUCTION_DATABASE_URL");
  const parsed = parseUlcLinzProductionDatabaseUrl(value);
  if (parsed.database !== "neondb" || parsed.user !== "ulc_linz_application") {
    throw new Error("T08 must use only the production ULC application SQL role.");
  }
  return createPostgresDatabase(value);
}

async function inspect(sql) {
  const rows = await sql.unsafe(`
    SELECT
      m.organization_id,
      m.source_role,
      m.active,
      u.banned,
      (SELECT count(*)::int FROM appbasis_permission_principal_role r
        WHERE r.principal_id = u.id) AS role_count,
      (SELECT count(*)::int FROM appbasis_permission_principal_role r
        WHERE r.principal_id = u.id AND r.role_id='ulc-linz:trainer') AS trainer_role_count,
      (SELECT count(*)::int FROM appbasis_permission_principal_revoke r
        WHERE r.principal_id = u.id
          AND r.capability_id IN ('ulc-linz:module:training_documentation:view',
                                  'ulc-linz:module:training_documentation:edit')) AS revoke_count,
      (SELECT count(*)::int FROM appbasis_permission_principal_grant g
        WHERE g.principal_id = u.id
          AND g.capability_id IN ('ulc-linz:module:training_documentation:view',
                                  'ulc-linz:module:training_documentation:edit')) AS grant_count,
      (SELECT count(*)::int FROM session s
        WHERE s.user_id = u.id AND s.expires_at > now()) AS active_session_count,
      (SELECT count(*)::int FROM appbasis_training_documentation d
        WHERE d.organization_id = $1) AS docs_count,
      (SELECT count(*)::int FROM appbasis_training_plan p
        WHERE p.organization_id = $1) AS plans_count,
      (SELECT count(*)::int FROM appbasis_athlete a
        WHERE a.organization_id = $1) AS athletes_count
    FROM "user" u
    JOIN ulc_linz_membership m ON m.identity_id = u.id
    WHERE u.username = $2 AND m.organization_id = $1
      AND NOT EXISTS (SELECT 1 FROM ulc_linz_membership foreign_membership
        WHERE foreign_membership.identity_id = u.id AND foreign_membership.organization_id <> $1)
  `, [ORG, USERNAME]);
  assertT08SyntheticBaseline(rows);
}

async function setTemporaryDocumentationAccess(sql) {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      DELETE FROM appbasis_permission_principal_revoke r
      USING "user" u
      WHERE r.principal_id=u.id AND u.username=$1
        AND r.capability_id=ANY($2::text[])
    `, [USERNAME,CAPABILITIES]);
    await tx.unsafe(`
      INSERT INTO appbasis_permission_principal_grant(principal_id,capability_id)
      SELECT u.id, c.capability_id FROM "user" u
      CROSS JOIN unnest($2::text[]) AS c(capability_id)
      WHERE u.username=$1
      ON CONFLICT DO NOTHING
    `, [USERNAME,CAPABILITIES]);
  });
}

async function restoreDocumentationDenials(sql) {
  // Idempotent and scoped only to the pre-existing dedicated synthetic account.
  await sql.begin(async (tx) => {
    const identities = await tx.unsafe(`
      SELECT u.id FROM "user" u
      JOIN ulc_linz_membership m ON m.identity_id=u.id
      WHERE u.username=$1 AND m.organization_id=$2
        AND m.source_role='trainer' AND m.active=true
    `, [USERNAME,ORG]);
    if (identities.length !== 1) {
      throw new Error("Cannot safely restore T08 synthetic account rights; operator stop.");
    }
    await tx.unsafe(`
      DELETE FROM appbasis_permission_principal_grant g
      WHERE g.principal_id=$1 AND g.capability_id=ANY($2::text[])
    `, [identities[0].id,CAPABILITIES]);
    await tx.unsafe(`
      INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id)
      SELECT $1, c.capability_id FROM unnest($2::text[]) AS c(capability_id)
      ON CONFLICT DO NOTHING
    `, [identities[0].id,CAPABILITIES]);
    // Only the dedicated synthetic identity is affected. Expired historical
    // smoke sessions remain auditably retained; any live test session is
    // invalidated even if the HTTP process crashed before calling sign-out.
    await tx.unsafe(`
      DELETE FROM session WHERE user_id=$1 AND expires_at > now()
    `, [identities[0].id]);
  });
}

async function request(path, token, options={}) {
  const headers = { "x-appbasis-t08-smoke-token": token };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"]="application/json";
  const result = await fetch(TARGET + path, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(20000),
  });
  return result;
}

function expectStatus(response, status, code) {
  if (response.status !== status) {
    throw new Error(`T08 remote HTTP check ${code} failed (status ${response.status}, expected ${status}).`);
  }
}
function sessionCookie(response) {
  const raw = response.headers.get("set-cookie");
  const first = raw?.split(";")[0] ?? "";
  if (!/^(?:__Secure-|__Host-)?better-auth\.session_token=[^;]+$/.test(first)) {
    throw new Error("T08 expected a real Better Auth session cookie.");
  }
  return first;
}

/**
 * Only this method performs the synthetic capability switch and external
 * HTTP requests. A separate workflow `always()` cleanup invokes `cleanup`
 * again if Node, Wrangler, or the smoke fails after a committed grant.
 */
export async function runT08PrivatePreIngressSmoke(env=process.env) {
  const token = required(env.T08_SMOKE_PROBE_TOKEN,"T08_SMOKE_PROBE_TOKEN");
  if (token.length < 32) throw new Error("T08 probe token is too short.");
  const password = required(env.ULC_LINZ_PRODUCTION_SMOKE_PASSWORD,"ULC_LINZ_PRODUCTION_SMOKE_PASSWORD");
  const connection = createConnection(env);
  let cookie = null;
  let switched = false;
  try {
    await inspect(connection.client);
    expectStatus(await request("/api/auth/session",token),401,"anonymous-session");
    await setTemporaryDocumentationAccess(connection.client);
    switched=true;
    const login = await request("/api/auth/sign-in",token,{
      method:"POST",body:{username:USERNAME,password},
    });
    expectStatus(login,200,"synthetic-login");
    cookie = sessionCookie(login);
    expectStatus(await request("/api/auth/session",token,{cookie}),200,"live-session");
    expectStatus(await request("/api/modules/training-documentation",token,{cookie}),200,"documentation-view");

    // A real edit-authorized POST reaches subject validation but deliberately
    // cannot create any document, revision, plan or athlete.
    const absence = await request("/api/modules/training-documentation/start",token,{
      method:"POST",cookie,body:{subjectId:ABSENT_SUBJECT,sessionDate:DATE},
    });
    expectStatus(absence,404,"authorized-post-without-side-effects");

    await connection.client.begin(async (tx) => {
      await tx.unsafe(`
        INSERT INTO appbasis_permission_principal_revoke(principal_id,capability_id)
        SELECT u.id,c.capability_id FROM "user" u
        CROSS JOIN unnest($2::text[]) AS c(capability_id)
        WHERE u.username=$1
        ON CONFLICT DO NOTHING
      `,[USERNAME,CAPABILITIES]);
    });
    expectStatus(await request("/api/modules/training-documentation",token,{cookie}),403,"revoked-view-same-session");
    expectStatus(await request("/api/modules/training-documentation/start",token,{
      method:"POST",cookie,body:{subjectId:ABSENT_SUBJECT,sessionDate:DATE},
    }),403,"revoked-edit-same-session");
    const logout = await request("/api/auth/sign-out",token,{method:"POST",cookie});
    expectStatus(logout,204,"signout");
    expectStatus(await request("/api/auth/session",token,{cookie}),401,"revoked-session");
    cookie=null;
    return Object.freeze({anonymous401:true,authenticated200:true,
      docView200:true,authorizedPost404:true,revoke403:true,logout401:true,
      persistentDocWriteVerified:false});
  } finally {
    if (cookie) {
      try { await request("/api/auth/sign-out",token,{method:"POST",cookie}); }
      catch { /* the always()-cleanup step checks the SQL ACL independently */ }
    }
    try {
      if (switched) await restoreDocumentationDenials(connection.client);
      await inspect(connection.client);
    } finally {
      await connection.client.end();
    }
  }
}

export async function cleanupT08SyntheticDocumentationAccess(env=process.env) {
  const connection=createConnection(env);
  try {
    await restoreDocumentationDenials(connection.client);
    await inspect(connection.client);
    return true;
  } finally {
    await connection.client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const mode=process.argv[2];
    if (mode==="run") {
      const result=await runT08PrivatePreIngressSmoke();
      console.log("T08 private pre-ingress synthetic remote HTTP evidence: "+JSON.stringify(result));
    } else if (mode==="cleanup") {
      await cleanupT08SyntheticDocumentationAccess();
      console.log("T08 synthetic documentation grants removed; revokes, isolation and zero-data baseline verified.");
    } else {
      throw new Error("Usage: node t08-private-preingress-auth-smoke.mjs run|cleanup");
    }
  } catch {
    console.error("T08 private pre-ingress smoke failed closed. Inspect sanitized CI outcome; never print credentials.");
    process.exitCode=1;
  }
}
