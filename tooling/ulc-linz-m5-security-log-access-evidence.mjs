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
  "groupRoles", "loginRoles", "applicationPrivileges", "ingestPrivileges", "cleanupPrivileges",
  "readPrivileges", "aclBoundary", "retentionContract",
]);
const ROLE_FIELDS = Object.freeze([
  "name", "login", "superuser", "createDb", "createRole", "replication",
  "bypassRls", "membershipAdminOption", "memberships",
]);
const ACL_BOUNDARY_FIELDS = Object.freeze([
  "missingExpectedGrantCount", "unexpectedProtectedGrantCount", "protectedGrantOptionCount",
  "protectedOwnerCount", "unexpectedGroupMemberCount", "groupMembershipAdminOptionCount",
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
    const [applicationCurrentUser, cleanupCurrentUser, readCurrentUser] = await Promise.all([
      currentUser(admin.client),
      currentUser(cleanupConnection.client),
      currentUser(readConnection.client),
    ]);
    if (
      applicationCurrentUser !== users.application ||
      cleanupCurrentUser !== users.cleanup ||
      readCurrentUser !== users.read
    ) {
      throw new Error("ULC M5-F protected database credential identity is invalid.");
    }

    const snapshot = {
      groupRoles: {},
      loginRoles: {},
      applicationPrivileges: await applicationPrivileges(admin.client, users.application),
      ingestPrivileges: await privileges(admin.client, users.ingest, "ingest"),
      cleanupPrivileges: await privileges(admin.client, users.cleanup, "cleanup"),
      readPrivileges: await privileges(admin.client, users.read, "read"),
      aclBoundary: await aclBoundary(admin.client, users),
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
    if (group.name !== expected || group.login !== false || elevated(group) ||
        group.membershipAdminOption !== false || memberships(group).length !== 0) {
      throw new Error("ULC M5-F group role is not least privilege.");
    }
    const login = exact(logins[key], ROLE_FIELDS);
    if (login.login !== true || elevated(login) || login.membershipAdminOption !== false ||
        !same(memberships(login), [expected])) {
      throw new Error("ULC M5-F login role is not least privilege.");
    }
  }
  if (new Set(Object.values(logins).map((entry) => entry.name)).size !== 3) {
    throw new Error("ULC M5-F login roles must be distinct.");
  }

  exactBooleanShape(root.applicationPrivileges, [
    "tableSelect", "tableInsert", "tableDelete", "tableUpdate", "tableTruncate",
    "anyColumnSelect", "anyColumnInsert", "anyColumnUpdate", "sequenceUsage", "sequenceSelect", "sequenceUpdate",
    "cleanupExecute",
  ]);
  const application = root.applicationPrivileges;
  if (
    application.tableSelect || application.tableInsert || application.tableDelete ||
    application.tableUpdate || application.tableTruncate || application.anyColumnSelect ||
    application.anyColumnInsert || application.anyColumnUpdate || application.sequenceUsage ||
    application.sequenceSelect || application.sequenceUpdate || application.cleanupExecute
  ) {
    throw new Error("ULC M5-F application role can access the security log.");
  }

  exactBooleanShape(root.ingestPrivileges, [
    "tableSelect", "tableDelete", "tableUpdate", "tableTruncate", "anyColumnSelect", "anyColumnUpdate",
    "allowedColumnInsert", "forbiddenColumnInsert", "identityColumnInsert", "recordedAtColumnInsert",
    "sequenceUsage", "sequenceSelect", "sequenceUpdate", "cleanupExecute",
  ]);
  const ingest = root.ingestPrivileges;
  if (ingest.tableSelect || ingest.tableDelete || ingest.tableUpdate || ingest.tableTruncate ||
      ingest.anyColumnSelect || ingest.anyColumnUpdate || !ingest.allowedColumnInsert ||
      ingest.forbiddenColumnInsert || ingest.identityColumnInsert || ingest.recordedAtColumnInsert ||
      !ingest.sequenceUsage || ingest.sequenceSelect || ingest.sequenceUpdate || ingest.cleanupExecute) {
    throw new Error("ULC M5-F ingest privilege boundary is invalid.");
  }

  exactBooleanShape(root.cleanupPrivileges, [
    "tableSelect", "tableInsert", "tableDelete", "tableUpdate", "tableTruncate", "anyColumnInsert", "anyColumnUpdate",
    "retainedUntilSelect", "forbiddenColumnSelect", "eventDataSelect", "sequenceUsage", "sequenceSelect", "sequenceUpdate",
    "cleanupExecute",
  ]);
  const cleanup = root.cleanupPrivileges;
  if (cleanup.tableSelect || cleanup.tableInsert || cleanup.tableDelete || cleanup.tableUpdate || cleanup.tableTruncate ||
      cleanup.anyColumnInsert || cleanup.anyColumnUpdate || !cleanup.retainedUntilSelect ||
      cleanup.forbiddenColumnSelect || cleanup.eventDataSelect || cleanup.sequenceUsage || cleanup.sequenceSelect ||
      cleanup.sequenceUpdate || !cleanup.cleanupExecute) {
    throw new Error("ULC M5-F cleanup privilege boundary is invalid.");
  }

  exactBooleanShape(root.readPrivileges, [
    "tableSelect", "tableInsert", "tableDelete", "tableUpdate", "tableTruncate",
    "anyColumnInsert", "anyColumnUpdate", "sequenceUsage", "sequenceSelect", "sequenceUpdate", "cleanupExecute",
  ]);
  const read = root.readPrivileges;
  if (!read.tableSelect || read.tableInsert || read.tableDelete || read.tableUpdate || read.tableTruncate ||
      read.anyColumnInsert || read.anyColumnUpdate || read.sequenceUsage || read.sequenceSelect || read.sequenceUpdate ||
      read.cleanupExecute) {
    throw new Error("ULC M5-F operational read privilege boundary is invalid.");
  }

  const acl = exact(root.aclBoundary, ACL_BOUNDARY_FIELDS);
  if (ACL_BOUNDARY_FIELDS.some((field) => integer(acl[field]) !== 0)) {
    throw new Error("ULC M5-F ACL delegation boundary is invalid.");
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
    `SELECT parent.rolname AS role_name, m.admin_option AS admin_option
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
    membershipAdminOption: membershipRows.some((row) => bool(row.admin_option)),
    memberships: membershipRows.map((row) => roleName(row.role_name)),
  };
}

async function applicationPrivileges(client, username) {
  const safe = roleName(username);
  const rows = await client.unsafe(
    `SELECT
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'SELECT') AS table_select,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'INSERT') AS table_insert,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'DELETE') AS table_delete,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'UPDATE') AS table_update,
       has_table_privilege($1, 'public.ulc_linz_security_event_log', 'TRUNCATE') AS table_truncate,
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'SELECT') AS any_column_select,
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'INSERT') AS any_column_insert,
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'UPDATE') AS any_column_update,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'UPDATE') AS sequence_update,
       has_function_privilege($1, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute`,
    [safe],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F application privilege inventory is invalid.");
  return {
    tableSelect: bool(rows[0].table_select),
    tableInsert: bool(rows[0].table_insert),
    tableDelete: bool(rows[0].table_delete),
    tableUpdate: bool(rows[0].table_update),
    tableTruncate: bool(rows[0].table_truncate),
    anyColumnSelect: bool(rows[0].any_column_select),
    anyColumnInsert: bool(rows[0].any_column_insert),
    anyColumnUpdate: bool(rows[0].any_column_update),
    sequenceUsage: bool(rows[0].sequence_usage),
    sequenceSelect: bool(rows[0].sequence_select),
    sequenceUpdate: bool(rows[0].sequence_update),
    cleanupExecute: bool(rows[0].cleanup_execute),
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
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'SELECT') AS any_column_select,
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'INSERT') AS any_column_insert,
       has_any_column_privilege($1, 'public.ulc_linz_security_event_log', 'UPDATE') AS any_column_update,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS sequence_usage,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'SELECT') AS sequence_select,
       has_sequence_privilege($1, 'public.ulc_linz_security_event_log_id_seq', 'UPDATE') AS sequence_update,
       has_function_privilege($1, 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute`, [safe],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F privilege inventory is invalid.");
  const row = Object.fromEntries(Object.entries(rows[0]).map(([key, val]) => [key, bool(val)]));
  if (kind === "ingest") {
    const allowed = await Promise.all(ALLOWED_INGEST_COLUMNS.map((column) => columnPrivilege(client, safe, column, "INSERT")));
    return {
      tableSelect: row.table_select, tableDelete: row.table_delete, tableUpdate: row.table_update,
      tableTruncate: row.table_truncate, anyColumnSelect: row.any_column_select,
      anyColumnUpdate: row.any_column_update, allowedColumnInsert: allowed.every(Boolean),
      forbiddenColumnInsert: await forbiddenColumnPrivilege(client, safe, "INSERT", ALLOWED_INGEST_COLUMNS),
      identityColumnInsert: await columnPrivilege(client, safe, "id", "INSERT"),
      recordedAtColumnInsert: await columnPrivilege(client, safe, "recorded_at", "INSERT"),
      sequenceUsage: row.sequence_usage, sequenceSelect: row.sequence_select, sequenceUpdate: row.sequence_update,
      cleanupExecute: row.cleanup_execute,
    };
  }
  if (kind === "cleanup") {
    return {
      tableSelect: row.table_select, tableInsert: row.table_insert, tableDelete: row.table_delete,
      tableUpdate: row.table_update, tableTruncate: row.table_truncate,
      anyColumnInsert: row.any_column_insert, anyColumnUpdate: row.any_column_update,
      retainedUntilSelect: await columnPrivilege(client, safe, "retained_until", "SELECT"),
      forbiddenColumnSelect: await forbiddenColumnPrivilege(client, safe, "SELECT", ["retained_until"]),
      eventDataSelect: await columnPrivilege(client, safe, "target_id", "SELECT"),
      sequenceUsage: row.sequence_usage, sequenceSelect: row.sequence_select, sequenceUpdate: row.sequence_update,
      cleanupExecute: row.cleanup_execute,
    };
  }
  return {
    tableSelect: row.table_select, tableInsert: row.table_insert, tableDelete: row.table_delete,
    tableUpdate: row.table_update, tableTruncate: row.table_truncate,
    anyColumnInsert: row.any_column_insert, anyColumnUpdate: row.any_column_update,
    sequenceUsage: row.sequence_usage, sequenceSelect: row.sequence_select, sequenceUpdate: row.sequence_update,
    cleanupExecute: row.cleanup_execute,
  };
}

