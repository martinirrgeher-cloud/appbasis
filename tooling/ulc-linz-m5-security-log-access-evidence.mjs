import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const GROUPS = Object.freeze({
  ingest: "ulc_linz_security_event_ingest",
  cleanup: "ulc_linz_security_event_cleanup",
  read: "ulc_linz_security_event_read",
});
const GROUP_NAMES = Object.freeze(Object.values(GROUPS));
const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const SNAPSHOT_FIELDS = Object.freeze([
  "groupRoles",
  "loginRoles",
  "ingestPrivileges",
  "cleanupPrivileges",
  "readPrivileges",
  "retentionContract",
]);
const ROLE_FIELDS = Object.freeze([
  "name",
  "login",
  "superuser",
  "createDb",
  "createRole",
  "replication",
  "bypassRls",
  "memberships",
]);
const INGEST_PRIVILEGE_FIELDS = Object.freeze([
  "tableSelect",
  "tableDelete",
  "tableUpdate",
  "tableTruncate",
  "allowedColumnInsert",
  "identityColumnInsert",
  "recordedAtColumnInsert",
  "sequenceUsage",
  "sequenceSelect",
  "cleanupExecute",
]);
const CLEANUP_PRIVILEGE_FIELDS = Object.freeze([
  "tableSelect",
  "tableInsert",
  "tableDelete",
  "tableUpdate",
  "retainedUntilSelect",
  "eventDataSelect",
  "sequenceUsage",
  "cleanupExecute",
]);
const READ_PRIVILEGE_FIELDS = Object.freeze([
  "tableSelect",
  "tableInsert",
  "tableDelete",
  "tableUpdate",
  "tableTruncate",
  "sequenceUsage",
  "cleanupExecute",
]);
const RETENTION_FIELDS = Object.freeze([
  "calendarConstraintVerified",
  "cleanupFunctionVerified",
  "publicFunctionExecute",
  "unexpectedTriggerCount",
]);
const ALLOWED_INGEST_COLUMNS = Object.freeze([
  "schema_version",
  "app_id",
  "category",
  "event_type",
  "occurred_at",
  "actor_principal_id",
  "organization_id",
  "action",
  "target_type",
  "target_id",
  "operation",
  "http_status",
  "error_code",
  "reason_code",
  "retained_until",
]);

export async function collectUlcLinzM5SecurityLogAccessEvidence(
  {
    productionDatabaseUrl,
    cleanupDatabaseUrl,
    readDatabaseUrl,
    ingestUsername,
  },
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof databaseFactory !== "function") {
    throw new Error("ULC M5-F database factory is invalid.");
  }
  const production = parseUlcLinzProductionDatabaseUrl(productionDatabaseUrl);
  const cleanup = parseUlcLinzProductionDatabaseUrl(cleanupDatabaseUrl);
  const read = parseUlcLinzProductionDatabaseUrl(readDatabaseUrl);
  const ingestUser = requiredRoleName(ingestUsername);
  const cleanupUser = requiredRoleName(cleanup.user);
  const readUser = requiredRoleName(read.user);
  const applicationUser = requiredRoleName(production.user);
  if (new Set([applicationUser, ingestUser, cleanupUser, readUser]).size !== 4) {
    throw new Error("ULC M5-F production database principals must be distinct.");
  }

  const adminDatabase = databaseFactory(productionDatabaseUrl);
  const cleanupDatabase = databaseFactory(cleanupDatabaseUrl);
  const readDatabase = databaseFactory(readDatabaseUrl);
  try {
    const [cleanupCurrentUser, readCurrentUser] = await Promise.all([
      currentUser(cleanupDatabase.client),
      currentUser(readDatabase.client),
    ]);
    if (cleanupCurrentUser !== cleanupUser || readCurrentUser !== readUser) {
      throw new Error("ULC M5-F protected database credential identity is invalid.");
    }

    const groupRoles = {};
    for (const [key, roleName] of Object.entries(GROUPS)) {
      groupRoles[key] = await roleSnapshot(adminDatabase.client, roleName);
    }
    const loginRoles = {
      ingest: await roleSnapshot(adminDatabase.client, ingestUser),
      cleanup: await roleSnapshot(adminDatabase.client, cleanupUser),
      read: await roleSnapshot(adminDatabase.client, readUser),
    };

    const snapshot = {
      groupRoles,
      loginRoles,
      ingestPrivileges: await ingestPrivilegeSnapshot(
        adminDatabase.client,
        ingestUser,
      ),
      cleanupPrivileges: await cleanupPrivilegeSnapshot(
        adminDatabase.client,
        cleanupUser,
      ),
      readPrivileges: await readPrivilegeSnapshot(adminDatabase.client, readUser),
      retentionContract: await retentionContractSnapshot(adminDatabase.client),
    };
    return evaluateUlcLinzM5SecurityLogAccessSnapshot(snapshot);
  } finally {
    await Promise.allSettled([
      adminDatabase.client.end(),
      cleanupDatabase.client.end(),
      readDatabase.client.end(),
    ]);
  }
}

