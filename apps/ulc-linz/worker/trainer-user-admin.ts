import {
  PostgresIdentityStateStore,
  normalizeUsername,
  technicalEmailForUsername,
} from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { createPostgresDatabase } from "@appbasis/database";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  capabilityId,
  principalId,
  roleId,
  type CapabilityId,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";

const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;
const MAXIMUM_DISPLAY_NAME_LENGTH = 160;
const MAXIMUM_CONTACT_EMAIL_LENGTH = 320;

export type UlcLinzTrainerUserProfile = "kindertrainer" | "leistungstrainer";

export interface UlcLinzTrainerUserProvisioningResult {
  readonly identityId: string;
  readonly username: string;
  readonly displayName: string;
  readonly contactEmail: string | null;
  readonly profile: UlcLinzTrainerUserProfile;
  readonly created: boolean;
}

export class UlcLinzTrainerUserValidationError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_INVALID";
  constructor() {
    super("Trainer user input is invalid.");
    this.name = "UlcLinzTrainerUserValidationError";
  }
}

export class UlcLinzTrainerUserConflictError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_CONFLICT";
  constructor() {
    super("Trainer user conflicts with existing state.");
    this.name = "UlcLinzTrainerUserConflictError";
  }
}

export class UlcLinzTrainerUserPersistenceError extends Error {
  readonly code = "ULC_LINZ_TRAINER_USER_PERSISTENCE_ERROR";
  constructor() {
    super("Trainer user provisioning failed.");
    this.name = "UlcLinzTrainerUserPersistenceError";
  }
}

type DatabaseConnection = ReturnType<typeof createPostgresDatabase>;
type DatabaseFactory = (connectionString: string) => DatabaseConnection;

type ExistingUser = Readonly<{
  id: string;
  email: string;
  username: string;
  displayName: string;
}>;

export class PostgresUlcLinzTrainerUserAdministration {
  constructor(
    private readonly options: Readonly<{
      connectionString: string;
      baseURL: string;
      secret: string;
    }>,
    private readonly createDatabase: DatabaseFactory = createPostgresDatabase,
  ) {}

  async createTrainerUser(input: {
    organizationId: string;
    actorPrincipalId: string;
    username: string;
    displayName: string;
    contactEmail?: string | null;
    temporaryPassword: string;
    profile: UlcLinzTrainerUserProfile;
  }): Promise<UlcLinzTrainerUserProvisioningResult> {
    const organizationId = requiredIdentifier(input.organizationId);
    const actorPrincipalId = requiredIdentifier(input.actorPrincipalId);
    const username = requiredUsername(input.username);
    const displayName = requiredDisplayName(input.displayName);
    const contactEmail = optionalContactEmail(input.contactEmail);
    const temporaryPassword = requiredTemporaryPassword(input.temporaryPassword);
    const profile = requiredProfile(input.profile);

    const connection = this.createDatabase(this.options.connectionString);
    try {
      const auth = createBetterAuthRuntime({
        database: connection.database,
        baseURL: this.options.baseURL,
        secret: this.options.secret,
      });
      const stateStore = new PostgresIdentityStateStore(connection.client);
      const technicalEmail = await technicalEmailForUsername(username);
      const operationKey = "provision:" + username;

      let operation = await stateStore.findOperation(operationKey);
      let user = await readUser(connection, username);
      if (operation === null && user !== null) {
        throw new UlcLinzTrainerUserConflictError();
      }
      if (operation === null) {
        operation = await stateStore.prepareOperation({
          operationKey,
          kind: "provision",
          identityId: null,
        });
      }

      let created = false;
      if (user === null) {
        try {
          const response = await auth.api.createUser({
            body: {
              email: technicalEmail,
              password: temporaryPassword,
              name: displayName,
              role: "user",
              data: {
                username,
                displayUsername: username,
              },
            },
          });
          if (typeof response.user?.id !== "string" || response.user.id.length === 0) {
            throw new UlcLinzTrainerUserPersistenceError();
          }
          created = true;
        } catch (error) {
          if (error instanceof UlcLinzTrainerUserPersistenceError) throw error;
        }
        user = await readUser(connection, username);
      }

      const recovered = requireRecoverableUser(
        user,
        username,
        displayName,
        technicalEmail,
      );
      if (
        operation.identityId !== null &&
        operation.identityId !== recovered.id
      ) {
        throw new UlcLinzTrainerUserConflictError();
      }

      let identityState = await stateStore.find(recovered.id);
      if (identityState === null || operation.completedAt === null) {
        identityState = await stateStore.completeProvisioning({
          operationId: operation.operationId,
          identityId: recovered.id,
          username,
          displayName,
          contactEmail,
          completedAt: new Date(),
        });
      }
      if (
        identityState.identityId !== recovered.id ||
        identityState.username !== username ||
        identityState.displayName !== displayName ||
        identityState.contactEmail !== contactEmail ||
        identityState.mustChangePassword !== true
      ) {
        throw new UlcLinzTrainerUserConflictError();
      }

      await ensureTrainerMembership(
        connection,
        recovered.id,
        organizationId,
      );
      await ensureTrainerPermissions(
        connection,
        recovered.id,
        actorPrincipalId,
        profile,
      );

      return Object.freeze({
        identityId: recovered.id,
        username,
        displayName,
        contactEmail,
        profile,
        created,
      });
    } catch (error) {
      if (
        error instanceof UlcLinzTrainerUserValidationError ||
        error instanceof UlcLinzTrainerUserConflictError ||
        error instanceof UlcLinzTrainerUserPersistenceError
      ) {
        throw error;
      }
      throw new UlcLinzTrainerUserPersistenceError();
    } finally {
      await connection.client.end().catch(() => {});
    }
  }
}

