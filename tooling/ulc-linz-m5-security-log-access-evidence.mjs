import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const GROUPS = Object.freeze({
  ingest: "ulc_linz_security_event_ingest",
  cleanup: "ulc_linz_security_event_cleanup",
  read: "ulc_linz_security_event_read",
});
const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const ALLOWED_INGEST_COLUMNS = Object.freeze([
  "schema_version", "app_id", "category", "event_type", "occurred_at",
  "actor_principal_id", "organization_id", "action", "target_type", "target_id",
  "operation", "http_status", "error_code", "reason_code", "retained_until",
]);
const ROOT_FIELDS = Object.freeze([
  "groupRoles", "loginRoles", "ingestPrivileges", "cleanupPrivileges",
  "readPrivileges", "retentionContract",
]);
const ROLE_FIELDS = Object.freeze([
  "name", "login", "superuser", "createDb", "createRole", "replication",
  "bypassRls", "memberships",
]);

export async function collectUlcLinzM5SecurityLogAccessEvidence(
  { productionDatabaseUrl, cleanupDatabaseUrl, readDatabaseUrl, ingestUsername },
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") throw new Error("ULC M5-F database factory is invalid.");
  const production = parseUlcLinzProductionDatabaseUrl(productionDatabaseUrl);
  const cleanup = parseUlcLinzProductionDatabaseUrl(cleanupDatabaseUrl);
  const read = parseUlcLinzProductionDatabaseUrl(readDatabaseUrl);
  const users = {
    application: roleName(production.user),
    ingest: roleName(ingestUsername),
    cleanup: roleName(cleanup.user),
    read: roleName(read.user),
  };
  if (new Set(Object.values(users)).size !== 4) {
    throw new Error("ULC M5-F production database principals must be distinct.");
  }

  const admin = databaseFactory(productionDatabaseUrl);
  const cleanupConnection = databaseFactory(cleanupDatabaseUrl);
  const readConnection = databaseFactory(readDatabaseUrl);
  try {
    const [cleanupCurrentUser, readCurrentUser] = await Promise.all([
      currentUser(cleanupConnection.client),
      currentUser(readConnection.client),
    ]);
    if (cleanupCurrentUser !== users.cleanup || readCurrentUser !== users.read) {
      throw new Error("ULC M5-F protected database credential identity is invalid.");
    }

    const snapshot = {
      groupRoles: {},
      loginRoles: {},
      ingestPrivileges: await privileges(admin.client, users.ingest, "ingest"),
      cleanupPrivileges: await privileges(admin.client, users.cleanup, "cleanup"),
      readPrivileges: await privileges(admin.client, users.read, "read"),
      retentionContract: await retentionContract(admin.client),
    };
    for (const [key, group] of Object.entries(GROUPS)) {
      snapshot.groupRoles[key] = await role(admin.client, group);
      snapshot.loginRoles[key] = await role(admin.client, users[key]);
    }
    return evaluateUlcLinzM5SecurityLogAccessSnapshot(snapshot);
  } finally {
    await Promise.allSettled([
      admin.client.end(), cleanupConnection.client.end(), readConnection.client.end(),
    ]);
  }
}