export function evaluateUlcLinzM5SecurityLogAccessSnapshot(snapshot) {
  const root = exactRecord(snapshot, SNAPSHOT_FIELDS);
  const groupRoles = exactRecord(root.groupRoles, Object.keys(GROUPS));
  const loginRoles = exactRecord(root.loginRoles, Object.keys(GROUPS));

  for (const [key, expectedName] of Object.entries(GROUPS)) {
    const group = exactRecord(groupRoles[key], ROLE_FIELDS);
    if (
      group.name !== expectedName ||
      group.login !== false ||
      hasElevatedRoleAttribute(group) ||
      exactMemberships(group.memberships).length !== 0
    ) {
      throw new Error("ULC M5-F group role is not least privilege.");
    }
  }

  for (const key of Object.keys(GROUPS)) {
    const role = exactRecord(loginRoles[key], ROLE_FIELDS);
    requiredRoleName(role.name);
    if (
      role.login !== true ||
      hasElevatedRoleAttribute(role) ||
      !sameStrings(exactMemberships(role.memberships), [GROUPS[key]])
    ) {
      throw new Error("ULC M5-F login role is not least privilege.");
    }
  }
  if (
    new Set(Object.values(loginRoles).map((role) => role.name)).size !==
    Object.keys(GROUPS).length
  ) {
    throw new Error("ULC M5-F login roles must be distinct.");
  }

  const ingest = exactRecord(root.ingestPrivileges, INGEST_PRIVILEGE_FIELDS);
  if (
    ingest.tableSelect !== false ||
    ingest.tableDelete !== false ||
    ingest.tableUpdate !== false ||
    ingest.tableTruncate !== false ||
    ingest.allowedColumnInsert !== true ||
    ingest.identityColumnInsert !== false ||
    ingest.recordedAtColumnInsert !== false ||
    ingest.sequenceUsage !== true ||
    ingest.sequenceSelect !== false ||
    ingest.cleanupExecute !== false
  ) {
    throw new Error("ULC M5-F ingest privilege boundary is invalid.");
  }

  const cleanup = exactRecord(root.cleanupPrivileges, CLEANUP_PRIVILEGE_FIELDS);
  if (
    cleanup.tableSelect !== false ||
    cleanup.tableInsert !== false ||
    cleanup.tableDelete !== false ||
    cleanup.tableUpdate !== false ||
    cleanup.retainedUntilSelect !== true ||
    cleanup.eventDataSelect !== false ||
    cleanup.sequenceUsage !== false ||
    cleanup.cleanupExecute !== true
  ) {
    throw new Error("ULC M5-F cleanup privilege boundary is invalid.");
  }

  const read = exactRecord(root.readPrivileges, READ_PRIVILEGE_FIELDS);
  if (
    read.tableSelect !== true ||
    read.tableInsert !== false ||
    read.tableDelete !== false ||
    read.tableUpdate !== false ||
    read.tableTruncate !== false ||
    read.sequenceUsage !== false ||
    read.cleanupExecute !== false
  ) {
    throw new Error("ULC M5-F operational read privilege boundary is invalid.");
  }

  const retention = exactRecord(root.retentionContract, RETENTION_FIELDS);
  if (
    retention.calendarConstraintVerified !== true ||
    retention.cleanupFunctionVerified !== true ||
    retention.publicFunctionExecute !== false ||
    retention.unexpectedTriggerCount !== 0
  ) {
    throw new Error("ULC M5-F server retention boundary is invalid.");
  }

  return Object.freeze({
    leastPrivilegeAccessVerified: true,
    protectedOperationalAccessVerified: true,
    providerMinimumRetentionVerified: true,
  });
}

