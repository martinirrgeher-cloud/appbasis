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
import { PostgresUlcLinzScopePersistence } from "./scope-persistence";
import {
  createPostgresUlcLinzSecurityEventLogger,
  type BufferedUlcLinzSecurityEventLogger,
} from "./security-events-postgres";

export interface GeneratedPostgresApplicationRuntime {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  countdownAccess: UlcLinzCountdownAccessService;
  athletesAccess: UlcLinzAthletesAccessService;
  athleteMasterdata: Pick<
    PostgresAthleteMasterdataRepository,
    | "readOrganizationSnapshot"
    | "createTrainingGroup"
    | "createAthlete"
    | "createTrainer"
    | "updateTrainingGroup"
    | "updateAthlete"
    | "updateTrainer"
    | "createAthleteGroupMembership"
    | "createTrainerGroupMembership"
    | "deactivateAthlete"
    | "deactivateTrainer"
  >;
  securityEvents: BufferedUlcLinzSecurityEventLogger;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  securityLogConnectionString: string;
  baseURL: string;
  secret: string;
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
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      countdownAccess,
      athletesAccess,
      athleteMasterdata,
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