async function aclBoundary(client, users) {
  const protectedRoles = [
    ...Object.values(users).map(roleName),
    ...Object.values(GROUPS).map(roleName),
  ];
  if (new Set(protectedRoles).size !== protectedRoles.length) {
    throw new Error("ULC M5-F protected ACL role inventory is invalid.");
  }
  const [grantRows, ownerRows, groupMemberRows] = await Promise.all([
    client.unsafe(
      `WITH acl_rows AS (
         SELECT 'table'::text AS object_kind, relation.relname::text AS object_name,
                NULL::text AS column_name, relation.relowner AS owner_oid,
                acl.grantee, acl.privilege_type, acl.is_grantable
           FROM pg_catalog.pg_class relation
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
           ) acl
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'ulc_linz_security_event_log'
         UNION ALL
         SELECT 'sequence'::text, relation.relname::text, NULL::text, relation.relowner,
                acl.grantee, acl.privilege_type, acl.is_grantable
           FROM pg_catalog.pg_class relation
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(relation.relacl, pg_catalog.acldefault('S', relation.relowner))
           ) acl
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'ulc_linz_security_event_log_id_seq'
         UNION ALL
         SELECT 'column'::text, relation.relname::text, attribute.attname::text, relation.relowner,
                acl.grantee, acl.privilege_type, acl.is_grantable
           FROM pg_catalog.pg_attribute attribute
           JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(attribute.attacl, ARRAY[]::aclitem[])
           ) acl
          WHERE namespace.nspname = 'public'
            AND relation.relname = 'ulc_linz_security_event_log'
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
         UNION ALL
         SELECT 'function'::text, procedure.proname::text, NULL::text, procedure.proowner,
                acl.grantee, acl.privilege_type, acl.is_grantable
           FROM pg_catalog.pg_proc procedure
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
           CROSS JOIN LATERAL pg_catalog.aclexplode(
             COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
           ) acl
          WHERE namespace.nspname = 'public'
            AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
            AND procedure.pronargs = 0
       )
       SELECT object_kind, object_name, column_name,
              CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(grantee) END AS grantee,
              privilege_type, is_grantable
         FROM acl_rows
        WHERE grantee = 0 OR grantee <> owner_oid
        ORDER BY object_kind, object_name, column_name, grantee, privilege_type`,
    ),
    client.unsafe(
      `WITH protected_objects AS (
         SELECT relation.relowner AS owner_oid
           FROM pg_catalog.pg_class relation
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relname IN ('ulc_linz_security_event_log', 'ulc_linz_security_event_log_id_seq')
         UNION ALL
         SELECT procedure.proowner AS owner_oid
           FROM pg_catalog.pg_proc procedure
           JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
          WHERE namespace.nspname = 'public'
            AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
            AND procedure.pronargs = 0
       )
       SELECT count(*)::integer AS owner_count
         FROM protected_objects object
         JOIN pg_catalog.pg_roles owner ON owner.oid = object.owner_oid
        WHERE owner.rolname = ANY($1::text[])`,
      [protectedRoles],
    ),
    client.unsafe(
      `SELECT parent.rolname AS group_role, member.rolname AS member_role,
              membership.admin_option AS admin_option
         FROM pg_catalog.pg_auth_members membership
         JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
         JOIN pg_catalog.pg_roles member ON member.oid = membership.member
        WHERE parent.rolname = ANY($1::text[])
        ORDER BY parent.rolname, member.rolname`,
      [Object.values(GROUPS)],
    ),
  ]);
  if (!Array.isArray(grantRows) || !Array.isArray(ownerRows) || ownerRows.length !== 1 ||
      !Array.isArray(groupMemberRows)) {
    throw new Error("ULC M5-F ACL inventory is invalid.");
  }

  const expected = expectedGrantKeys();
  const actual = new Set();
  let unexpectedProtectedGrantCount = 0;
  let protectedGrantOptionCount = 0;
  for (const row of grantRows) {
    const key = grantKey(row.object_kind, row.object_name, row.column_name, row.grantee, row.privilege_type);
    if (actual.has(key)) throw new Error("ULC M5-F ACL inventory contains duplicate grants.");
    actual.add(key);
    if (!expected.has(key)) unexpectedProtectedGrantCount += 1;
    if (bool(row.is_grantable)) protectedGrantOptionCount += 1;
  }
  let missingExpectedGrantCount = 0;
  for (const key of expected) {
    if (!actual.has(key)) missingExpectedGrantCount += 1;
  }

  const expectedMembers = new Map(Object.entries(GROUPS).map(([key, group]) => [group, users[key]]));
  const seenGroups = new Set();
  let unexpectedGroupMemberCount = 0;
  let groupMembershipAdminOptionCount = 0;
  for (const row of groupMemberRows) {
    const group = roleName(row.group_role);
    const member = roleName(row.member_role);
    const expectedMember = expectedMembers.get(group);
    if (expectedMember === undefined || member !== expectedMember || seenGroups.has(group)) {
      unexpectedGroupMemberCount += 1;
    }
    seenGroups.add(group);
    if (bool(row.admin_option)) groupMembershipAdminOptionCount += 1;
  }
  for (const group of expectedMembers.keys()) {
    if (!seenGroups.has(group)) unexpectedGroupMemberCount += 1;
  }

  return {
    missingExpectedGrantCount,
    unexpectedProtectedGrantCount,
    protectedGrantOptionCount,
    protectedOwnerCount: integer(ownerRows[0].owner_count),
    unexpectedGroupMemberCount,
    groupMembershipAdminOptionCount,
  };
}