async function currentUser(client) {
  const rows = await client.unsafe("SELECT current_user AS current_user");
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    typeof rows[0]?.current_user !== "string"
  ) {
    throw new Error("ULC M5-F database credential identity is invalid.");
  }
  return requiredRoleName(rows[0].current_user);
}

async function roleSnapshot(client, roleName) {
  const safeRoleName = requiredRoleName(roleName);
  const rows = await client.unsafe(
    `SELECT rolname AS name, rolcanlogin AS login, rolsuper AS superuser,
            rolcreatedb AS create_db, rolcreaterole AS create_role,
            rolreplication AS replication, rolbypassrls AS bypass_rls
       FROM pg_catalog.pg_roles
      WHERE rolname = $1`,
    [safeRoleName],
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F database role inventory is incomplete.");
  }
  const memberships = await membershipSnapshot(client, safeRoleName);
  const row = rows[0];
  return {
    name: requiredRoleName(row.name),
    login: requiredBoolean(row.login),
    superuser: requiredBoolean(row.superuser),
    createDb: requiredBoolean(row.create_db),
    createRole: requiredBoolean(row.create_role),
    replication: requiredBoolean(row.replication),
    bypassRls: requiredBoolean(row.bypass_rls),
    memberships,
  };
}

async function membershipSnapshot(client, roleName) {
  const rows = await client.unsafe(
    `SELECT parent.rolname AS role_name
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
       JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
      WHERE member.rolname = $1
      ORDER BY parent.rolname`,
    [requiredRoleName(roleName)],
  );
  if (!Array.isArray(rows)) {
    throw new Error("ULC M5-F role membership inventory is invalid.");
  }
  return rows.map((row) => requiredRoleName(row?.role_name));
}

async function ingestPrivilegeSnapshot(client, username) {
  const row = await privilegeRow(client, username);
  const allowedColumnInsert = await everyColumnPrivilege(
    client,
    username,
    ALLOWED_INGEST_COLUMNS,
    "INSERT",
  );
  return {
    tableSelect: row.table_select,
    tableDelete: row.table_delete,
    tableUpdate: row.table_update,
    tableTruncate: row.table_truncate,
    allowedColumnInsert,
    identityColumnInsert: await columnPrivilege(client, username, "id", "INSERT"),
    recordedAtColumnInsert: await columnPrivilege(
      client,
      username,
      "recorded_at",
      "INSERT",
    ),
    sequenceUsage: row.sequence_usage,
    sequenceSelect: row.sequence_select,
    cleanupExecute: row.cleanup_execute,
  };
}

async function cleanupPrivilegeSnapshot(client, username) {
  const row = await privilegeRow(client, username);
  return {
    tableSelect: row.table_select,
    tableInsert: row.table_insert,
    tableDelete: row.table_delete,
    tableUpdate: row.table_update,
    retainedUntilSelect: await columnPrivilege(
      client,
      username,
      "retained_until",
      "SELECT",
    ),
    eventDataSelect: await columnPrivilege(client, username, "target_id", "SELECT"),
    sequenceUsage: row.sequence_usage,
    cleanupExecute: row.cleanup_execute,
  };
}

async function readPrivilegeSnapshot(client, username) {
  const row = await privilegeRow(client, username);
  return {
    tableSelect: row.table_select,
    tableInsert: row.table_insert,
    tableDelete: row.table_delete,
    tableUpdate: row.table_update,
    tableTruncate: row.table_truncate,
    sequenceUsage: row.sequence_usage,
    cleanupExecute: row.cleanup_execute,
  };
}

async function privilegeRow(client, username) {
  const rows = await client.unsafe(
    `SELECT
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'SELECT') AS table_select,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'INSERT') AS table_insert,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'DELETE') AS table_delete,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'UPDATE') AS table_update,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'TRUNCATE') AS table_truncate,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
       has_function_privilege($1, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute`,
    [requiredRoleName(username)],
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F privilege inventory is invalid.");
  }
  return booleanRecord(rows[0]);
}

async function everyColumnPrivilege(client, username, columns, privilege) {
  const values = await Promise.all(
    columns.map((column) => columnPrivilege(client, username, column, privilege)),
  );
  return values.every((value) => value === true);
}

