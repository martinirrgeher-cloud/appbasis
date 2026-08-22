const TARGET_WORKER = "appbasis-ulc-linz-production";
const CREATE_PATH = "/accounts/{account_id}/workers/workers";

export class UlcLinzM6CloudflareCreateCapabilityError extends Error {
  constructor(code) {
    super("ULC Linz M6 Cloudflare Worker create capability verification failed.");
    this.name = "UlcLinzM6CloudflareCreateCapabilityError";
    this.code = code;
  }
}

export function verifyUlcLinzM6CloudflareWorkerCreateCapability(spec, plannedBody) {
  const body = exactPlannedBody(plannedBody);
  const root = plainRecord(spec, "OPENAPI_INVALID");
  const paths = plainRecord(own(root, "paths", "OPENAPI_INVALID"), "OPENAPI_INVALID");
  const pathItem = plainRecord(own(paths, CREATE_PATH, "CREATE_OPERATION_MISSING"), "CREATE_OPERATION_MISSING");
  const operation = plainRecord(own(pathItem, "post", "CREATE_OPERATION_MISSING"), "CREATE_OPERATION_MISSING");
  const requestBody = resolveRef(root, own(operation, "requestBody", "REQUEST_BODY_MISSING"));
  const content = plainRecord(own(requestBody, "content", "REQUEST_BODY_MISSING"), "REQUEST_BODY_MISSING");
  const jsonMedia = plainRecord(own(content, "application/json", "JSON_SCHEMA_MISSING"), "JSON_SCHEMA_MISSING");
  const requestSchema = own(jsonMedia, "schema", "JSON_SCHEMA_MISSING");

  const requiredExplicitByPath = new Map([
    ["", new Set(["name", "subdomain"])],
    ["/subdomain", new Set(["enabled", "previews_enabled"])],
  ]);
  const branches = validateSchema(root, requestSchema, body, "", requiredExplicitByPath, true);
  if (branches.length === 0) fail("EXACT_CLOSED_BODY_NOT_ACCEPTED");

  return Object.freeze({
    application: "ulc-linz",
    environment: "production",
    workerName: TARGET_WORKER,
    createPath: CREATE_PATH,
    exactClosedBodyAccepted: true,
    atomicSubdomainDisableVerified: true,
    writableFalseValuesVerified: true,
  });
}

function exactPlannedBody(value) {
  const body = plainRecord(value, "PLANNED_BODY_INVALID");
  exactKeys(body, ["name", "subdomain"], "PLANNED_BODY_INVALID");
  if (own(body, "name", "PLANNED_BODY_INVALID") !== TARGET_WORKER) fail("PLANNED_BODY_INVALID");
  const subdomain = plainRecord(own(body, "subdomain", "PLANNED_BODY_INVALID"), "PLANNED_BODY_INVALID");
  exactKeys(subdomain, ["enabled", "previews_enabled"], "PLANNED_BODY_INVALID");
  if (
    own(subdomain, "enabled", "PLANNED_BODY_INVALID") !== false ||
    own(subdomain, "previews_enabled", "PLANNED_BODY_INVALID") !== false
  ) {
    fail("PLANNED_BODY_INVALID");
  }
  return body;
}

function validateSchema(root, schemaValue, value, path, requiredExplicitByPath, requestProperty) {
  const raw = validateSchemaRaw(
    root,
    schemaValue,
    value,
    path,
    requiredExplicitByPath,
    requestProperty,
    new Set(),
  );
  const requiredExplicit = requiredExplicitByPath.get(path);
  if (!requiredExplicit) return raw;
  return raw.filter((branch) => [...requiredExplicit].every((key) => branch.explicitKeys.has(key)));
}

function validateSchemaRaw(
  root,
  schemaValue,
  value,
  path,
  requiredExplicitByPath,
  requestProperty,
  refStack,
) {
  if (
    isPlainObject(schemaValue) &&
    typeof schemaValue.$ref === "string" &&
    !supportsSchemaKeywords(schemaValue)
  ) {
    return [];
  }
  if (requestProperty && isReadOnlyRequestProperty(root, schemaValue)) return [];

  const schema = resolveRef(root, schemaValue, refStack);
  if (typeof schema === "boolean") return schema ? [{ explicitKeys: new Set() }] : [];
  const record = plainRecord(schema, "SCHEMA_INVALID");
  if (requestProperty && record.readOnly === true) return [];
  if (!supportsSchemaKeywords(record)) return [];
  if (!acceptsLocalConstraints(record, value)) return [];

  const localKeys = localExplicitKeys(
    record,
    value,
    root,
    path,
    requiredExplicitByPath,
    requestProperty,
  );
  if (localKeys === null) return [];
  let branches = [{ explicitKeys: localKeys }];

  if (Array.isArray(record.allOf)) {
    for (const child of record.allOf) {
      const childBranches = validateSchemaRaw(
        root,
        child,
        value,
        path,
        requiredExplicitByPath,
        requestProperty,
        new Set(refStack),
      );
      branches = crossUnion(branches, childBranches);
      if (branches.length === 0) return [];
    }
  }

  for (const keyword of ["anyOf", "oneOf"]) {
    if (!Array.isArray(record[keyword])) continue;
    const alternatives = record[keyword].map((child) =>
      validateSchemaRaw(
        root,
        child,
        value,
        path,
        requiredExplicitByPath,
        requestProperty,
        new Set(refStack),
      ),
    );
    const semanticallyAccepted = alternatives.filter((candidate) => candidate.length > 0);
    if (keyword === "oneOf" && semanticallyAccepted.length !== 1) return [];
    if (keyword === "anyOf" && semanticallyAccepted.length === 0) return [];
    const acceptedAlternatives = keyword === "oneOf" ? semanticallyAccepted[0] : semanticallyAccepted.flat();
    branches = crossUnion(branches, acceptedAlternatives);
    if (branches.length === 0) return [];
  }

  return branches;
}

