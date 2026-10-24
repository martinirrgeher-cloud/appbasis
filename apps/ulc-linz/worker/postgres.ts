import {
  PostgresAthleteMasterdataRepository,
} from "@appbasis/athletes";
import { PostgresExerciseCatalogRepository } from "@appbasis/exercise-catalog";
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
  PostgresTrainingBlockRepository,
  TrainingBlockService,
} from "@appbasis/training-blocks";
import {
  PostgresTrainingPlanRepository,
  TrainingPlanService,
} from "@appbasis/training-plans";

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
  createUlcLinzSelfRegistrationAccessService,
  type UlcLinzSelfRegistrationAccessService,
} from "./self-registration-access";
import { createUlcSelfRegistrationService } from "./self-registration-service";
import {
  createUlcLinzU12AccessService,
  type UlcLinzU12AccessService,
} from "./u12-access";
import { createUlcU12Service } from "./u12-service";
import {
  createUlcLinzTrainingBlocksAccessService,
  type UlcLinzTrainingBlocksAccessService,
} from "./training-blocks-access";
import {
  createUlcTrainingBlockService,
  type UlcTrainingBlockService,
} from "./training-blocks-service";
import {
  createUlcLinzTrainingPlansAccessService,
  type UlcLinzTrainingPlansAccessService,
} from "./training-plans-access";
import {
  createUlcTrainingPlanService,
  type UlcTrainingPlanOverviewReader,
  type UlcTrainingPlanService,
} from "./training-plans-service";
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
  trainingBlocksAccess: UlcLinzTrainingBlocksAccessService;
  trainingPlansAccess: UlcLinzTrainingPlansAccessService;
  kindertrainingAccess: UlcLinzKindertrainingAccessService;
  selfRegistrationAccess: UlcLinzSelfRegistrationAccessService;
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
    | "createAthleteContact"
    | "updateAthleteContact"
    | "deleteAthleteContact"
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
  selfRegistration: ReturnType<typeof createUlcSelfRegistrationService>;
  u12: ReturnType<typeof createUlcU12Service>;
  exerciseCatalog: ReturnType<typeof createUlcExerciseCatalogService>;
  trainingBlocks: UlcTrainingBlockService;
  trainingPlans: UlcTrainingPlanService;
  exerciseCatalogRuntimeMode: UlcExerciseCatalogRuntimeMode;
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
    const trainingBlocksAccess = createUlcLinzTrainingBlocksAccessService({
      sql: applicationSql,
      permissions,
      memberships: scopes,
      subjectScopes: scopes,
      securityEvents,
    });
    const trainingPlansAccess = createUlcLinzTrainingPlansAccessService({
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
    const selfRegistrationAccess =
      createUlcLinzSelfRegistrationAccessService({
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
      createAthleteContact(
        organizationId: string,
        athleteId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["createAthleteContact"]
        >[2],
      ) {
        return athleteMasterdataRepository.createAthleteContact(
          organizationId,
          athleteId,
          input,
        );
      },
      updateAthleteContact(
        organizationId: string,
        athleteId: string,
        contactId: string,
        input: Parameters<
          PostgresAthleteMasterdataRepository["updateAthleteContact"]
        >[3],
      ) {
        return athleteMasterdataRepository.updateAthleteContact(
          organizationId,
          athleteId,
          contactId,
          input,
        );
      },
      deleteAthleteContact(
        organizationId: string,
        athleteId: string,
        contactId: string,
      ) {
        return athleteMasterdataRepository.deleteAthleteContact(
          organizationId,
          athleteId,
          contactId,
        );
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
    const selfRegistration = createUlcSelfRegistrationService({
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
    const trainingBlocks = createUlcTrainingBlockService({
      blocks: new TrainingBlockService({
        repository: new PostgresTrainingBlockRepository(applicationSql),
      }),
      masterdata: athleteMasterdata,
      exerciseCatalog: new PostgresExerciseCatalogRepository(applicationSql),
    });
    const trainingPlans = createUlcTrainingPlanService({
      plans: new TrainingPlanService({
        repository: new PostgresTrainingPlanRepository(applicationSql),
      }),
      masterdata: athleteMasterdata,
      exerciseCatalog: new PostgresExerciseCatalogRepository(applicationSql),
      attendance: trainingSessions,
      blocks: trainingBlocks,
      overview: createTrainingPlanOverviewReader(applicationSql),
    });
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      countdownAccess,
      athletesAccess,
      exerciseCatalogAccess,
      trainingBlocksAccess,
      trainingPlansAccess,
      kindertrainingAccess,
      selfRegistrationAccess,
      u12Access,
      trainerIdentityAccess,
      trainerIdentityLinks,
      trainerUserProvisioning,
      athleteMasterdata,
      kindertraining,
      selfRegistration,
      u12,
      exerciseCatalog,
      trainingBlocks,
      trainingPlans,
      exerciseCatalogRuntimeMode:
        options.exerciseCatalogRuntimeMode ?? "legacy",
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

function createTrainingPlanOverviewReader(client: {
  unsafe(
    query: string,
    parameters?: Array<string | number | boolean | null>,
  ): PromiseLike<readonly Record<string, unknown>[]>;
}): UlcTrainingPlanOverviewReader {
  return Object.freeze({
    async listSummaries(
      organizationId: string,
      subjectIds: readonly string[],
      fromDate: string,
      toDate: string,
    ) {
      if (subjectIds.length === 0) return Object.freeze([]);
      const subjectPlaceholders = subjectIds
        .map((_, index) => "$" + String(index + 2))
        .join(", ");
      const fromPlaceholder = "$" + String(subjectIds.length + 2);
      const toPlaceholder = "$" + String(subjectIds.length + 3);
      const rows = await client.unsafe(
        `SELECT
           plan.id AS plan_id,
           plan.subject_id,
           to_char(plan.plan_date, 'YYYY-MM-DD') AS plan_date,
           COALESCE(
             SUM(
               CASE
                 WHEN item.item_kind = 'block'
                   THEN COALESCE(item.duration_minutes, 0)
                 ELSE 0
               END
             ),
             0
           ) AS duration_minutes,
           COUNT(*) FILTER (WHERE item.item_kind = 'exercise')::int AS exercise_count
         FROM appbasis_training_plan AS plan
         LEFT JOIN appbasis_training_plan_revision_item AS item
           ON item.organization_id = plan.organization_id
          AND item.plan_id = plan.id
          AND item.revision = plan.current_revision
         WHERE plan.organization_id = $1
           AND plan.subject_id IN (${subjectPlaceholders})
           AND plan.plan_date >= ${fromPlaceholder}::date
           AND plan.plan_date <= ${toPlaceholder}::date
         GROUP BY plan.id, plan.subject_id, plan.plan_date
         ORDER BY plan.subject_id ASC, plan.plan_date ASC, plan.id ASC`,
        [organizationId, ...subjectIds, fromDate, toDate],
      );
      return Object.freeze(
        rows.map((row) =>
          Object.freeze({
            subjectId: trainingPlanOverviewString(row.subject_id, "subject id"),
            planDate: trainingPlanOverviewDate(row.plan_date),
            planId: trainingPlanOverviewString(row.plan_id, "plan id"),
            durationMinutes: trainingPlanOverviewInteger(
              row.duration_minutes,
              "duration",
            ),
            exerciseCount: trainingPlanOverviewInteger(
              row.exercise_count,
              "exercise count",
            ),
          }),
        ),
      );
    },
    async listAttendanceSummaries(
      organizationId: string,
      groupId: string,
      subjectIds: readonly string[],
      fromDate: string,
      toDate: string,
    ) {
      if (subjectIds.length === 0) return Object.freeze([]);
      const subjectPlaceholders = subjectIds
        .map((_, index) => "$" + String(index + 3))
        .join(", ");
      const fromPlaceholder = "$" + String(subjectIds.length + 3);
      const toPlaceholder = "$" + String(subjectIds.length + 4);
      const rows = await client.unsafe(
        `SELECT
           attendance.athlete_id AS subject_id,
           to_char(session.session_date, 'YYYY-MM-DD') AS session_date,
           attendance.status
         FROM ulc_linz_training_attendance AS attendance
         INNER JOIN ulc_linz_training_session AS session
           ON session.id = attendance.session_id
          AND session.organization_id = attendance.organization_id
         WHERE attendance.organization_id = $1
           AND session.group_id = $2
           AND session.state = 'scheduled'
           AND attendance.athlete_id IN (${subjectPlaceholders})
           AND session.session_date >= ${fromPlaceholder}::date
           AND session.session_date <= ${toPlaceholder}::date
         ORDER BY
           attendance.athlete_id ASC,
           session.session_date ASC,
           attendance.status ASC,
           session.id ASC`,
        [organizationId, groupId, ...subjectIds, fromDate, toDate],
      );
      return Object.freeze(
        rows.map((row) =>
          Object.freeze({
            subjectId: trainingPlanOverviewString(row.subject_id, "subject id"),
            sessionDate: trainingPlanOverviewDate(row.session_date),
            status: trainingPlanOverviewAttendanceStatus(row.status),
          }),
        ),
      );
    },
  });
}

function trainingPlanOverviewString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`Training plan overview returned invalid ${label}.`);
  }
  return value;
}

function trainingPlanOverviewDate(value: unknown): string {
  const result = trainingPlanOverviewString(value, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error("Training plan overview returned invalid date.");
  }
  return result;
}

function trainingPlanOverviewAttendanceStatus(
  value: unknown,
): "open" | "present" | "excused" | "absent" {
  if (
    value === "open" ||
    value === "present" ||
    value === "excused" ||
    value === "absent"
  ) {
    return value;
  }
  throw new Error("Training plan overview returned invalid attendance status.");
}

function trainingPlanOverviewInteger(value: unknown, label: string): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Training plan overview returned invalid ${label}.`);
  }
  return number;
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