async function readUser(
  connection: DatabaseConnection,
  username: string,
): Promise<ExistingUser | null> {
  const rows = await connection.client.unsafe(
    "SELECT id, email, username, name, role, banned " +
      'FROM "user" WHERE username = $1 LIMIT 1',
    [username],
  );
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new UlcLinzTrainerUserPersistenceError();
  }
  const row = rows[0];
  if (
    typeof row.id !== "string" ||
    typeof row.email !== "string" ||
    row.username !== username ||
    typeof row.name !== "string" ||
    row.role !== "user" ||
    row.banned === true
  ) {
    throw new UlcLinzTrainerUserConflictError();
  }
  return Object.freeze({
    id: row.id,
    email: row.email,
    username,
    displayName: row.name,
  });
}

function requireRecoverableUser(
  user: ExistingUser | null,
  username: string,
  displayName: string,
  technicalEmail: string,
): ExistingUser {
  if (
    user === null ||
    user.username !== username ||
    user.displayName !== displayName ||
    user.email !== technicalEmail
  ) {
    throw new UlcLinzTrainerUserConflictError();
  }
  return user;
}

async function ensureTrainerMembership(
  connection: DatabaseConnection,
  identityId: string,
  organizationId: string,
): Promise<void> {
  await connection.client.begin(async (transaction) => {
    const rows = await transaction.unsafe(
      "SELECT organization_id, source_role, active " +
        "FROM ulc_linz_membership WHERE identity_id = $1 FOR UPDATE",
      [identityId],
    );
    if (rows.length === 0) {
      const inserted = await transaction.unsafe(
        "INSERT INTO ulc_linz_membership (" +
          "identity_id, organization_id, subject_id, source_role, active" +
          ") VALUES (" +
          "$1, $2, 'ulc-detached-trainer:' || md5($1), 'trainer', true" +
          ") RETURNING identity_id",
        [identityId, organizationId],
      );
      if (inserted.length !== 1) {
        throw new UlcLinzTrainerUserPersistenceError();
      }
      return;
    }
    if (
      rows.length !== 1 ||
      rows[0]?.organization_id !== organizationId ||
      rows[0]?.source_role !== "trainer" ||
      rows[0]?.active !== true
    ) {
      throw new UlcLinzTrainerUserConflictError();
    }
  });
}