export function evaluateUlcLinzM5SecurityLogAccessSnapshot(value) {
  const root = exact(value, ROOT_FIELDS);
  const groups = exact(root.groupRoles, Object.keys(GROUPS));
  const logins = exact(root.loginRoles, Object.keys(GROUPS));

  for (const [key, expected] of Object.entries(GROUPS)) {
    const group = exact(groups[key], ROLE_FIELDS);
    if (group.name !== expected || group.login !== false || elevated(group) || memberships(group).length !== 0) {
      throw new Error("ULC M5-F group role is not least privilege.");
    }
    const login = exact(logins[key], ROLE_FIELDS);
    if (login.login !== true || elevated(login) || !same(memberships(login), [expected])) {
      throw new Error("ULC M5-F login role is not least privilege.");
    }
  }
  if (new Set(Object.values(logins).map((entry) => entry.name)).size !== 3) {
    throw new Error("ULC M5-F login roles must be distinct.");
  }

  exactBooleanShape(root.ingestPrivileges, [
    "tableSelect", "tableDelete", "tableUpdate", "tableTruncate", "allowedColumnInsert",
    "identityColumnInsert", "recordedAtColumnInsert", "sequenceUsage", "sequenceSelect", "cleanupExecute",
  ]);
  const ingest = root.ingestPrivileges;
  if (ingest.tableSelect || ingest.tableDelete || ingest.tableUpdate || ingest.tableTruncate ||
      !ingest.allowedColumnInsert || ingest.identityColumnInsert || ingest.recordedAtColumnInsert ||
      !ingest.sequenceUsage || ingest.sequenceSelect || ingest.cleanupExecute) {
    throw new Error("ULC M5-F ingest privilege boundary is invalid.");
  }

  exactBooleanShape(root.cleanupPrivileges, [
    "tableSelect", "tableInsert", "tableDelete", "tableUpdate", "retainedUntilSelect",
    "eventDataSelect", "sequenceUsage", "cleanupExecute",
  ]);
  const cleanup = root.cleanupPrivileges;
  if (cleanup.tableSelect || cleanup.tableInsert || cleanup.tableDelete || cleanup.tableUpdate ||
      !cleanup.retainedUntilSelect || cleanup.eventDataSelect || cleanup.sequenceUsage || !cleanup.cleanupExecute) {
    throw new Error("ULC M5-F cleanup privilege boundary is invalid.");
  }

  exactBooleanShape(root.readPrivileges, [
    "tableSelect", "tableInsert", "tableDelete", "tableUpdate", "tableTruncate", "sequenceUsage", "cleanupExecute",
  ]);
  const read = root.readPrivileges;
  if (!read.tableSelect || read.tableInsert || read.tableDelete || read.tableUpdate || read.tableTruncate ||
      read.sequenceUsage || read.cleanupExecute) {
    throw new Error("ULC M5-F operational read privilege boundary is invalid.");
  }

  const retention = exact(root.retentionContract, [
    "calendarConstraintVerified", "cleanupFunctionVerified", "publicFunctionExecute", "unexpectedTriggerCount",
  ]);
  for (const field of ["calendarConstraintVerified", "cleanupFunctionVerified", "publicFunctionExecute"]) bool(retention[field]);
  if (!retention.calendarConstraintVerified || !retention.cleanupFunctionVerified ||
      retention.publicFunctionExecute || integer(retention.unexpectedTriggerCount) !== 0) {
    throw new Error("ULC M5-F server retention boundary is invalid.");
  }

  return Object.freeze({
    leastPrivilegeAccessVerified: true,
    protectedOperationalAccessVerified: true,
    providerMinimumRetentionVerified: true,
  });
}

