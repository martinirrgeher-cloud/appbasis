const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;

const PLATFORM_SERVICE_DATABASE_OWNERS = Object.freeze({
  identity: databaseOwner({
    id: "identity",
    root: "packages/identity",
    schemaVersion: 2,
    migrations: [
      "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
      "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
    ],
  }),
  permissions: databaseOwner({
    id: "permissions",
    root: "packages/permissions",
    schemaVersion: 2,
    migrations: [
      "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
      "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
    ],
  }),
});

const MODULE_DATABASE_OWNERS = Object.freeze({
  tasks: databaseOwner({
    id: "tasks",
    root: "modules/tasks",
    schemaVersion: 1,
    migrations: ["modules/tasks/migrations/0000_appbasis_tasks_foundation.sql"],
  }),
});

export function createGeneratedDatabaseManifest(definition) {
  if (!isPlainObject(definition)) {
    throw new Error("Generated database manifest requires an app definition object.");
  }
  const appId = requiredIdentifier(definition.appId, "appId");
  const platformServices = identifierList(
    definition.platformServices,
    "platformServices",
  );
  const modules = identifierList(definition.modules, "modules");

  const owners = [];
  for (const platformService of Object.keys(
    PLATFORM_SERVICE_DATABASE_OWNERS,
  )) {
    if (!platformServices.includes(platformService)) continue;
    owners.push(cloneOwner(PLATFORM_SERVICE_DATABASE_OWNERS[platformService]));
  }
  for (const platformService of platformServices) {
    if (!Object.hasOwn(PLATFORM_SERVICE_DATABASE_OWNERS, platformService)) {
      throw new Error(
        `Generated database ownership is not declared for platform service ${platformService}.`,
      );
    }
  }

  for (const moduleName of [...modules].sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (!Object.hasOwn(MODULE_DATABASE_OWNERS, moduleName)) {
      throw new Error(
        `Generated database ownership is not declared for module ${moduleName}.`,
      );
    }
    owners.push(cloneOwner(MODULE_DATABASE_OWNERS[moduleName]));
  }

  if (owners.length === 0) return null;

  return Object.freeze({
    manifestVersion: 1,
    application: appId,
    dialect: "postgresql",
    owners: Object.freeze(owners),
  });
}

export function renderGeneratedDatabaseManifest(definition) {
  const manifest = createGeneratedDatabaseManifest(definition);
  return manifest === null ? null : `${JSON.stringify(manifest, null, 2)}\n`;
}

function databaseOwner({ id, root, schemaVersion, migrations }) {
  return Object.freeze({
    id,
    root,
    schemaVersion,
    migrations: Object.freeze([...migrations]),
  });
}

function cloneOwner(owner) {
  return Object.freeze({
    id: owner.id,
    root: owner.root,
    schemaVersion: owner.schemaVersion,
    migrations: Object.freeze([...owner.migrations]),
  });
}

function identifierList(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Generated database manifest ${field} must be an array.`);
  }
  const identifiers = value.map((identifier, index) =>
    requiredIdentifier(identifier, `${field}[${index}]`),
  );
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error(
      `Generated database manifest ${field} must not contain duplicates.`,
    );
  }
  return identifiers;
}

function requiredIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `Generated database manifest ${field} must match ${IDENTIFIER_PATTERN.source}.`,
    );
  }
  return value;
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
