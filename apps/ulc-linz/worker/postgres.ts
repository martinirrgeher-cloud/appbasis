import {
  PostgresAthleteMasterdataRepository,
} from "@appbasis/athletes";
import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import {
  createPostgresIdentityApplicationRuntime,
  type IdentityPostgresRuntimeSqlClient,
} from "@appbasis/identity/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  type PermissionStore,
} from "@appbasis/permissions";

import {
  createUlcLinzAthletesAccessService,
  type UlcLinzAthletesAccessService,
} from "./athletes-access";
import {
  createUlcLinzCountdownAccessService,
  type UlcLinzCountdownAccessService,
} from "./countdown-access";
import {
  createUlcLinzExerciseCatalogAccessService,
  type UlcLinzExerciseCatalogAccessService,
} from "./exercise-catalog-access";
import type { UlcExerciseCatalogObjectStore } from "./exercise-catalog-private-media";
import {
  createUlcExerciseCatalogRuntimeRepository,
  type UlcExerciseCatalogRuntimeMode,
} from "./exercise-catalog-runtime";
import { createUlcExerciseCatalogService } from "./exercise-catalog-service";
import {
  createUlcLinzKindertrainingAccessService,
  type UlcLinzKindertrainingAccessService,
} from "./kindertraining-access";
import { createUlcKindertrainingService } from "./kindertraining-service";
import {
  createUlcLinzU12AccessService,
  type UlcLinzU12AccessService,
} from "./u12-access";
import { createUlcU12Service } from "./u12-service";
import { PostgresUlcLinzScopePersistence } from "./scope-persistence";
import { PostgresUlcTrainingSessionRepository } from "./training-session-postgres";
import { PostgresUlcLinzTrainingModuleGroupReader } from "./training-module-group-postgres";
import {
  createUlcLinzTrainerIdentityAdminAccessService,
  type UlcLinzTrainerIdentityAdminAccessService,
} from "./trainer-identity-admin-access";
import { PostgresUlcLinzTrainerIdentityLinks } from "./trainer-identity-postgres";
import { createUlcLinzTrainerUserProvisioningService } from "./trainer-user-provisioning";
import {
  createPostgresUlcLinzSecurityEventLogger,
  type BufferedUlcLinzSecurityEventLogger,
} from "./security-events-postgres";

export interface GeneratedPostgresApplicationRuntime {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  countdownAccess: UlcLinzCountdownAccessService;
  athletesAccess: UlcLinzAthletesAccessService;
  exerciseCatalogAccess: UlcLinzExerciseCatalogAccessService;
  kindertrainingAccess: UlcLinzKindertrainingAccessService;
  u12Access: UlcLinzU12AccessService;
  trainerIdentityAccess: UlcLinzTrainerIdentityAdminAccessService;
  trainerIdentityLinks: Pick<
    PostgresUlcLinzTrainerIdentityLinks,
    "listBindings" | "bindTrainer"
  >;
  trainerUserProvisioning: ReturnType<
    typeof createUlcLinzTrainerUserProvisioningService
  >;
  athleteMasterdata: Pick<
    PostgresAthleteMasterdataRepository,
    | "readOrganizationSnapshot"
    | "createTrainingGroup"
    | "createAthlete"
    | "createTrainer"
    | "updateTrainingGroup"
    | "updateAthlete"
    | "updateAthleteIfUnchanged"
    | "updateTrainer"
    | "createAthleteGroupMembership"
    | "createTrainerGroupMembership"
    | "deactivateAthlete"
    | "deactivateTrainer"
  >;
  kindertraining: ReturnType<typeof createUlcKindertrainingService>;
  u12: ReturnType<typeof createUlcU12Service>;
  exerciseCatalog: ReturnType<typeof createUlcExerciseCatalogService>;
  exerciseCatalogMediaStore: UlcExerciseCatalogObjectStore | null;
  securityEvents: BufferedUlcLinzSecurityEventLogger;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  securityLogConnectionString: string;
  baseURL: string;
  secret: string;
  exerciseCatalogRuntimeMode?: UlcExerciseCatalogRuntimeMode;
  exerciseCatalogMediaStore?: UlcExerciseCatalogObjectStore | null;
}