function expectedGrantKeys() {
  const keys = new Set();
  for (const column of ALLOWED_INGEST_COLUMNS) {
    keys.add(grantKey("column", "ulc_linz_security_event_log", column, GROUPS.ingest, "INSERT"));
  }
  keys.add(grantKey("sequence", "ulc_linz_security_event_log_id_seq", null, GROUPS.ingest, "USAGE"));
  keys.add(grantKey("column", "ulc_linz_security_event_log", "retained_until", GROUPS.cleanup, "SELECT"));
  keys.add(grantKey("function", "appbasis_ulc_linz_purge_expired_security_events", null, GROUPS.cleanup, "EXECUTE"));
  keys.add(grantKey("table", "ulc_linz_security_event_log", null, GROUPS.read, "SELECT"));
  return keys;
}

function grantKey(objectKind, objectName, column, grantee, privilege) {
  const kind = String(objectKind ?? "");
  if (!["table", "column", "sequence", "function"].includes(kind)) {
    throw new Error("ULC M5-F ACL object kind is invalid.");
  }
  const object = roleName(objectName);
  const columnNameOrEmpty = column === null || column === undefined ? "" : columnName(column);
  const principal = roleName(grantee);
  const right = String(privilege ?? "");
  if (!/^[A-Z][A-Z_ ]{0,31}$/.test(right)) throw new Error("ULC M5-F ACL privilege is invalid.");
  return `${kind}:${object}:${columnNameOrEmpty}:${principal}:${right}`;
}

