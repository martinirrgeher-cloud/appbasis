import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const PROTECTED_GROUPS = Object.freeze({
  ingest: "ulc_linz_security_event_ingest",
  cleanup: "ulc_linz_security_event_cleanup",
  read: "ulc_linz_security_event_read",
});

export async function bindUlcLinzSecurityLogRoles(
  {
    ownerDatabaseUrl,
    ingestDatabaseUrl,
    cleanupDatabaseUrl,
    readDatabaseUrl,
    apply = false,
  },
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC security-log role-binding database factory is invalid.");
  }
  if (apply !== true) {
    throw new Error("ULC security-log role binding requires explicit apply=true.");
  }

  const owner = parseCredential(ownerDatabaseUrl, "owner");
  const principals = Object.freeze({
    ingest: parseCredential(ingestDatabaseUrl, "ingest"),
    cleanup: parseCredential(cleanupDatabaseUrl, "cleanup"),
    read: parseCredential(readDatabaseUrl, "read"),
  });
  requireSameDatabase(owner, principals);
  const allUsers = [owner.user, ...Object.values(principals).map((entry) => entry.user)];
  if (new Set(allUsers).size !== allUsers.length) {
    throw new Error("ULC security-log role-binding principals must be distinct.");
  }

  const database = databaseFactory(ownerDatabaseUrl);
  try {
    const roles = await database.client.unsafe(
      `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
              rolreplication, rolbypassrls
       FROM pg_catalog.pg_roles
       WHERE rolname = ANY($1::text[])
       ORDER BY rolname`,
      [[...Object.keys(PROTECTED_GROUPS).map((key) => PROTECTED_GROUPS[key]), ...Object.values(principals).map((entry) => entry.user)]],
    );
    validateRoleInventory(roles, principals);

    const before = await readMemberships(database.client, principals);
    validateMemberships(before, principals, true);

    const needsBinding = Object.entries(principals).filter(([key, principal]) =>
      !before.some(
        (edge) =>
          edge.member === principal.user &&
          edge.parent === PROTECTED_GROUPS[key] &&
          edge.admin_option === false &&
          edge.inherit_option === true &&
          edge.set_option === true,
      ),
    );

    if (needsBinding.length > 0) {
      if (typeof database.client.begin !== "function") {
        throw new Error("ULC security-log role-binding transaction API is unavailable.");
      }
      await database.client.begin(async (transaction) => {
        if (transaction == null || typeof transaction.unsafe !== "function") {
          throw new Error("ULC security-log role-binding transaction client is invalid.");
        }
        for (const [key, principal] of needsBinding) {
          await transaction.unsafe(
            `GRANT ${quoteIdentifier(PROTECTED_GROUPS[key])} TO ${quoteIdentifier(principal.user)} WITH INHERIT TRUE SET TRUE`,
          );
        }
      });
    }

    const after = await readMemberships(database.client, principals);
    validateMemberships(after, principals, false);
    return Object.freeze({
      schemaVersion: 1,
      application: "ulc-linz",
      environment: "production",
      membershipBindingsVerified: true,
      changedBindings: needsBinding.length,
      productionReleaseAuthorized: false,
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

function parseCredential(value, label) {
  const parsed = parseUlcLinzProductionDatabaseUrl(value);
  const user = requiredRoleName(parsed.user, `${label} database role`);
  return Object.freeze({ host: parsed.host, database: parsed.database, user });
}

function requireSameDatabase(owner, principals) {
  for (const principal of Object.values(principals)) {
    if (principal.host !== owner.host || principal.database !== owner.database) {
      throw new Error("ULC security-log role-binding credentials must select one production database.");
    }
  }
}

function validateRoleInventory(rows, principals) {
  if (!Array.isArray(rows)) {
    throw new Error("ULC security-log role inventory is invalid.");
  }
  const byName = new Map(rows.map((row) => [row?.rolname, row]));
  for (const group of Object.values(PROTECTED_GROUPS)) {
    const role = byName.get(group);
    if (
      role?.rolcanlogin !== false ||
      role?.rolsuper !== false ||
      role?.rolcreatedb !== false ||
      role?.rolcreaterole !== false ||
      role?.rolreplication !== false ||
      role?.rolbypassrls !== false
    ) {
      throw new Error("ULC protected security-log group role is unavailable or privileged.");
    }
  }
  for (const principal of Object.values(principals)) {
    const role = byName.get(principal.user);
    if (
      role?.rolcanlogin !== true ||
      role?.rolsuper !== false ||
      role?.rolcreatedb !== false ||
      role?.rolcreaterole !== false ||
      role?.rolreplication !== false ||
      role?.rolbypassrls !== false
    ) {
      throw new Error("ULC security-log login role is unavailable or privileged.");
    }
  }
  if (byName.size !== Object.keys(PROTECTED_GROUPS).length + Object.keys(principals).length) {
    throw new Error("ULC security-log role inventory is not exact.");
  }
}

async function readMemberships(client, principals) {
  const users = Object.values(principals).map((entry) => entry.user);
  return client.unsafe(
    `SELECT parent.rolname AS parent, member.rolname AS member,
            membership.admin_option, membership.inherit_option, membership.set_option
     FROM pg_catalog.pg_auth_members AS membership
     JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
     JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
     WHERE member.rolname = ANY($1::text[])
     ORDER BY member.rolname, parent.rolname`,
    [users],
  );
}

function validateMemberships(rows, principals, allowRepairable) {
  if (!Array.isArray(rows)) {
    throw new Error("ULC security-log membership inventory is invalid.");
  }
  for (const [key, principal] of Object.entries(principals)) {
    const edges = rows.filter((row) => row?.member === principal.user);
    if (edges.some((edge) => edge?.admin_option !== false)) {
      throw new Error("ULC security-log membership delegation is forbidden.");
    }
    if (edges.some((edge) => edge?.parent !== PROTECTED_GROUPS[key])) {
      throw new Error("ULC security-log login has an unexpected role membership.");
    }
    if (edges.some((edge) => edge?.inherit_option !== true && (!allowRepairable || edge?.inherit_option !== false))) {
      throw new Error("ULC security-log membership inheritance is invalid.");
    }
    if (edges.some((edge) => edge?.set_option !== true && (!allowRepairable || edge?.set_option !== false))) {
      throw new Error("ULC security-log membership SET authority is invalid.");
    }
    if (edges.length > 1 || (!allowRepairable && edges.length !== 1)) {
      throw new Error("ULC security-log login membership is not exact.");
    }
    if (!allowRepairable && edges.some((edge) => edge.inherit_option !== true || edge.set_option !== true)) {
      throw new Error("ULC security-log membership is not effective.");
    }
  }
}

function requiredRoleName(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 63 ||
    value !== value.trim() ||
    value.includes("\u0000")
  ) {
    throw new Error(`ULC ${label} is invalid.`);
  }
  return value;
}

function quoteIdentifier(value) {
  return `"${requiredRoleName(value, "database role").replaceAll('"', '""')}"`;
}

async function main() {
  const result = await bindUlcLinzSecurityLogRoles({
    ownerDatabaseUrl: process.env.ULC_LINZ_PRODUCTION_OWNER_DATABASE_URL,
    ingestDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL,
    cleanupDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL,
    readDatabaseUrl: process.env.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL,
    apply: process.env.ULC_LINZ_APPLY_SECURITY_LOG_ROLE_BINDING === "1",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC security-log role binding failed.");
    process.exitCode = 1;
  });
}