function localExplicitKeys(
  schema,
  value,
  root,
  path,
  requiredExplicitByPath,
  requestProperty,
) {
  const explicitKeys = new Set();
  if (!isPlainObject(value)) return explicitKeys;
  const properties = schema.properties === undefined
    ? {}
    : plainRecord(schema.properties, "SCHEMA_INVALID");
  const required = schema.required === undefined ? [] : plainStringArray(schema.required);
  for (const key of required) {
    if (Object.hasOwn(value, key)) continue;
    if (
      requestProperty &&
      Object.hasOwn(properties, key) &&
      isReadOnlyRequestProperty(root, properties[key])
    ) {
      continue;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    const childPath = `${path}/${escapePointer(key)}`;
    if (Object.hasOwn(properties, key)) {
      const propertySchema = own(properties, key, "SCHEMA_INVALID");
      const accepted = validateSchema(
        root,
        propertySchema,
        value[key],
        childPath,
        requiredExplicitByPath,
        true,
      );
      if (accepted.length === 0) return null;
      explicitKeys.add(key);
      continue;
    }
    if (schema.additionalProperties === false) return null;
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      const accepted = validateSchema(
        root,
        schema.additionalProperties,
        value[key],
        childPath,
        requiredExplicitByPath,
        true,
      );
      if (accepted.length === 0) return null;
    }
  }
  return explicitKeys;
}

function isReadOnlyRequestProperty(root, schemaValue) {
  if (!isPlainObject(schemaValue)) return false;
  if (typeof schemaValue.$ref === "string") {
    if (!supportsSchemaKeywords(schemaValue)) return false;
    const resolved = resolveRef(root, schemaValue, new Set());
    if (schemaValue.readOnly === true) return true;
    return isPlainObject(resolved) && resolved.readOnly === true;
  }
  return schemaValue.readOnly === true;
}

function acceptsLocalConstraints(schema, value) {
  if (schema.nullable === true && value === null) return true;
  if (schema.const !== undefined && !Object.is(value, schema.const)) return false;
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || !schema.enum.some((item) => Object.is(item, value))) return false;
  }
  if (schema.type !== undefined && !acceptsType(schema.type, value)) return false;

  if (typeof value === "string") {
    if (schema.minLength !== undefined && (!Number.isInteger(schema.minLength) || value.length < schema.minLength)) return false;
    if (schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || value.length > schema.maxLength)) return false;
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string") return false;
      try {
        if (!new RegExp(schema.pattern, "u").test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  if (isPlainObject(value)) {
    const count = Object.keys(value).length;
    if (schema.minProperties !== undefined && (!Number.isInteger(schema.minProperties) || count < schema.minProperties)) return false;
    if (schema.maxProperties !== undefined && (!Number.isInteger(schema.maxProperties) || count > schema.maxProperties)) return false;
  }
  return true;
}

function acceptsType(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "object") return isPlainObject(value);
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "string") return typeof value === "string";
    if (candidate === "boolean") return typeof value === "boolean";
    if (candidate === "integer") return Number.isInteger(value);
    if (candidate === "number") return typeof value === "number" && Number.isFinite(value);
    if (candidate === "null") return value === null;
    return false;
  });
}

function supportsSchemaKeywords(schema) {
  const supported = new Set([
    "$ref",
    "type",
    "enum",
    "const",
    "properties",
    "required",
    "additionalProperties",
    "minProperties",
    "maxProperties",
    "minLength",
    "maxLength",
    "pattern",
    "allOf",
    "anyOf",
    "oneOf",
    "readOnly",
    "writeOnly",
    "nullable",
    "title",
    "description",
    "default",
    "deprecated",
    "example",
    "examples",
    "format",
    "discriminator",
    "xml",
    "externalDocs",
  ]);
  return Object.keys(schema).every((key) => key.startsWith("x-") || supported.has(key));
}

function resolveRef(root, value, seen = new Set()) {
  let current = value;
  while (isPlainObject(current) && typeof current.$ref === "string") {
    const ref = current.$ref;
    if (!ref.startsWith("#/")) fail("EXTERNAL_SCHEMA_REF");
    if (seen.has(ref)) fail("SCHEMA_REF_LOOP");
    seen.add(ref);
    current = ref
      .slice(2)
      .split("/")
      .map(unescapePointer)
      .reduce((node, key) => (isPlainObject(node) ? node[key] : undefined), root);
    if (current === undefined) fail("SCHEMA_REF_MISSING");
  }
  return current;
}

function crossUnion(left, right) {
  if (left.length === 0 || right.length === 0) return [];
  const result = [];
  for (const a of left) {
    for (const b of right) {
      result.push({ explicitKeys: new Set([...a.explicitKeys, ...b.explicitKeys]) });
    }
  }
  return result;
}

function plainRecord(value, code) {
  if (!isPlainObject(value)) fail(code);
  return value;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function plainStringArray(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail("SCHEMA_INVALID");
  return value;
}

function exactKeys(record, expected, code) {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}

function own(record, key, code) {
  if (!Object.hasOwn(record, key)) fail(code);
  return record[key];
}

function escapePointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unescapePointer(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function fail(code) {
  throw new UlcLinzM6CloudflareCreateCapabilityError(code);
}