export async function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): Promise<GeneratedPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);
  let securityLogConnection:
    | ReturnType<typeof createPostgresDatabase>
    | undefined;

  try {
    securityLogConnection = createPostgresDatabase(
      requiredSecurityLogConnectionString(options.securityLogConnectionString),
    );
    const securityConnection = securityLogConnection;
    const permissions = createPermissionStore(identityRuntime.sql);
    const applicationSql = {
      unsafe(query: string, parameters?: Array<string | number | boolean | null>) {
        return identityRuntime.sql.unsafe(query, parameters);
      },
      begin<T>(
        callback: (transaction: {
          unsafe(
            query: string,
            parameters?: Array<string | number | boolean | null>,
          ): PromiseLike<readonly Record<string, unknown>[]>;
        }) => Promise<T>,
      ): Promise<T> {
        return identityRuntime.sql.begin(async (transaction) =>
          callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }),
        );
      },
    };
    const scopes = new PostgresUlcLinzScopePersistence(applicationSql);
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(
      securityConnection.client,
    );
    const countdownAccess = createUlcLinzCountdownAccessService({
      sql: applicationSql,
      permissions,
      securityEvents,
    });
    const athletesAccess = createUlcLinzAthletesAccessService({
      sql: applicationSql,
      permissions,
      memberships: scopes,
      subjectScopes: scopes,
      securityEvents,
    });
    const exerciseCatalogAccess = createUlcLinzExerciseCatalogAccessService({
      sql: applicationSql,
      permissions,
      memberships: scopes,
      subjectScopes: scopes,
      securityEvents,
    });
    const kindertrainingAccess = createUlcLinzKindertrainingAccessService({
      sql: applicationSql,
      permissions,
      memberships: scopes,
      subjectScopes: scopes,
      securityEvents,
    });
    const u12Access = createUlcLinzU12AccessService({
      sql: applicationSql,
      permissions,
      memberships: scopes,
      subjectScopes: scopes,
      securityEvents,
    });
    const trainerIdentityAccess =
      createUlcLinzTrainerIdentityAdminAccessService({
        sql: applicationSql,
        permissions,
        memberships: scopes,
        subjectScopes: scopes,
        securityEvents,
      });
    const trainerIdentityLinks =
      new PostgresUlcLinzTrainerIdentityLinks(applicationSql);
    const trainerUserProvisioning =
      createUlcLinzTrainerUserProvisioningService({
        identityProvisioning: identityRuntime.provisioningIdentity,
        sql: applicationSql,
        permissions,
        accessAdministration: new PostgresPrincipalAccessAdministration(
          identityRuntime.sql,
        ),
        trainerIdentityLinks,
      });
    const athleteMasterdataRepository =
      new PostgresAthleteMasterdataRepository(applicationSql);
    const athleteMasterdata = Object.freeze({
      readOrganizationSnapshot(organizationId: string) {
        return athleteMasterdataRepository.readOrganizationSnapshot(
          organizationId,
        );
      },
      createTrainingGroup(
        organizationId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["createTrainingGroup"]
        >[1],
      ) {
        return athleteMasterdataRepository.createTrainingGroup(
          organizationId,
          input,
        );
      },
      createAthlete(
        organizationId: string,
        input: Parameters<PostgresAthleteMasterdataRepository["createAthlete"]>[1],
      ) {
        return athleteMasterdataRepository.createAthlete(organizationId, input);
      },
      createTrainer(
        organizationId: string,
        input: Parameters<PostgresAthleteMasterdataRepository["createTrainer"]>[1],
      ) {
        return athleteMasterdataRepository.createTrainer(organizationId, input);
      },
      updateTrainingGroup(
        organizationId: string,
        groupId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["updateTrainingGroup"]
        >[2],
      ) {
        return athleteMasterdataRepository.updateTrainingGroup(
          organizationId,
          groupId,
          input,
        );
      },
      updateAthlete(
        organizationId: string,
        athleteId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["updateAthlete"]
        >[2],
      ) {
        return athleteMasterdataRepository.updateAthlete(
          organizationId,
          athleteId,
          input,
        );
      },
      updateAthleteIfUnchanged(
        organizationId: string,
        athleteId: string,
        expected: Parameters<
          PostgresAthleteMasterdataRepository["updateAthleteIfUnchanged"]
        >[2],
        input: Parameters<
          PostgresAthleteMasterdataRepository["updateAthleteIfUnchanged"]
        >[3],
      ) {
        return athleteMasterdataRepository.updateAthleteIfUnchanged(
          organizationId,
          athleteId,
          expected,
          input,
        );
      },
      updateTrainer(
        organizationId: string,
        trainerId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["updateTrainer"]
        >[2],
      ) {
        return athleteMasterdataRepository.updateTrainer(
          organizationId,
          trainerId,
          input,
        );
      },
      createAthleteGroupMembership(
        organizationId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["createAthleteGroupMembership"]
        >[1],
      ) {
        return athleteMasterdataRepository.createAthleteGroupMembership(
          organizationId,
          input,
        );
      },
      createTrainerGroupMembership(
        organizationId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["createTrainerGroupMembership"]
        >[1],
      ) {
        return athleteMasterdataRepository.createTrainerGroupMembership(
          organizationId,
          input,
        );
      },
      deactivateAthlete(organizationId: string, athleteId: string) {
        return athleteMasterdataRepository.deactivateAthlete(
          organizationId,
          athleteId,
        );
      },
      deactivateTrainer(organizationId: string, trainerId: string) {
        return athleteMasterdataRepository.deactivateTrainer(
          organizationId,
          trainerId,
        );
      },
    });
    const trainingSessions =
      new PostgresUlcTrainingSessionRepository(applicationSql);
    const trainingModuleGroups =
      new PostgresUlcLinzTrainingModuleGroupReader(applicationSql);
    const kindertraining = createUlcKindertrainingService({
      masterdata: athleteMasterdata,
      sessions: trainingSessions,
    });
    const u12 = createUlcU12Service({
      masterdata: athleteMasterdata,
      sessions: trainingSessions,
      moduleGroups: trainingModuleGroups,
    });
    const exerciseCatalog = createUlcExerciseCatalogService({
      repository: createUlcExerciseCatalogRuntimeRepository({
        mode: options.exerciseCatalogRuntimeMode ?? "legacy",
        sql: applicationSql,
      }),
      masterdata: athleteMasterdata,
    });
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      countdownAccess,
      athletesAccess,
      exerciseCatalogAccess,
      kindertrainingAccess,
      u12Access,
      trainerIdentityAccess,
      trainerIdentityLinks,
      trainerUserProvisioning,
      athleteMasterdata,
      kindertraining,
      u12,
      exerciseCatalog,
      exerciseCatalogMediaStore: options.exerciseCatalogMediaStore ?? null,
      securityEvents,
      async close() {
        let closeError: unknown = null;
        try {
          await securityConnection.client.end();
        } catch (error) {
          closeError = error;
        }
        try {
          await identityRuntime.close();
        } catch (error) {
          closeError ??= error;
        }
        if (closeError !== null) throw closeError;
      },
    });
  } catch (error) {
    if (securityLogConnection !== undefined) {
      try {
        await securityLogConnection.client.end();
      } catch {
        // Preserve the construction failure; cleanup errors must not replace it.
      }
    }
    try {
      await identityRuntime.close();
    } catch {
      // Preserve the construction failure; cleanup errors must not replace it.
    }
    throw error;
  }
}

function createPermissionStore(client: IdentityPostgresRuntimeSqlClient) {
  return new PostgresPermissionStore({
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  });
}

function requiredSecurityLogConnectionString(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("A dedicated security-log PostgreSQL connection string is required.");
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
    return value;
  } catch {
    throw new Error("A dedicated security-log PostgreSQL connection string is required.");
  }
}