async function role(client, name) {
  const safe = roleName(name);
  const rows = await client.unsafe(
    `SELECT rolname AS name, rolcanlogin AS login, rolsuper AS superuser,
            rolcreatedb AS create_db, rolcreaterole AS create_role,
            rolreplication AS replication, rolbypassrls AS bypass_rls
       FROM pg_catalog.pg_roles WHERE rolname = $1`, [safe],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F database role inventory is incomplete.");
  const membershipRows = await client.unsafe(
    `SELECT parent.rolname AS role_name
       FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles member ON member.oid = m.member
       JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
      WHERE member.rolname = $1 ORDER BY parent.rolname`, [safe],
  );
  if (!Array.isArray(membershipRows)) throw new Error("ULC M5-F role membership inventory is invalid.");
  return {
    name: roleName(rows[0].name), login: bool(rows[0].login), superuser: bool(rows[0].superuser),
    createDb: bool(rows[0].create_db), createRole: bool(rows[0].create_role),
    replication: bool(rows[0].replication), bypassRls: bool(rows[0].bypass_rls),
    memberships: membershipRows.map((row) => roleName(row.role_name)),
  };
}

async function privileges(client, username, kind) {
  const safe = roleName(username);
  const rows = await client.unsafe(
    `SELECT
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'SELECT') AS table_select,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'INSERT') AS table_insert,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'DELETE') AS table_delete,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'UPDATE') AS table_update,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'TRUNCATE') AS table_truncate,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
       has_function_privilege($1, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute`, [safe],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F privilege inventory is invalid.");
  const row = Object.fromEntries(Object.entries(rows[0]).map(([key, val]) => [key, bool(val)]));
  if (kind === "ingest") {
    const allowed = await Promise.all(ALLOWED_INGEST_COLUMNS.map((column) => columnPrivilege(client, safe, column, "INSERT")));
    return {
      tableSelect: row.table_select, tableDelete: row.table_delete, tableUpdate: row.table_update,
      tableTruncate: row.table_truncate, allowedColumnInsert: allowed.every(Boolean),
      identityColumnInsert: await columnPrivilege(client, safe, "id", "INSERT"),
      recordedAtColumnInsert: await columnPrivilege(client, safe, "recorded_at", "INSERT"),
      sequenceUsage: row.sequence_usage, sequenceSelect: row.sequence_select, cleanupExecute: row.cleanup_execute,
    };
  }
  if (kind === "cleanup") {
    return {
      tableSelect: row.table_select, tableInsert: row.table_insert, tableDelete: row.table_delete,
      tableUpdate: row.table_update,
      retainedUntilSelect: await columnPrivilege(client, safe, "retained_until", "SELECT"),
      eventDataSelect: await columnPrivilege(client, safe, "target_id", "SELECT"),
      sequenceUsage: row.sequence_usage, cleanupExecute: row.cleanup_execute,
    };
  }
  return {
    tableSelect: row.table_select, tableInsert: row.table_insert, tableDelete: row.table_delete,
    tableUpdate: row.table_update, tableTruncate: row.table_truncate,
    sequenceUsage: row.sequence_usage, cleanupExecute: row.cleanup_execute,
  };
}

async function columnPrivilege(client, user, column, privilege) {
  const rows = await client.unsafe(
    `SELECT has_column_privilege($1, 'public.ulc_linz_security_event_log', $2, $3) AS allowed`,
    [roleName(user), columnName(column), privilege],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F column privilege inventory is invalid.");
  return bool(rows[0].allowed);
}

async function retentionContract(client) {
  const [constraints, functions, triggers] = await Promise.all([
    client.unsafe(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.ulc_linz_security_event_log'::regclass AND contype = 'c' ORDER BY conname`),
    client.unsafe(`SELECT p.prosecdef AS security_definer, p.pronargs AS argument_count,
      p.proconfig AS config, pg_get_functiondef(p.oid) AS definition,
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
              WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'appbasis_ulc_linz_purge_expired_security_events'`),
    client.unsafe(`SELECT count(*)::integer AS trigger_count FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.ulc_linz_security_event_log'::regclass AND tgisinternal = false`),
  ]);
  if (!Array.isArray(constraints) || !Array.isArray(functions) || functions.length !== 1 ||
      !Array.isArray(triggers) || triggers.length !== 1) throw new Error("ULC M5-F server retention inventory is invalid.");
  const calendarConstraintVerified = constraints.some((row) => {
    const text = String(row.definition ?? "").replaceAll(/\s+/gu, " ");
    return text.includes("retained_until") && text.includes("occurred_at") &&
      (text.includes("'1 year'::interval") || text.includes("'12 mons'::interval"));
  });
  const fn = functions[0];
  const definition = String(fn.definition ?? "").replaceAll(/\s+/gu, " ");
  const config = Array.isArray(fn.config) ? fn.config : [];
  return {
    calendarConstraintVerified,
    cleanupFunctionVerified: fn.security_definer === true && Number(fn.argument_count) === 0 &&
      config.some((entry) => String(entry).replaceAll(" ", "") === "search_path=pg_catalog") &&
      definition.includes("DELETE FROM public.ulc_linz_security_event_log") &&
      definition.includes("retained_until < statement_timestamp()"),
    publicFunctionExecute: bool(fn.public_execute),
    unexpectedTriggerCount: integer(triggers[0].trigger_count),
  };
}

async function currentUser(client) {
  const rows = await client.unsafe("SELECT current_user AS current_user");
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F database credential identity is invalid.");
  return roleName(rows[0].current_user);
}

function elevated(role) {
  return role.superuser || role.createDb || role.createRole || role.replication || role.bypassRls;
}
function memberships(role) {
  if (!Array.isArray(role.memberships)) throw new Error("ULC M5-F role membership evidence is invalid.");
  const values = role.memberships.map(roleName).sort();
  if (new Set(values).size !== values.length) throw new Error("ULC M5-F role membership evidence is invalid.");
  return values;
}
function same(a, b) {
  const left = [...a].sort(); const right = [...b].sort();
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
function exactBooleanShape(value, fields) {
  const record = exact(value, fields); for (const field of fields) bool(record[field]); return record;
}
function exact(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error("ULC M5-F access evidence is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value); const keys = Object.keys(descriptors);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(descriptors, field)) ||
      keys.some((key) => !fields.includes(key)) || Object.values(descriptors).some((descriptor) =>
        !Object.hasOwn(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined)) {
    throw new Error("ULC M5-F access evidence is invalid.");
  }
  return value;
}
function roleName(value) {
  if (typeof value !== "string" || !ROLE_PATTERN.test(value)) throw new Error("ULC M5-F database role name is invalid.");
  return value;
}
function columnName(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("ULC M5-F database column name is invalid.");
  return value;
}
function bool(value) {
  if (typeof value !== "boolean") throw new Error("ULC M5-F boolean evidence is invalid.");
  return value;
}
function integer(value) {
  const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error("ULC M5-F integer evidence is invalid.");
  return number;
}