async function columnPrivilege(client, username, column, privilege) {
  const rows = await client.unsafe(
    `SELECT has_column_privilege(
       $1,
       'public.ulc_linz_security_event_log',
       $2,
       $3
     ) AS allowed`,
    [requiredRoleName(username), requiredColumnName(column), privilege],
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5-F column privilege inventory is invalid.");
  }
  return requiredBoolean(rows[0]?.allowed);
}

async function retentionContractSnapshot(client) {
  const [constraintRows, functionRows, triggerRows] = await Promise.all([
    client.unsafe(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.ulc_linz_security_event_log'::regclass
        AND contype = 'c'
      ORDER BY conname
    `),
    client.unsafe(`
      SELECT p.prosecdef AS security_definer,
             p.pronargs AS argument_count,
             p.proconfig AS config,
             pg_get_functiondef(p.oid) AS definition,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'appbasis_ulc_linz_purge_expired_security_events'
    `),
    client.unsafe(`
      SELECT count(*)::integer AS trigger_count
      FROM pg_catalog.pg_trigger
      WHERE tgrelid = 'public.ulc_linz_security_event_log'::regclass
        AND tgisinternal = false
    `),
  ]);
  if (
    !Array.isArray(constraintRows) ||
    !Array.isArray(functionRows) ||
    functionRows.length !== 1 ||
    !Array.isArray(triggerRows) ||
    triggerRows.length !== 1
  ) {
    throw new Error("ULC M5-F server retention inventory is invalid.");
  }
  const calendarConstraintVerified = constraintRows.some((row) => {
    const definition = String(row?.definition ?? "").replaceAll(/\s+/gu, " ");
    return (
      definition.includes("retained_until") &&
      definition.includes("occurred_at") &&
      (definition.includes("'1 year'::interval") ||
        definition.includes("'12 mons'::interval"))
    );
  });
  const fn = functionRows[0];
  const definition = String(fn?.definition ?? "").replaceAll(/\s+/gu, " ");
  const config = Array.isArray(fn?.config) ? fn.config : [];
  const cleanupFunctionVerified =
    fn?.security_definer === true &&
    Number(fn?.argument_count) === 0 &&
    config.some((value) => String(value).replaceAll(" ", "") === "search_path=pg_catalog") &&
    definition.includes("DELETE FROM public.ulc_linz_security_event_log") &&
    definition.includes("retained_until < statement_timestamp()");
  return {
    calendarConstraintVerified,
    cleanupFunctionVerified,
    publicFunctionExecute: requiredBoolean(fn?.public_execute),
    unexpectedTriggerCount: requiredNonNegativeInteger(triggerRows[0]?.trigger_count),
  };
}

function hasElevatedRoleAttribute(role) {
  return (
    role.superuser === true ||
    role.createDb === true ||
    role.createRole === true ||
    role.replication === true ||
    role.bypassRls === true
  );
}

function exactMemberships(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("ULC M5-F role membership evidence is invalid.");
  }
  const normalized = value.map(requiredRoleName).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("ULC M5-F role membership evidence is invalid.");
  }
  return normalized;
}

function sameStrings(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactRecord(value, fields) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error("ULC M5-F access evidence is invalid.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((key) => !fields.includes(key)) ||
    Object.values(descriptors).some(
      (descriptor) =>
        !Object.hasOwn(descriptor, "value") ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined,
    )
  ) {
    throw new Error("ULC M5-F access evidence is invalid.");
  }
  return value;
}

function booleanRecord(value) {
  if (value === null || typeof value !== "object") {
    throw new Error("ULC M5-F privilege inventory is invalid.");
  }
  for (const field of Object.values(value)) requiredBoolean(field);
  return value;
}

function requiredRoleName(value) {
  if (typeof value !== "string" || !ROLE_PATTERN.test(value)) {
    throw new Error("ULC M5-F database role name is invalid.");
  }
  return value;
}

function requiredColumnName(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error("ULC M5-F database column name is invalid.");
  }
  return value;
}

function requiredBoolean(value) {
  if (typeof value !== "boolean") {
    throw new Error("ULC M5-F boolean evidence is invalid.");
  }
  return value;
}

function requiredNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("ULC M5-F integer evidence is invalid.");
  }
  return number;
}