async function columnPrivilege(client, user, column, privilege) {
  const rows = await client.unsafe(
    `SELECT has_column_privilege($1, 'public.ulc_linz_security_event_log', $2, $3) AS allowed`,
    [roleName(user), columnName(column), privilege],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F column privilege inventory is invalid.");
  return bool(rows[0].allowed);
}

async function forbiddenColumnPrivilege(client, user, privilege, allowedColumns) {
  const safeUser = roleName(user);
  const safePrivilege = privilege === "SELECT" || privilege === "INSERT" || privilege === "UPDATE" ? privilege : null;
  if (safePrivilege === null || !Array.isArray(allowedColumns) || allowedColumns.length < 1) {
    throw new Error("ULC M5-F forbidden column privilege request is invalid.");
  }
  const allowed = allowedColumns.map(columnName);
  const rows = await client.unsafe(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute attribute
       WHERE attribute.attrelid = 'public.ulc_linz_security_event_log'::regclass
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND NOT (attribute.attname = ANY($2::text[]))
         AND has_column_privilege($1, 'public.ulc_linz_security_event_log', attribute.attname, $3)
     ) AS forbidden`,
    [safeUser, allowed, safePrivilege],
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("ULC M5-F forbidden column privilege inventory is invalid.");
  return bool(rows[0].forbidden);
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
