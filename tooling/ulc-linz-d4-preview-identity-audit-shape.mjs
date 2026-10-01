// Read-only, shared identity schema-v3 inventory. Both the dispatcher and the
// migration use the same strict shape check so drift cannot bypass deploy.
const COLUMNS = Object.freeze([
  "provisioning_owner",
  "actor_principal_id",
  "reason",
]);
const CONSTRAINT =
  "appbasis_identity_operation_provisioning_audit_shape_check";

const EXPECTED_NULL_BRANCH =
  "provisioning_ownerisnullandactor_principal_idisnullandreasonisnull";
const EXPECTED_AUDITED_BRANCH = [
  "kind='provision'",
  "provisioning_ownerisnotnull",
  "actor_principal_idisnotnull",
  "reasonisnotnull",
  "char_lengthprovisioning_owner>=1",
  "char_lengthprovisioning_owner<=120",
  "provisioning_owner=btrimprovisioning_owner",
  "char_lengthactor_principal_id>=1",
  "char_lengthactor_principal_id<=200",
  "actor_principal_id=btrimactor_principal_id",
  "char_lengthreason>=1",
  "char_lengthreason<=500",
  "reason=btrimreason",
].join("and");

export async function readUlcPreviewIdentityAuditShape(client) {
  const columns = await client.unsafe(
    `SELECT attribute.attname AS column_name,
            pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
            attribute.attnotnull AS not_null,
            attribute.atthasdef AS has_default,
            attribute.attgenerated AS generated,
            attribute.attidentity AS identity
       FROM pg_catalog.pg_attribute AS attribute
       JOIN pg_catalog.pg_class AS relation
         ON relation.oid = attribute.attrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'appbasis_identity_operation'
        AND attribute.attname IN ('kind', 'provisioning_owner', 'actor_principal_id', 'reason')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped`,
  );
  const constraints = await client.unsafe(
    `SELECT pg_catalog.pg_get_constraintdef(guard.oid) AS definition,
            guard.convalidated AS validated
       FROM pg_catalog.pg_constraint AS guard
       JOIN pg_catalog.pg_class AS relation
         ON relation.oid = guard.conrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'appbasis_identity_operation'
        AND guard.conname = '${CONSTRAINT}'
        AND guard.contype = 'c'`,
  );
  if (!Array.isArray(columns) || !Array.isArray(constraints)) {
    throw new Error("ULC D4 identity provisioning audit inventory is unavailable.");
  }
  const discriminatorRows = columns.filter((column) => column?.column_name === "kind");
  const auditColumns = columns.filter((column) => COLUMNS.includes(column?.column_name));
  return {
    discriminator: discriminatorRows.length === 1 ? discriminatorRows[0] : null,
    discriminatorCount: discriminatorRows.length,
    columns: auditColumns,
    constraints,
  };
}

export function isAbsentUlcPreviewIdentityAuditShape(shape) {
  return canonicalDiscriminator(shape) &&
    Array.isArray(shape?.columns) &&
    Array.isArray(shape?.constraints) &&
    shape.columns.length === 0 &&
    shape.constraints.length === 0;
}

export function isCanonicalUlcPreviewIdentityAuditShape(shape) {
  if (
    !canonicalDiscriminator(shape) ||
    !Array.isArray(shape?.columns) ||
    !Array.isArray(shape?.constraints) ||
    shape.columns.length !== COLUMNS.length ||
    shape.constraints.length !== 1
  ) return false;
  const columns = new Map();
  for (const column of shape.columns) {
    if (
      !COLUMNS.includes(column?.column_name) ||
      columns.has(column.column_name) ||
      column.data_type !== "text" ||
      column.not_null !== false ||
      column.has_default !== false ||
      column.generated !== "" ||
      column.identity !== ""
    ) return false;
    columns.set(column.column_name, column);
  }
  return (
    COLUMNS.every((column) => columns.has(column)) &&
    shape.constraints[0]?.validated === true &&
    hasCanonicalConstraintDefinition(shape.constraints[0]?.definition)
  );
}

function canonicalDiscriminator(shape) {
  const column = shape?.discriminator;
  return shape?.discriminatorCount === 1 &&
    column?.column_name === "kind" &&
    column.data_type === "text" &&
    column.not_null === true &&
    column.has_default === false &&
    column.generated === "" &&
    column.identity === "";
}

export function hasCanonicalConstraintDefinition(definition) {
  if (typeof definition !== "string" || !/^CHECK\s*\(/i.test(definition)) {
    return false;
  }
  const checkBody = unwrapFullParentheses(definition.replace(/^CHECK\s*/i, ""));
  if (checkBody === null) return false;
  const branches = topLevelOrBranches(checkBody);
  if (branches === null || branches.length !== 2) return false;
  return flattenPredicate(branches[0]) === EXPECTED_NULL_BRANCH &&
    flattenPredicate(branches[1]) === EXPECTED_AUDITED_BRANCH;
}

function flattenPredicate(input) {
  // pg_get_constraintdef may add redundant parentheses and implicit text
  // casts, or deparse BETWEEN as two comparisons. Neither changes semantics.
  let flattened = input.toLowerCase()
    .replace(/"([a-z_][a-z0-9_]*)"/g, "$1")
    .replace(/::(?:pg_catalog\.)?text\b/g, "")
    .replace(/[()\s]/g, "");
  for (const [column, maximum] of [
    ["provisioning_owner", 120],
    ["actor_principal_id", 200],
    ["reason", 500],
  ]) {
    flattened = flattened.replaceAll(
      `char_length${column}between1and${maximum}`,
      `char_length${column}>=1andchar_length${column}<=${maximum}`,
    );
  }
  return flattened;
}

function unwrapFullParentheses(value) {
  let candidate = value.trim();
  if (!candidate.startsWith("(")) return null;
  while (candidate.startsWith("(")) {
    let depth = 0;
    let complete = false;
    let quoted = false;
    for (let index = 0; index < candidate.length; index += 1) {
      const char = candidate[index];
      if (char === "'") {
        if (quoted && candidate[index + 1] === "'") {
          index += 1;
          continue;
        }
        quoted = !quoted;
      }
      if (quoted) continue;
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth < 0) return null;
        if (depth === 0) {
          complete = index === candidate.length - 1;
          break;
        }
      }
    }
    if (!complete || quoted) break;
    candidate = candidate.slice(1, -1).trim();
  }
  return candidate || null;
}

function topLevelOrBranches(input) {
  const positions = [];
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "'") {
      if (quoted && input[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth < 0) return null;
    }
    if (
      depth === 0 &&
      input.slice(index, index + 2).toUpperCase() === "OR" &&
      !/[a-z0-9_]/i.test(input[index - 1] || "") &&
      !/[a-z0-9_]/i.test(input[index + 2] || "")
    ) {
      positions.push(index);
      index += 1;
    }
  }
  if (quoted || depth !== 0 || positions.length !== 1) return null;
  const [position] = positions;
  return [input.slice(0, position).trim(), input.slice(position + 2).trim()];
}
