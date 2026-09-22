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
    schemaVersion: 4,
    migrations: [
      "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
      "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
      "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
      "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
    ],
  }),
});

const APP_DATABASE_OWNERS = Object.freeze({
  "ulc-linz": databaseOwner({
    id: "ulc-linz-lifecycle",
    root: "apps/ulc-linz",
    schemaVersion: 4,
    migrations: [
      "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
      "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
      "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
    ],
  }),
});

export function createGeneratedDatabaseManifest(definition, options = {}) {
  if (!isPlainObject(definition)) {
    throw new Error("Generated database manifest requires an app definition object.");
  }
  const appId = requiredIdentifier(definition.appId, "appId");
  const platformServices = identifierList(
    definition.platformServices,
    "platformServices",
  );
  const modules = identifierList(definition.modules, "modules");
  const modulesById = verifiedModuleDefinitionsById(
    options.moduleDefinitions,
    modules,
  );

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
    const moduleDefinition = modulesById.get(moduleName);
    if (moduleDefinition === undefined) {
      throw new Error(
        `Generated database manifest requires verified module definition ${moduleName}.`,
      );
    }
    const moduleOwner = databaseOwnerFromModuleDefinition(moduleDefinition);
    if (moduleOwner !== null) {
      owners.push(moduleOwner);
    }
  }

  if (Object.hasOwn(APP_DATABASE_OWNERS, appId)) {
    owners.push(cloneOwner(APP_DATABASE_OWNERS[appId]));
  }

  if (owners.length === 0) return null;

  return Object.freeze({
    manifestVersion: 1,
    application: appId,
    dialect: "postgresql",
    owners: Object.freeze(owners),
  });
}

export function renderGeneratedDatabaseManifest(definition, options = {}) {
  const manifest = createGeneratedDatabaseManifest(definition, options);
  return manifest === null ? null : `${JSON.stringify(manifest, null, 2)}\n`;
}

function verifiedModuleDefinitionsById(value, selectedModules) {
  if (selectedModules.length === 0) return new Map();
  if (!Array.isArray(value)) {
    throw new Error(
      "Generated database manifest requires verified module definitions for selected modules.",
    );
  }

  const byId = new Map();
  for (const definition of value) {
    if (!isPlainObject(definition)) {
      throw new Error(
        "Generated database manifest module definitions must be objects.",
      );
    }
    const moduleId = requiredIdentifier(definition.moduleId, "moduleId");
    if (byId.has(moduleId)) {
      throw new Error(
        `Generated database manifest module definition is duplicated: ${moduleId}.`,
      );
    }
    byId.set(moduleId, definition);
  }
  return byId;
}

function databaseOwnerFromModuleDefinition(definition) {
  const moduleId = requiredIdentifier(definition.moduleId, "moduleId");
  const database = definition.database;
  if (database === null) return null;
  if (!isPlainObject(database)) {
    throw new Error(
      `Generated database manifest module ${moduleId} requires a verified database contract.`,
    );
  }
  if (!Number.isInteger(database.schemaVersion) || database.schemaVersion < 1) {
    throw new Error(
      `Generated database manifest module ${moduleId} schemaVersion is invalid.`,
    );
  }
  if (!Array.isArray(database.migrations) || database.migrations.length === 0) {
    throw new Error(
      `Generated database manifest module ${moduleId} migrations are invalid.`,
    );
  }

  const migrations = database.migrations.map((migration, index) => {
    if (
      typeof migration !== "string" ||
      migration.length === 0 ||
      migration.trim() !== migration
    ) {
      throw new Error(
        `Generated database manifest module ${moduleId} migration[${index}] is invalid.`,
      );
    }
    return migration;
  });

  return databaseOwner({
    id: moduleId,
    root: `modules/${moduleId}`,
    schemaVersion: database.schemaVersion,
    migrations,
  });
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