async function ensureTrainerPermissions(
  connection: DatabaseConnection,
  identityId: string,
  actorPrincipalId: string,
  profile: UlcLinzTrainerUserProfile,
): Promise<void> {
  const targetPrincipalId = principalId(identityId);
  const trainerRoleId = roleId(roleDataScope.runtimeRoleIds.trainer);
  const adminRoleId = roleId(roleDataScope.runtimeRoleIds.admin);
  const store = new PostgresPermissionStore(connection.client);

  await connection.client.unsafe(
    "INSERT INTO appbasis_permission_principal (principal_id) " +
      "VALUES ($1) ON CONFLICT (principal_id) DO NOTHING",
    [targetPrincipalId],
  );

  const adminRole = await store.findRole(adminRoleId);
  if (adminRole === null || adminRole.capabilities.length === 0) {
    throw new UlcLinzTrainerUserPersistenceError();
  }
  const grants = desiredProfileCapabilities(adminRole.capabilities, profile);
  const grantSet = new Set(grants.map(String));
  const revokes = adminRole.capabilities
    .filter((item) => !grantSet.has(String(item)))
    .sort((left, right) => String(left).localeCompare(String(right)));

  const existing = await store.findPrincipal(targetPrincipalId);
  if (existing === null) {
    throw new UlcLinzTrainerUserPersistenceError();
  }
  if (
    sameStrings(existing.roleIds, [trainerRoleId]) &&
    sameStrings(existing.grants, grants) &&
    sameStrings(existing.revokes, revokes)
  ) {
    return;
  }
  if (
    existing.roleIds.length !== 0 ||
    existing.grants.length !== 0 ||
    existing.revokes.length !== 0
  ) {
    throw new UlcLinzTrainerUserConflictError();
  }

  const administration = new PostgresPrincipalAccessAdministration(
    connection.client,
  );
  await administration.replacePrincipalAccess(
    targetPrincipalId,
    [trainerRoleId],
    { grants, revokes },
    {
      actorPrincipalId: principalId(actorPrincipalId),
      reason: "ULC trainer user provisioning (" + profile + ")",
    },
    {
      expectedRoleIds: existing.roleIds,
      expectedGrants: existing.grants,
      expectedRevokes: existing.revokes,
    },
  );

  const verified = await store.findPrincipal(targetPrincipalId);
  if (
    verified === null ||
    !sameStrings(verified.roleIds, [trainerRoleId]) ||
    !sameStrings(verified.grants, grants) ||
    !sameStrings(verified.revokes, revokes)
  ) {
    throw new UlcLinzTrainerUserPersistenceError();
  }
}

function desiredProfileCapabilities(
  knownCapabilities: readonly CapabilityId[],
  profile: UlcLinzTrainerUserProfile,
): readonly CapabilityId[] {
  const template = roleDataScope.permissionTemplates[profile];
  const requested = new Set<string>();
  for (const moduleKey of template.view) {
    requested.add("ulc-linz:module:" + moduleKey + ":view");
  }
  for (const moduleKey of template.edit) {
    requested.add("ulc-linz:module:" + moduleKey + ":view");
    requested.add("ulc-linz:module:" + moduleKey + ":edit");
  }
  const known = new Map(
    knownCapabilities.map((item) => [String(item), item]),
  );
  return Object.freeze(
    [...requested]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => {
        const capability = known.get(value);
        if (capability === undefined) {
          throw new UlcLinzTrainerUserPersistenceError();
        }
        return capabilityId(String(capability));
      }),
  );
}

function sameStrings(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].map(String).sort((x, y) => x.localeCompare(y));
  const b = [...right].map(String).sort((x, y) => x.localeCompare(y));
  return a.every((value, index) => value === b[index]);
}

function requiredUsername(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new UlcLinzTrainerUserValidationError();
  }
  try {
    const normalized = normalizeUsername(value);
    if (normalized !== value) throw new UlcLinzTrainerUserValidationError();
    return normalized;
  } catch (error) {
    if (error instanceof UlcLinzTrainerUserValidationError) throw error;
    throw new UlcLinzTrainerUserValidationError();
  }
}

function requiredDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new UlcLinzTrainerUserValidationError();
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_DISPLAY_NAME_LENGTH
  ) {
    throw new UlcLinzTrainerUserValidationError();
  }
  return normalized;
}

function optionalContactEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new UlcLinzTrainerUserValidationError();
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_CONTACT_EMAIL_LENGTH ||
    !/^[^@\s]+@[^@\s]+\\.[^@\s]+$/u.test(normalized)
  ) {
    throw new UlcLinzTrainerUserValidationError();
  }
  return normalized;
}

function requiredTemporaryPassword(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < MINIMUM_PASSWORD_LENGTH ||
    value.length > MAXIMUM_PASSWORD_LENGTH ||
    value.trim().length === 0 ||
    /[\r\n]/u.test(value)
  ) {
    throw new UlcLinzTrainerUserValidationError();
  }
  return value;
}

function requiredProfile(value: unknown): UlcLinzTrainerUserProfile {
  if (value !== "kindertrainer" && value !== "leistungstrainer") {
    throw new UlcLinzTrainerUserValidationError();
  }
  return value;
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcLinzTrainerUserValidationError();
  }
  return value;
}
