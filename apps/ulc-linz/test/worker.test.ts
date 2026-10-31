import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import { InMemoryPermissionStore } from "@appbasis/permissions";
import { createAthletesWorkbook } from "@appbasis/athletes";
import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";


import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import {
  createUlcExerciseCatalogWorkbook,
} from "../worker/exercise-catalog-exchange";
import { createGeneratedWorker } from "../worker/index";
import type { GeneratedPostgresApplicationRuntime } from "../worker/postgres";
import { UlcTrainingSessionConflictError } from "../worker/training-session-postgres";
import { TrainingBlockConflictError } from "@appbasis/training-blocks";
import { TrainingPlanConflictError } from "@appbasis/training-plans";
import {
  InMemoryTrainingDocumentationRepository,
  TrainingDocumentationService,
} from "@appbasis/training-documentation";
import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

const currentIdentity = {
  identity: {
    identityId: "identity-worker-1",
    username: "worker.user",
    displayName: "Worker User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=worker-test-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    return sessionToken === currentIdentity.sessionToken ? currentIdentity : null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

function kindertrainingOrganizationAccess(organizationId: string) {
  return Object.freeze({
    organizationId,
    actorPrincipalId: currentIdentity.identity.identityId,
    scope: "organization" as const,
  });
}

function kindertrainingTrainerAccess(
  organizationId: string,
  trainerId: string,
  groupIds: readonly string[],
) {
  return Object.freeze({
    organizationId,
    actorPrincipalId: currentIdentity.identity.identityId,
    scope: "trainer" as const,
    trainerId,
    groupIds: Object.freeze([...groupIds]),
  });
}

function u12OrganizationAccess(organizationId: string) {
  return Object.freeze({
    organizationId,
    actorPrincipalId: currentIdentity.identity.identityId,
    scope: "organization" as const,
  });
}

function u12TrainerAccess(
  organizationId: string,
  trainerId: string,
  groupIds: readonly string[],
) {
  return Object.freeze({
    organizationId,
    actorPrincipalId: currentIdentity.identity.identityId,
    scope: "trainer" as const,
    trainerId,
    groupIds: Object.freeze([...groupIds]),
  });
}

const validEnv = Object.freeze({
  HYPERDRIVE: Object.freeze({
    connectionString: "postgresql://user:password@database.example.test/appbasis",
  }),
  SECURITY_LOG_HYPERDRIVE: Object.freeze({
    connectionString:
      "postgresql://security_ingest:password@database.example.test/appbasis",
  }),
  APPBASIS_BASE_URL: "https://ulc.example.test",
  BETTER_AUTH_SECRET: "worker-runtime-test-secret-00000000000000",
});

function runtime(
  close = async () => {},
  flush = async () => {},
  countdownAccess: GeneratedPostgresApplicationRuntime["countdownAccess"] = {
    async assertViewAccess() {
      return { organizationId: "verein-1", canEdit: true };
    },
  },
  athletesAccess: GeneratedPostgresApplicationRuntime["athletesAccess"] = {
    async assertViewAccess() {
      return { organizationId: "verein-1", canEdit: true };
    },
    async assertEditAccess() {
      return { organizationId: "verein-1", canEdit: true };
    },
  },
  athleteMasterdata: GeneratedPostgresApplicationRuntime["athleteMasterdata"] = {
    async readOrganizationSnapshot() {
      return {
        trainingGroups: [],
        athletes: [],
        athleteContacts: [],
        trainers: [],
        athleteGroupMemberships: [],
        trainerGroupMemberships: [],
      };
    },
    async createTrainingGroup(organizationId, input) {
      return {
        id: "group-test",
        organizationId,
        name: input.name,
        shortName: input.shortName ?? null,
        description: input.description ?? null,
        attendanceMode: input.attendanceMode ?? "trainer_roll_call",
        isActive: true,
        sortOrder: input.sortOrder ?? 100,
      };
    },
    async createAthlete(organizationId, input) {
      return {
        id: "athlete-test",
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: input.birthYear ?? null,
        notes: input.notes ?? null,
        isActive: true,
      };
    },
    async createAthleteContact(organizationId, athleteId, input) {
      return {
        id: "contact-test",
        organizationId,
        athleteId,
        contactName: input.contactName,
        relationship: input.relationship ?? null,
        phone: input.phone,
        isEmergency: input.isEmergency ?? true,
        priority: input.priority ?? 1,
        notes: input.notes ?? null,
      };
    },
    async updateAthleteContact(organizationId, athleteId, contactId, input) {
      return {
        id: contactId,
        organizationId,
        athleteId,
        contactName: input.contactName,
        relationship: input.relationship ?? null,
        phone: input.phone,
        isEmergency: input.isEmergency ?? true,
        priority: input.priority ?? 1,
        notes: input.notes ?? null,
      };
    },
    async deleteAthleteContact() {
      return true;
    },
    async createTrainer(organizationId, input) {
      return {
        id: "trainer-test",
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
        isActive: true,
      };
    },
    async updateTrainingGroup(organizationId, groupId, input) {
      return {
        id: groupId,
        organizationId,
        name: input.name,
        shortName: input.shortName,
        description: input.description,
        attendanceMode: input.attendanceMode,
        isActive: true,
        sortOrder: input.sortOrder,
      };
    },
    async updateAthlete(organizationId, athleteId, input) {
      return {
        id: athleteId,
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: input.birthYear,
        notes: input.notes,
        isActive: true,
      };
    },
    async updateAthleteIfUnchanged(
      organizationId,
      athleteId,
      _expected,
      input,
    ) {
      return {
        id: athleteId,
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: input.birthYear,
        notes: input.notes,
        isActive: true,
      };
    },
    async updateTrainer(organizationId, trainerId, input) {
      return {
        id: trainerId,
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        email: input.email,
        notes: input.notes,
        isActive: true,
      };
    },
    async createAthleteGroupMembership(organizationId, input) {
      return {
        organizationId,
        athleteId: input.athleteId,
        groupId: input.groupId,
        startedOn: input.startedOn,
        endedOn: input.endedOn ?? null,
      };
    },
    async createTrainerGroupMembership(organizationId, input) {
      return {
        organizationId,
        trainerId: input.trainerId,
        groupId: input.groupId,
      };
    },
    async deactivateAthlete() {
      return true;
    },
    async deactivateTrainer() {
      return true;
    },
    async reactivateAthlete() {
      return true;
    },
    async reactivateTrainer() {
      return true;
    },
  },
  kindertrainingAccess: GeneratedPostgresApplicationRuntime["kindertrainingAccess"] = {
    async assertViewAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
    async assertEditAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
  },
  selfRegistrationAccess: GeneratedPostgresApplicationRuntime["selfRegistrationAccess"] = {
    async assertViewAccess() {
      return {
        organizationId: "verein-1",
        actorPrincipalId: currentIdentity.identity.identityId,
        athleteId: "athlete-self",
      };
    },
    async assertEditAccess() {
      return {
        organizationId: "verein-1",
        actorPrincipalId: currentIdentity.identity.identityId,
        athleteId: "athlete-self",
      };
    },
  },
  kindertraining: GeneratedPostgresApplicationRuntime["kindertraining"] = {
    async listGroups() {
      return [
        {
          id: "group-test",
          name: "Kindertraining",
          shortName: "KT",
          attendanceMode: "trainer_roll_call",
        },
      ];
    },
    async readSnapshot(_organizationId, groupId, sessionDate) {
      return {
        group: {
          id: groupId,
          name: "Kindertraining",
          shortName: "KT",
          attendanceMode: "trainer_roll_call",
        },
        sessionDate,
        session: null,
        participants: [],
      };
    },
    async saveSession(_organizationId, input) {
      return {
        group: {
          id: input.groupId,
          name: "Kindertraining",
          shortName: "KT",
          attendanceMode: "trainer_roll_call",
        },
        sessionDate: input.sessionDate,
        session: {
          id: "session-test",
          revision: "1",
          state: input.state ?? "scheduled",
          note: input.note ?? null,
        },
        participants: input.attendance.map((entry) => ({
          athleteId: entry.athleteId,
          firstName: "Test",
          lastName: "Athlet",
          birthYear: null,
          intention: "unknown",
          registrationRevision: null,
          status: entry.status,
        })),
      };
    },
  },
  selfRegistration: GeneratedPostgresApplicationRuntime["selfRegistration"] = {
    async listOptions(_organizationId, _athleteId, sessionDate) {
      return [
        {
          group: { id: "group-self", name: "Selbstanmeldung", shortName: "SA" },
          sessionDate,
          sessionState: null,
          intention: "unknown",
          revision: null,
        },
      ];
    },
    async save(_organizationId, _athleteId, _actorIdentityId, input) {
      return {
        group: { id: input.groupId, name: "Selbstanmeldung", shortName: "SA" },
        sessionDate: input.sessionDate,
        sessionState: "scheduled",
        intention: input.intention,
        revision:
          input.expectedRevision === null ? 1 : input.expectedRevision + 1,
      };
    },
  },
  u12Access: GeneratedPostgresApplicationRuntime["u12Access"] = {
    async assertViewAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
    async assertEditAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
  },
  u12: GeneratedPostgresApplicationRuntime["u12"] = {
    async listGroups() {
      return [{ id: "group-u12", name: "U12", shortName: "U12" }];
    },
    async readSnapshot(_organizationId, groupId, sessionDate) {
      return {
        group: { id: groupId, name: "U12", shortName: "U12" },
        sessionDate,
        session: null,
        participants: [],
      };
    },
    async saveSession(_organizationId, input) {
      return {
        group: { id: input.groupId, name: "U12", shortName: "U12" },
        sessionDate: input.sessionDate,
        session: {
          id: "session-u12-test",
          revision: "1",
          state: input.state ?? "scheduled",
          note: input.note ?? null,
        },
        participants: input.attendance.map((entry) => ({
          athleteId: entry.athleteId,
          firstName: "Test",
          lastName: "Athlet",
          birthYear: null,
          status: entry.status,
        })),
      };
    },
  },
): GeneratedPostgresApplicationRuntime {
  return {
    identity,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [],
      roles: [],
      principals: [],
    }),
    countdownAccess,
    athletesAccess,
    exerciseCatalogAccess: {
      async assertViewAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
      async assertEditAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
    },
    trainingBlocksAccess: {
      async assertViewAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
      async assertEditAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
    },
    trainingPlansAccess: {
      async assertViewAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
      async assertEditAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          canEdit: true,
        };
      },
    },
    trainingDocumentationAccess: {
      async assertViewAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          subjectId: null,
          canEdit: true,
        };
      },
      async assertEditAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: currentIdentity.identity.identityId,
          subjectId: null,
          canEdit: true,
        };
      },
    },
    kindertrainingAccess,
    selfRegistrationAccess,
    u12Access,
    trainerIdentityAccess: {
      async assertAdminAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: "identity-worker-1",
        };
      },
    },
    userAdminAccess: {
      async read(_organizationId, userId) {
        return {
          userId,
          username: "test.trainer",
          modules: [{ key: "countdown", label: "Countdown", level: "view" as const }],
          expectedGrants: [],
          expectedRevokes: [],
        };
      },
      async update(_organizationId, _actorPrincipalId, userId) {
        return {
          userId,
          username: "test.trainer",
          modules: [{ key: "countdown", label: "Countdown", level: "edit" as const }],
          expectedGrants: [],
          expectedRevokes: [],
        };
      },
    },
    userAdminOverview: {
      async listUsers() {
        return [
          {
            identityId: "identity-worker-1",
            username: "admin.worker",
            displayName: "Worker Admin",
            sourceRole: "admin",
            subjectId: "admin-subject",
            active: true,
            blocked: false,
          },
        ];
      },
    },
    trainerIdentityLinks: {
      async listBindings() {
        return [];
      },
      async bindTrainer(input) {
        return {
          identityId: input.identityId,
          username: "trainer.user",
          displayName: "Trainer User",
          trainerId: input.trainerId,
        };
      },
    },
    trainerUserProvisioning: {
      async createTrainerUser(input) {
        return {
          identityId: "identity-created",
          username: input.username,
          displayName: input.displayName,
          trainerId: input.trainerId,
          mustChangePassword: true,
        };
      },
    },
    athleteUserProvisioning: {
      async createAthleteUser(input) {
        return {
          identityId: "identity-athlete-created",
          username: input.username,
          displayName: input.displayName,
          athleteId: input.athleteId,
          mustChangePassword: true,
        };
      },
    },
    athleteMasterdata,
    kindertraining,
    selfRegistration,
    u12,
    trainingBlocks: {
      async listAudiences() {
        return [];
      },
      async list() {
        return [];
      },
      async listOverview() {
        return [];
      },
      async findCurrent() {
        return undefined;
      },
      async findOverview() {
        return undefined;
      },
      async setFavorite() {
        return false;
      },
      async recordUsageOnce() {
        return undefined;
      },
      async create() {
        throw new Error("training-block mock create is not wired to an E7A3 HTTP route");
      },
      async duplicate() {
        return undefined;
      },
      async update() {
        throw new Error("training-block mock update is not wired to an E7A3 HTTP route");
      },
      async deactivate() {
        return undefined;
      },
      async reactivate() {
        return undefined;
      },
      async deleteUnused() {
        return false;
      },
      async listRevisions() {
        return [];
      },
      async findRevision() {
        return undefined;
      },
      async compareRevisions() {
        return undefined;
      },
    },
    trainingPlans: {
      async listSubjects() {
        return [];
      },
      async listOverviewGroups() {
        return [];
      },
      async groupWeekOverview(_organizationId, groupId, weekStart) {
        return {
          group: { id: groupId, name: groupId, shortName: null },
          weekStart,
          weekEnd: weekStart,
          dates: [],
          rows: [],
        };
      },
      async listForSubjectDateRange() {
        return [];
      },
      async listAttendanceForSubjectDateRange() {
        return [];
      },
      async listBlockTemplates() {
        return [];
      },
      async findBlockTemplate() {
        return undefined;
      },
      async listBlockTemplateAudiences() {
        return [];
      },
      async saveBlockAsTemplate() {
        return undefined;
      },
      async findCurrent() {
        return undefined;
      },
      async findCurrentBySubjectDate() {
        return undefined;
      },
      async create() {
        throw new Error("training-plan mock create is not wired to an E7B3 HTTP route");
      },
      async update() {
        return undefined;
      },
      async copyCurrentTo() {
        return undefined;
      },
      async listRevisions() {
        return [];
      },
      async findRevision() {
        return undefined;
      },
    },
    trainingDocumentation: new TrainingDocumentationService({
      repository: new InMemoryTrainingDocumentationRepository(),
    }),
    exerciseCatalogRuntimeMode: "standard-module",
    exerciseCatalogMediaStore: null,
    exerciseCatalog: {
      async list() {
        return { items: [], trainingGroups: [] };
      },
      async read() {
        return null;
      },
      async create(organizationId, _identityId, input) {
        return {
          id: "exercise-worker-1",
          organizationId,
          name: input.name,
          categoryKey: input.categoryKey,
          subcategory: input.subcategory ?? null,
          difficultyKey: input.difficultyKey ?? null,
          goal: input.goal ?? null,
          description: input.description ?? null,
          coachingCues: input.coachingCues ?? null,
          commonMistakes: input.commonMistakes ?? null,
          equipment: input.equipment ?? [],
          videoUrl: input.videoUrl ?? input.videoUrls?.[0] ?? null,
          videoUrls:
            input.videoUrls ??
            (input.videoUrl === undefined || input.videoUrl === null
              ? []
              : [input.videoUrl]),
          groupIds: input.groupIds ?? [],
          similarExerciseIds: input.similarExerciseIds ?? [],
          parameters: [],
          isActive: true,
          isFavorite: false,
        };
      },
      async update(organizationId, _identityId, exerciseId, input) {
        return {
          id: exerciseId,
          organizationId,
          name: input.name,
          categoryKey: input.categoryKey,
          subcategory: input.subcategory ?? null,
          difficultyKey: input.difficultyKey ?? null,
          goal: input.goal ?? null,
          description: input.description ?? null,
          coachingCues: input.coachingCues ?? null,
          commonMistakes: input.commonMistakes ?? null,
          equipment: input.equipment ?? [],
          videoUrl: input.videoUrl ?? input.videoUrls?.[0] ?? null,
          videoUrls:
            input.videoUrls ??
            (input.videoUrl === undefined || input.videoUrl === null
              ? []
              : [input.videoUrl]),
          groupIds: input.groupIds ?? [],
          similarExerciseIds: input.similarExerciseIds ?? [],
          parameters: [],
          isActive: true,
          isFavorite: false,
        };
      },
      async deactivate() {},
      async reactivate() {
        return;
      },
      async findDuplicateCandidates() {
        return [];
      },
      async listUsageSummaries() {
        return [];
      },
      async listUsage() {
        return [];
      },
      async recordUsage() {
        return undefined;
      },
      async listPrivateMedia() {
        return [];
      },
      async registerPrivateMedia() {
        return undefined;
      },
      async requestPrivateMediaDeletion() {
        return undefined;
      },
      async completePrivateMediaDeletion() {
        return false;
      },
      async setFavorite(organizationId, _identityId, exerciseId, favorite) {
        return {
          id: exerciseId,
          organizationId,
          name: "Sprint",
          categoryKey: "acceleration",
          subcategory: null,
          difficultyKey: null,
          goal: null,
          description: null,
          coachingCues: null,
          commonMistakes: null,
          equipment: [],
          videoUrl: null,
          videoUrls: [],
          groupIds: [],
          similarExerciseIds: [],
          parameters: [],
          isActive: true,
          isFavorite: favorite,
        };
      },
    },
    securityEvents: {
      record() {},
      flush,
    },
    close,
  };
}

describe("generated identity+permissions Worker entrypoint", () => {
  it("serves the mobile ULC Vereins-App shell without creating a database runtime", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for static UI");
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/"),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    const html = await response.text();
    expect(html).toContain("Dein Vereinsbereich für Training und Organisation.");
    expect(html).toContain("Intervall-Countdown");
    expect(html).toContain('data-app-section="home"');
    expect(runtimeCalls).toBe(0);
  });

  it("ships browser JavaScript that parses as standalone module-compatible code", () => {
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("opens the authenticated app on the dashboard and gates each module navigation independently", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="home"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="masterdata" data-nav-priority="7" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="registration" data-nav-priority="1" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="kindertraining" data-nav-priority="2" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="useful" data-nav-priority="8" hidden disabled');
    expect(ULC_LINZ_APP_HTML).not.toContain('data-nav-view="settings"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="countdown"');
    expect(ULC_LINZ_APP_HTML).toContain('class="card countdown-settings"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('showAppSection("home");');
    expect(ULC_LINZ_APP_SCRIPT).toContain("async function navigateAppSection(section)");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'current === "training-plans" &&\n    section !== "training-plans"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const closed = await closeTrainingPlanEditor(false);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshAppAvailability();");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.countdownQuickAction.disabled = !countdownReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.masterdataQuickAction.disabled = !masterdataReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.registrationQuickAction.disabled = !selfRegistrationReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.kindertrainingQuickAction.disabled = !kindertrainingReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '(section === "masterdata" && masterdataReady)',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '(section === "registration" && selfRegistrationReady)',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '(section === "kindertraining" && kindertrainingReady)',
    );
  });


  it("ships training-block mobile UI with explicit version commits, group filter, history and parity metadata", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="training-blocks" data-nav-priority="6" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain("<h1>Trainingsblöcke</h1>");
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-editor"');
    expect(ULC_LINZ_APP_HTML).toContain('minlength="1" maxlength="120"');
    expect(ULC_LINZ_APP_HTML).toContain('maxlength="3000"');
    expect(ULC_LINZ_APP_HTML).toContain('max="2147483647"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-save-state"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-save"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-audience-filter"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-audience" role="group"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('dataset.trainingBlockAudienceId');
    expect(ULC_LINZ_APP_HTML).toContain("Neue Version erst beim Speichern.");
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-retry"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-exercise-picker"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-history-load"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-favorite"');
    expect(ULC_LINZ_APP_HTML).toContain('id="training-block-usage-info"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('requestJson("/api/modules/training-blocks")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/update"');
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("function scheduleTrainingBlockSave()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockChangeVersion !== saveVersion");
    expect(ULC_LINZ_APP_SCRIPT).toContain('trainingBlockElements.save?.addEventListener("click"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('setTrainingBlockSaveState("draft", "Ungespeichert")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('audience === "clubwide"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('block.revision.audienceIds.includes(audience)');
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (!force && trainingBlockSaveBusy)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("retryTrainingBlockSave");
    expect(ULC_LINZ_APP_SCRIPT).toContain("!trainingBlockDirty && !trainingBlockSaveBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshTrainingBlockCatalogDependency");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockCreateUncertain");
    expect(ULC_LINZ_APP_SCRIPT).toContain("noteInput.maxLength = 2000");
    expect(ULC_LINZ_APP_SCRIPT).toContain("input.maxLength = 500");
    expect(ULC_LINZ_APP_SCRIPT).toContain("TRAINING_BLOCK_INACTIVE");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockDeactivateBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockOpenRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("requestId !== trainingBlockOpenRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("isCurrentTrainingBlockSelection");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockHistoryRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockRevisionRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockCompareRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshTrainingBlockAudienceDependency");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockAudienceRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("invalidateTrainingBlockOverviewRefresh");
    expect(ULC_LINZ_APP_SCRIPT).toContain("invalidateTrainingBlockComparison");
    expect(ULC_LINZ_APP_SCRIPT).toContain('compareFrom?.addEventListener("change", invalidateTrainingBlockComparison)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('compareTo?.addEventListener("change", invalidateTrainingBlockComparison)');
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlocks = payload.blocks.slice()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("!payload.blocks.every(isTrainingBlockSnapshot)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockReloadBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("await openTrainingBlock(id, true)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Aktueller Stand wird geladen");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockDraft && !allowReload");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Bitte den geöffneten Trainingsblock zuerst schließen");
    expect(ULC_LINZ_APP_SCRIPT).toContain("reloaded = await openTrainingBlock(id, true)");
    expect(ULC_LINZ_APP_SCRIPT).toContain('setTrainingBlockSaveState("conflict", "Neu laden fehlgeschlagen")');
    expect(ULC_LINZ_APP_SCRIPT).toContain("Der aktuelle Stand konnte nicht geladen werden. Bitte erneut versuchen.");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockDeactivateBusy ||");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockReloadBusy ||");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockFavoriteBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshTrainingBlockEditorLock();");
    expect(ULC_LINZ_APP_SCRIPT).toContain("operationId !== trainingBlockRevisionRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("operationId !== trainingBlockHistoryRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("operationId !== trainingBlockCompareRequestId");
    expect(ULC_LINZ_APP_SCRIPT).toContain("const blockId = trainingBlockSelected.id");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (!force && trainingBlockCreateUncertain)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("syncTrainingBlockItemIds(response.block);\n    resetTrainingBlockHistory();");
    expect(ULC_LINZ_APP_SCRIPT).toContain('setTrainingBlockSaveState("error", "Archivieren fehlgeschlagen")');
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockElements.close.disabled = locked");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("locked || control.disabled");
    expect(ULC_LINZ_APP_SCRIPT).toContain("error.status >= 400");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockParameterError");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Diese Übung ist archiviert");
    expect(ULC_LINZ_APP_SCRIPT).toContain("training-block-exercise--unavailable");
    expect(ULC_LINZ_APP_SCRIPT).toContain("EXERCISE_DIFFICULTIES.find");
    expect(ULC_LINZ_APP_HTML).toContain('data-training-block-info-tab="videos"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/private-media"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('link.rel = "noopener noreferrer"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockStepAligned");
    expect(ULC_LINZ_APP_SCRIPT).toContain("veraltete(r) Parameterwert(e)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("currentKeys === null || currentKeys.has(value.key)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockDraft.exercises.length >= 200");
    expect(ULC_LINZ_APP_SCRIPT).toContain("lokale Änderungen mit einem Versionskonflikt");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Der Block könnte bereits gespeichert sein");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (trainingBlockDirty) {\n    await saveTrainingBlock();");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockSaveBusy ||\n    trainingBlockReloadBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("TRAINING_BLOCK_CONFLICT");
    expect(ULC_LINZ_APP_SCRIPT).toContain("dataset.trainingBlockExerciseAction");
    expect(ULC_LINZ_APP_SCRIPT).toContain("renderTrainingBlockComparison");
    expect(ULC_LINZ_APP_SCRIPT).toContain("fetchTrainingBlockRevision(blockId, from)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("training-block-comparison-row");
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/favorite"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("features?.favorites !== true");
    expect(ULC_LINZ_APP_SCRIPT).toContain("features?.usageSummary !== true");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Noch nicht verwendet");
    expect(ULC_LINZ_APP_SCRIPT).toContain("block.isFavorite ? \"★ Favorit\" : null");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (trainingBlockFavoriteBusy) {\n    trainingBlockSavePending = true;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockSaveBusy ||\n    trainingBlockDeactivateBusy ||\n    trainingBlockReloadBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockElements.save.disabled =");
    expect(ULC_LINZ_APP_SCRIPT).toContain("invalidateTrainingBlockOverviewRefresh();\n    trainingBlockSelected = {");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockSaveBusy ||\n    trainingBlockFavoriteBusy ||");
    expect(ULC_LINZ_APP_SCRIPT).toContain("trainingBlockDeactivateBusy ||\n    trainingBlockDuplicateBusy ||\n    trainingBlockReloadBusy ||\n    trainingBlockFavoriteBusy");
    expect(ULC_LINZ_APP_SCRIPT).toContain("!trainingBlockFavoriteBusy &&\n    trainingBlockSelected?.isActive !== false");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("actorPrincipalId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("ships the E3A Stammdaten UI on the existing server-authorized API contract", () => {
    expect(ULC_LINZ_APP_HTML).toContain("<h1>Stammdaten</h1>");
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="athletes"');
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="trainers"');
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="groups"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-overlay"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-overlay"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("bindMasterdataSwipe");
    expect(ULC_LINZ_APP_SCRIPT).toContain("openMasterdataTrainerIdentity");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/athletes")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/athletes/masterdata")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/athletes"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/trainers"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/training-groups"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("document.createElement");
    expect(ULC_LINZ_APP_SCRIPT).toContain(".textContent = description.title");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
  });

  it("ships E3B group assignments and lifecycle actions without client-owned organization scope", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-group-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-group-athlete"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-group-group"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-group-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-group-trainer"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-group-group"');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/athlete-group-memberships"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/trainer-group-memberships"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/deactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("window.confirm");
    expect(ULC_LINZ_APP_SCRIPT).toContain("snapshot.athleteGroupMemberships");
    expect(ULC_LINZ_APP_SCRIPT).toContain("snapshot.trainerGroupMemberships");
    expect(ULC_LINZ_APP_SCRIPT).toContain("item?.isActive !== false");
    expect(ULC_LINZ_APP_SCRIPT).toContain(".textContent = description.meta");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("ships E3C editing through the existing forms and server-owned update routes", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-edit-cancel"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-edit-cancel"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-edit-cancel"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("beginMasterdataEdit");
    expect(ULC_LINZ_APP_SCRIPT).toContain("cancelMasterdataEdit");
    expect(ULC_LINZ_APP_SCRIPT).toContain('"Athlet bearbeiten"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"Trainer bearbeiten"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"Trainingsgruppe bearbeiten"');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/athletes/" + encodeURIComponent(editId) + "/update"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/trainers/" + encodeURIComponent(editId) + "/update"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/masterdata/training-groups/" + encodeURIComponent(editId) + "/update"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("return true;");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("ships the countdown controls and domain-backed plan integration in static assets", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("/api/modules/countdown/plan");
    expect(ULC_LINZ_APP_SCRIPT).toContain("speechSynthesis");
    expect(ULC_LINZ_APP_SCRIPT).toContain("navigator.wakeLock");
    expect(ULC_LINZ_APP_SCRIPT).toContain("localStorage");
    expect(ULC_LINZ_APP_SCRIPT).toContain('runMode === "paused" ? "Weiter" : "Pause"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('timerHint.textContent = "3, 2, 1 – Los"');
    expect(ULC_LINZ_APP_CSS).toContain('[data-phase="work"]');
    expect(ULC_LINZ_APP_CSS).toContain('[data-phase="rest"]');
  });

  it("serializes initial session restoration before login interaction", () => {
    const restoreIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function restoreSession()",
    );
    const loginIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function handleLogin(event)",
      restoreIndex,
    );
    const restoreBody = ULC_LINZ_APP_SCRIPT.slice(restoreIndex, loginIndex);
    const busyIndex = restoreBody.indexOf("setBusy(true);");
    const sessionRequestIndex = restoreBody.indexOf(
      'requestJson("/api/auth/session")',
    );

    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(busyIndex).toBeGreaterThanOrEqual(0);
    expect(busyIndex).toBeLessThan(sessionRequestIndex);
    expect(restoreBody).toContain("finally {");
    expect(restoreBody).toContain("setBusy(false);");
  });

  it("freezes countdown settings before the plan request and keeps wake lock best effort", () => {
    const startCountdownIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function startCountdown()",
    );
    const lockSettingsIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "lockSettings(true);",
      startCountdownIndex,
    );
    const planRequestIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      'requestJson("/api/modules/countdown/plan"',
      startCountdownIndex,
    );
    const startTickerIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "startTicker();",
      startCountdownIndex,
    );
    const wakeLockIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "void acquireWakeLock();",
      startTickerIndex,
    );
    const togglePauseIndex = ULC_LINZ_APP_SCRIPT.indexOf(
      "function togglePause()",
      startCountdownIndex,
    );

    expect(startCountdownIndex).toBeGreaterThanOrEqual(0);
    expect(lockSettingsIndex).toBeGreaterThan(startCountdownIndex);
    expect(lockSettingsIndex).toBeLessThan(planRequestIndex);
    expect(wakeLockIndex).toBeGreaterThan(startTickerIndex);
    expect(
      ULC_LINZ_APP_SCRIPT.slice(startCountdownIndex, togglePauseIndex),
    ).not.toContain("await acquireWakeLock()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("wakeLockRequestId += 1;");
  });

  it("keeps liveness available without database or secret bindings", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for liveness");
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/health"),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      appId: "ulc-linz",
    });
    expect(runtimeCalls).toBe(0);
  });

  it("ends the active identity session through the worker sign-out route", async () => {
    let endedSession = "";
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        identity: {
          ...base.identity,
          async endSession(sessionToken) {
            endedSession = sessionToken;
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/sign-out", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=worker-test-token",
        },
      }),
      validEnv,
    );

    expect(response.status).toBe(204);
    expect(endedSession).toBe(
      "better-auth.session_token=worker-test-token",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("fails closed before runtime creation when required bindings are missing", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      return runtime();
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session"),
      {
        HYPERDRIVE: { connectionString: validEnv.HYPERDRIVE.connectionString },
        APPBASIS_BASE_URL: validEnv.APPBASIS_BASE_URL,
        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RUNTIME_NOT_CONFIGURED" },
    });
    expect(runtimeCalls).toBe(0);
  });

  it("rejects reuse of the application database credential for security-event ingest", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      return runtime();
    });
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session"),
      {
        ...validEnv,
        SECURITY_LOG_HYPERDRIVE: {
          connectionString: validEnv.HYPERDRIVE.connectionString,
        },
      },
    );

    expect(response.status).toBe(503);
    expect(runtimeCalls).toBe(0);
  });

  it("serves the countdown contract only to an authenticated authorized member", async () => {
    let accessCalls = 0;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess(current) {
            accessCalls += 1;
            expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
            return { organizationId: "verein-1", canEdit: true };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(accessCalls).toBe(1);
    await expect(response.json()).resolves.toEqual({
      module: {
        moduleId: "countdown",
        capability: "countdown:view",
      },
      access: {
        view: true,
      },
    });
  });


  it("serves E7A4 training-block overview without client-owned organization scope", async () => {
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingBlocks: {
        ...base.trainingBlocks,
        async listAudiences(organizationId) {
          expect(organizationId).toBe("verein-1");
          return [{ id: "group-u16", name: "U16", shortName: "U16" }];
        },
        async listOverview(organizationId, principalId) {
          expect(organizationId).toBe("verein-1");
          expect(principalId).toBe(currentIdentity.identity.identityId);
          return [{
            block: {
              id: "block-1",
              organizationId,
              isActive: true,
              currentRevision: 2,
              createdAt: "2026-10-10T10:00:00.000Z",
              updatedAt: "2026-10-10T11:00:00.000Z",
              revision: {
                organizationId,
                blockId: "block-1",
                revision: 2,
                name: "Sprint U16",
                audienceId: "group-u16",
                audienceIds: ["group-u16"],
                durationMinutes: 30,
                note: null,
                exercises: [],
                createdAt: "2026-10-10T11:00:00.000Z",
              },
            },
            isFavorite: true,
            usageCount: 3,
            lastUsedAt: "2026-10-10T12:00:00.000Z",
          }];
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-blocks", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      module: {
        moduleId: "training_blocks",
        capabilities: {
          view: "training-blocks:view",
          edit: "training-blocks:edit",
        },
        features: {
          autosave: true,
          revisions: true,
          revisionComparison: true,
          favorites: true,
          usageSummary: true,
        },
      },
      access: { view: true, edit: true },
      audiences: [{ id: "group-u16", name: "U16", shortName: "U16" }],
      blocks: [{
        id: "block-1",
        currentRevision: 2,
        isFavorite: true,
        usageCount: 3,
        lastUsedAt: "2026-10-10T12:00:00.000Z",
        revision: {
          name: "Sprint U16",
          audienceId: "group-u16",
          audienceIds: ["group-u16"],
        },
      }],
    });
    expect(JSON.stringify(payload)).not.toContain("organizationId");
    expect(JSON.stringify(payload)).not.toContain("actorPrincipalId");
  });

  it("creates and updates training blocks only through server-owned scope", async () => {
    const calls: unknown[] = [];
    const base = runtime();
    const snapshot = (revision: number, name: string) => ({
      id: "block-created",
      organizationId: "verein-1",
      isActive: true,
      currentRevision: revision,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T11:00:00.000Z",
      revision: {
        organizationId: "verein-1",
        blockId: "block-created",
        revision,
        name,
        audienceId: "group-u16",
        audienceIds: ["group-u16"],
        durationMinutes: 25,
        note: null,
        exercises: [],
        createdAt: "2026-10-10T11:00:00.000Z",
      },
    });
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingBlocks: {
        ...base.trainingBlocks,
        async create(organizationId, input) {
          calls.push(["create", organizationId, input]);
          return snapshot(1, input.name);
        },
        async update(organizationId, blockId, expectedRevision, input) {
          calls.push([
            "update",
            organizationId,
            blockId,
            expectedRevision,
            input,
          ]);
          return snapshot(expectedRevision + 1, input.name);
        },
        async findOverview(organizationId, principalId, blockId) {
          expect(organizationId).toBe("verein-1");
          expect(principalId).toBe(currentIdentity.identity.identityId);
          expect(blockId).toBe("block-created");
          return {
            block: snapshot(3, "Parallel neuer Stand"),
            isFavorite: true,
            usageCount: 2,
            lastUsedAt: "2026-10-10T12:00:00.000Z",
          };
        },
      },
    }));

    const create = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-blocks", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
        body: JSON.stringify({
          name: "Sprint",
          audienceId: "group-u16",
          durationMinutes: 25,
          note: null,
          exercises: [],
        }),
      }),
      validEnv,
    );
    expect(create.status).toBe(201);

    const update = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-created/update",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
          body: JSON.stringify({
            expectedRevision: 1,
            name: "Sprint neu",
            audienceId: "group-u16",
            durationMinutes: 25,
            note: null,
            exercises: [],
          }),
        },
      ),
      validEnv,
    );
    expect(update.status).toBe(200);
    await expect(update.clone().json()).resolves.toMatchObject({
      block: {
        currentRevision: 2,
        isFavorite: true,
        usageCount: 2,
        revision: { name: "Sprint neu" },
      },
    });
    expect(calls).toEqual([
      [
        "create",
        "verein-1",
        {
          name: "Sprint",
          audienceId: "group-u16",
          durationMinutes: 25,
          note: null,
          exercises: [],
        },
      ],
      [
        "update",
        "verein-1",
        "block-created",
        1,
        {
          name: "Sprint neu",
          audienceId: "group-u16",
          durationMinutes: 25,
          note: null,
          exercises: [],
        },
      ],
    ]);
  });

  it("rejects client-owned training-block scope and surfaces revision conflicts as 409", async () => {
    const badScope = await createGeneratedWorker(() => runtime()).fetch(
      new Request("https://ulc.example.test/api/modules/training-blocks", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
        body: JSON.stringify({
          name: "Nicht erlaubt",
          audienceId: "group-u16",
          organizationId: "verein-fremd",
        }),
      }),
      validEnv,
    );
    expect(badScope.status).toBe(400);
    await expect(badScope.json()).resolves.toMatchObject({
      error: { code: "INVALID_TRAINING_BLOCK" },
    });

    const base = runtime();
    const conflict = await createGeneratedWorker(() => ({
      ...base,
      trainingBlocks: {
        ...base.trainingBlocks,
        async update() {
          throw new TrainingBlockConflictError(2, 3);
        },
      },
    })).fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-1/update",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
          body: JSON.stringify({
            expectedRevision: 2,
            name: "Stale",
            audienceId: "group-u16",
            exercises: [],
          }),
        },
      ),
      validEnv,
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: {
        code: "TRAINING_BLOCK_CONFLICT",
        expectedRevision: 2,
        currentRevision: 3,
      },
    });
  });

  it("toggles a personal training-block favorite through view access only", async () => {
    const calls: unknown[] = [];
    const base = runtime();
    const block = {
      id: "block-favorite",
      organizationId: "verein-1",
      isActive: true,
      currentRevision: 1,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
      revision: {
        organizationId: "verein-1",
        blockId: "block-favorite",
        revision: 1,
        name: "Favorit",
        audienceId: "group-u16",
        audienceIds: ["group-u16"],
        durationMinutes: null,
        note: null,
        exercises: [],
        createdAt: "2026-10-10T10:00:00.000Z",
      },
    };
    let favorite = false;
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingBlocksAccess: {
        ...base.trainingBlocksAccess,
        async assertEditAccess() {
          throw new Error("favorite must not require edit access");
        },
      },
      trainingBlocks: {
        ...base.trainingBlocks,
        async setFavorite(organizationId, principalId, blockId, value) {
          calls.push([organizationId, principalId, blockId, value]);
          favorite = value;
          return true;
        },
        async findOverview() {
          return {
            block,
            isFavorite: favorite,
            usageCount: 4,
            lastUsedAt: "2026-10-10T12:00:00.000Z",
          };
        },
      },
    }));

    const put = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-favorite/favorite",
        {
          method: "PUT",
          headers: { cookie: currentIdentity.sessionToken },
        },
      ),
      validEnv,
    );
    expect(put.status).toBe(200);
    await expect(put.json()).resolves.toMatchObject({
      block: {
        id: "block-favorite",
        isFavorite: true,
        usageCount: 4,
      },
    });

    const del = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-favorite/favorite",
        {
          method: "DELETE",
          headers: { cookie: currentIdentity.sessionToken },
        },
      ),
      validEnv,
    );
    expect(del.status).toBe(200);
    await expect(del.json()).resolves.toMatchObject({
      block: { id: "block-favorite", isFavorite: false },
    });
    expect(calls).toEqual([
      ["verein-1", currentIdentity.identity.identityId, "block-favorite", true],
      ["verein-1", currentIdentity.identity.identityId, "block-favorite", false],
    ]);
  });

  it("serves training-block revision history and comparison read-only", async () => {
    const base = runtime();
    const revision = (number: number) => ({
      organizationId: "verein-1",
      blockId: "block-1",
      revision: number,
      name: "Sprint v" + String(number),
      audienceId: "group-u16",
      audienceIds: ["group-u16"],
      durationMinutes: 30,
      note: null,
      exercises: [],
      createdAt: "2026-10-10T10:00:00.000Z",
    });
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingBlocks: {
        ...base.trainingBlocks,
        async listRevisions() {
          return [revision(1), revision(2)];
        },
        async findRevision(_organizationId, _blockId, number) {
          return revision(number);
        },
        async compareRevisions(_organizationId, _blockId, from, to) {
          return {
            fromRevision: from,
            toRevision: to,
            hasChanges: true,
            changedFields: ["name"],
            addedItemIds: [],
            removedItemIds: [],
            changedItemIds: [],
            reorderedItemIds: [],
          };
        },
      },
    }));

    const revisions = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-1/revisions",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(revisions.status).toBe(200);
    const revisionPayload = await revisions.json();
    expect(revisionPayload.revisions).toHaveLength(2);
    expect(JSON.stringify(revisionPayload)).not.toContain("organizationId");

    const compare = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-blocks/block-1/compare?from=1&to=2",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(compare.status).toBe(200);
    await expect(compare.json()).resolves.toMatchObject({
      comparison: {
        fromRevision: 1,
        toRevision: 2,
        hasChanges: true,
        changedFields: ["name"],
      },
    });
  });

  it("serves exercise catalog overview only after protected server-side authorization", async () => {
    const response = await createGeneratedWorker(() => runtime()).fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      module: {
        moduleId: "exercise_catalog",
        features: {
          difficulty: true,
          similarExercises: true,
          duplicateWarnings: true,
          usageHistory: true,
          multipleExternalVideos: true,
          privateVideoUpload: false,
        },
      },
      access: { view: true, edit: true },
      catalog: { items: [], trainingGroups: [] },
    });
  });

  it("retries private-media deletion after an object-store failure without losing metadata", async () => {
    let requestCalls = 0;
    let objectDeleteCalls = 0;
    let completionCalls = 0;
    let pending = true;

    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        exerciseCatalog: {
          ...base.exerciseCatalog,
          async requestPrivateMediaDeletion(
            organizationId,
            exerciseId,
            mediaId,
          ) {
            requestCalls += 1;
            expect(organizationId).toBe("verein-1");
            expect(exerciseId).toBe("exercise-1");
            expect(mediaId).toBe("media-1");
            if (!pending) return undefined;
            return {
              id: mediaId,
              organizationId,
              exerciseId,
              fileName: "clip.mp4",
              storageKey: "exercise-catalog/verein-1/exercise-1/media-1",
              contentType: "video/mp4",
              sizeBytes: 24,
              createdAt: "2026-10-09T00:00:00.000Z",
            };
          },
          async completePrivateMediaDeletion(
            organizationId,
            exerciseId,
            mediaId,
          ) {
            completionCalls += 1;
            expect(organizationId).toBe("verein-1");
            expect(exerciseId).toBe("exercise-1");
            expect(mediaId).toBe("media-1");
            pending = false;
            return true;
          },
        },
        exerciseCatalogMediaStore: {
          async put() {},
          async get() {
            return null;
          },
          async delete(key) {
            objectDeleteCalls += 1;
            expect(key).toBe(
              "exercise-catalog/verein-1/exercise-1/media-1",
            );
            if (objectDeleteCalls === 1) {
              throw new Error("simulated R2 delete failure");
            }
          },
        },
      };
    });

    const request = () =>
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/exercise-1/private-media/media-1",
        {
          method: "DELETE",
          headers: { cookie: currentIdentity.sessionToken },
        },
      );

    const failed = await worker.fetch(request(), validEnv);
    expect(failed.status).toBe(500);
    expect(requestCalls).toBe(1);
    expect(objectDeleteCalls).toBe(1);
    expect(completionCalls).toBe(0);
    expect(pending).toBe(true);

    const retried = await worker.fetch(request(), validEnv);
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ deleted: true });
    expect(requestCalls).toBe(2);
    expect(objectDeleteCalls).toBe(2);
    expect(completionCalls).toBe(1);
    expect(pending).toBe(false);
  });

  it("retries private-media deletion after metadata finalization fails", async () => {
    let requestCalls = 0;
    let objectDeleteCalls = 0;
    let completionCalls = 0;
    let pending = true;

    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        exerciseCatalog: {
          ...base.exerciseCatalog,
          async requestPrivateMediaDeletion(
            organizationId,
            exerciseId,
            mediaId,
          ) {
            requestCalls += 1;
            if (!pending) return undefined;
            return {
              id: mediaId,
              organizationId,
              exerciseId,
              fileName: "clip.mp4",
              storageKey: "exercise-catalog/verein-1/exercise-1/media-1",
              contentType: "video/mp4",
              sizeBytes: 24,
              createdAt: "2026-10-09T00:00:00.000Z",
            };
          },
          async completePrivateMediaDeletion() {
            completionCalls += 1;
            if (completionCalls === 1) {
              throw new Error("simulated metadata finalization failure");
            }
            pending = false;
            return true;
          },
        },
        exerciseCatalogMediaStore: {
          async put() {},
          async get() {
            return null;
          },
          async delete(key) {
            objectDeleteCalls += 1;
            expect(key).toBe(
              "exercise-catalog/verein-1/exercise-1/media-1",
            );
          },
        },
      };
    });

    const request = () =>
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/exercise-1/private-media/media-1",
        {
          method: "DELETE",
          headers: { cookie: currentIdentity.sessionToken },
        },
      );

    const failed = await worker.fetch(request(), validEnv);
    expect(failed.status).toBe(500);
    expect(requestCalls).toBe(1);
    expect(objectDeleteCalls).toBe(1);
    expect(completionCalls).toBe(1);
    expect(pending).toBe(true);

    const retried = await worker.fetch(request(), validEnv);
    expect(retried.status).toBe(200);
    await expect(retried.json()).resolves.toEqual({ deleted: true });
    expect(requestCalls).toBe(2);
    expect(objectDeleteCalls).toBe(2);
    expect(completionCalls).toBe(2);
    expect(pending).toBe(false);
  });

  it("serves E6F1 catalog export and template as protected XLSX downloads", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const [path, filename] of [
      ["/api/modules/exercise-catalog/export.xlsx", "ulc-uebungskatalog-export.xlsx"],
      ["/api/modules/exercise-catalog/template.xlsx", "ulc-uebungskatalog-importvorlage.xlsx"],
    ] as const) {
      const response = await worker.fetch(
        new Request("https://ulc.example.test" + path, {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers.get("content-disposition")).toContain(filename);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(
        Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 4)),
      ).toEqual([0x50, 0x4b, 0x03, 0x04]);
    }
  });

  it("previews E6F2 XLSX imports only after edit authorization without applying changes", async () => {
    let editCalls = 0;
    let listCalls = 0;
    let mutationCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      exerciseCatalogAccess: {
        ...base.exerciseCatalogAccess,
        async assertEditAccess() {
          editCalls += 1;
          return {
            organizationId: "verein-1",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      exerciseCatalog: {
        ...base.exerciseCatalog,
        async list() {
          listCalls += 1;
          return {
            items: [],
            trainingGroups: [
              {
                id: "group-1",
                name: "Sprint",
                shortName: "SP",
                sortOrder: 10,
              },
            ],
          };
        },
        async create() {
          mutationCalls += 1;
          throw new Error("import preview must not create exercises");
        },
        async update() {
          mutationCalls += 1;
          throw new Error("import preview must not update exercises");
        },
        async deactivate() {
          mutationCalls += 1;
          throw new Error("import preview must not deactivate exercises");
        },
      },
    }));

    const workbook = createUlcExerciseCatalogWorkbook(
      {
        items: [],
        trainingGroups: [
          {
            id: "group-1",
            name: "Sprint",
            shortName: "SP",
            sortOrder: 10,
          },
        ],
      },
      "template",
    );
    const body = new Uint8Array(workbook.byteLength);
    body.set(workbook);

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: body.buffer,
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(editCalls).toBe(1);
    expect(listCalls).toBe(1);
    expect(mutationCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        applyAvailable: false,
        summary: {
          rows: 1,
          create: 1,
          update: 0,
          skip: 0,
          errors: 0,
        },
      },
      apply: {
        available: true,
        previewToken: expect.stringMatching(/^e6f3-v1\.[0-9a-f]{64}$/),
      },
    });
  });

  it("authorizes E6F2 import preview before inspecting the uploaded file", async () => {
    let editCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      exerciseCatalogAccess: {
        ...base.exerciseCatalogAccess,
        async assertEditAccess() {
          editCalls += 1;
          throw new UlcLinzAuthorizationDeniedError();
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      validEnv,
    );

    expect(editCalls).toBe(1);
    expect(response.status).toBe(403);
  });

  it("keeps E6F2 import preview POST-only and XLSX-only", async () => {
    const worker = createGeneratedWorker(() => runtime());

    const getResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        {
          headers: { cookie: currentIdentity.sessionToken },
        },
      ),
      validEnv,
    );
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");

    const jsonResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      validEnv,
    );
    expect(jsonResponse.status).toBe(415);
    await expect(jsonResponse.json()).resolves.toMatchObject({
      error: { code: "INVALID_IMPORT_CONTENT_TYPE" },
    });
  });

  it("applies E6F3 only with the exact server preview token and returns a row protocol", async () => {
    let createCalls = 0;
    let receivedOrganization: string | null = null;
    let receivedIdentity: string | null = null;
    const base = runtime();
    const trainingGroups = [
      {
        id: "group-1",
        name: "Sprint",
        shortName: "SP",
        sortOrder: 10,
      },
    ];
    const worker = createGeneratedWorker(() => ({
      ...base,
      exerciseCatalog: {
        ...base.exerciseCatalog,
        async list() {
          return { items: [], trainingGroups };
        },
        async create(organizationId, identityId, input) {
          createCalls += 1;
          receivedOrganization = organizationId;
          receivedIdentity = identityId;
          return base.exerciseCatalog.create(organizationId, identityId, input);
        },
      },
    }));

    const workbook = createUlcExerciseCatalogWorkbook(
      { items: [], trainingGroups },
      "template",
    );
    const previewBody = new Uint8Array(workbook.byteLength);
    previewBody.set(workbook);
    const previewResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-preview",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: previewBody.buffer,
        },
      ),
      validEnv,
    );
    expect(previewResponse.status).toBe(200);
    const previewPayload = await previewResponse.json() as {
      apply: { previewToken: string };
    };

    const applyBody = new Uint8Array(workbook.byteLength);
    applyBody.set(workbook);
    const applyResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-apply",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "x-appbasis-import-preview-token":
              previewPayload.apply.previewToken,
          },
          body: applyBody.buffer,
        },
      ),
      validEnv,
    );

    expect(applyResponse.status).toBe(200);
    expect(createCalls).toBe(1);
    expect(receivedOrganization).toBe("verein-1");
    expect(receivedIdentity).toBe(currentIdentity.identity.identityId);
    await expect(applyResponse.json()).resolves.toMatchObject({
      result: {
        contractVersion: "appbasis.exercise-catalog.import-result/v1",
        summary: {
          rows: 1,
          created: 1,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        rows: [
          {
            requestedAction: "create",
            outcome: "created",
            exerciseId: "exercise-worker-1",
          },
        ],
        logCsv: expect.stringContaining("Excel-Zeile"),
      },
    });
  });

  it("rejects stale E6F3 apply tokens before any mutation", async () => {
    let mutationCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      exerciseCatalog: {
        ...base.exerciseCatalog,
        async list() {
          return {
            items: [],
            trainingGroups: [
              {
                id: "group-1",
                name: "Sprint",
                shortName: "SP",
                sortOrder: 10,
              },
            ],
          };
        },
        async create(organizationId, identityId, input) {
          mutationCalls += 1;
          return base.exerciseCatalog.create(organizationId, identityId, input);
        },
        async update(organizationId, identityId, exerciseId, input) {
          mutationCalls += 1;
          return base.exerciseCatalog.update(
            organizationId,
            identityId,
            exerciseId,
            input,
          );
        },
      },
    }));
    const workbook = createUlcExerciseCatalogWorkbook(
      {
        items: [],
        trainingGroups: [
          {
            id: "group-1",
            name: "Sprint",
            shortName: "SP",
            sortOrder: 10,
          },
        ],
      },
      "template",
    );
    const body = new Uint8Array(workbook.byteLength);
    body.set(workbook);

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-apply",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "x-appbasis-import-preview-token":
              "e6f3-v1." + "0".repeat(64),
          },
          body: body.buffer,
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(409);
    expect(mutationCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "STALE_IMPORT_PREVIEW" },
    });
  });

  it("keeps E6F3 apply POST-only, XLSX-only and edit-authorized before file inspection", async () => {
    const base = runtime();
    let deniedEditCalls = 0;
    const deniedWorker = createGeneratedWorker(() => ({
      ...base,
      exerciseCatalogAccess: {
        ...base.exerciseCatalogAccess,
        async assertEditAccess() {
          deniedEditCalls += 1;
          throw new UlcLinzAuthorizationDeniedError();
        },
      },
    }));

    const denied = await deniedWorker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-apply",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      validEnv,
    );
    expect(deniedEditCalls).toBe(1);
    expect(denied.status).toBe(403);

    const worker = createGeneratedWorker(() => runtime());
    const getResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-apply",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");

    const jsonResponse = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/import-apply",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: "{}",
        },
      ),
      validEnv,
    );
    expect(jsonResponse.status).toBe(415);
  });

  it("keeps E6F1 workbook endpoints read-only", async () => {
    const response = await createGeneratedWorker(() => runtime()).fetch(
      new Request(
        "https://ulc.example.test/api/modules/exercise-catalog/export.xlsx",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("reports read-only exercise catalog access without granting edit", async () => {
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        exerciseCatalogAccess: {
          ...base.exerciseCatalogAccess,
          async assertViewAccess() {
            return {
              organizationId: "verein-1",
              actorPrincipalId: currentIdentity.identity.identityId,
              canEdit: false,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access: { view: true, edit: false },
    });
  });

  it("rejects client-owned exercise catalog organization scope", async () => {
    const response = await createGeneratedWorker(() => runtime()).fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-2",
          name: "Sprint",
          categoryKey: "acceleration",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_EXERCISE_CATALOG_INPUT" },
    });
  });

  it("reports read-only athletes access without granting edit", async () => {
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        athletesAccess: {
          ...base.athletesAccess,
          async assertViewAccess() {
            return { organizationId: "verein-1", canEdit: false };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      module: {
        moduleId: "athletes",
        capabilities: {
          view: "athletes:view",
          edit: "athletes:edit",
        },
      },
      access: { view: true, edit: false, organizationId: "verein-1" },
    });
  });

  it("serves E6F4A athlete XLSX export from the server-authorized organization only", async () => {
    let readOrganization: string | null = null;
    let mutationCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertViewAccess(current) {
          expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
          return { organizationId: "verein-server", canEdit: true };
        },
      },
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot(organizationId) {
          readOrganization = organizationId;
          return {
            trainingGroups: [
              {
                id: "group-1",
                organizationId,
                name: "Sprint",
                shortName: "SP",
                description: null,
                attendanceMode: "trainer_roll_call",
                isActive: true,
                sortOrder: 10,
              },
            ],
            athletes: [
              {
                id: "athlete-1",
                organizationId,
                firstName: "Anna",
                lastName: "Muster",
                birthYear: 2012,
                notes: null,
                isActive: true,
              },
            ],
            athleteContacts: [],
            trainers: [],
            athleteGroupMemberships: [
              {
                organizationId,
                athleteId: "athlete-1",
                groupId: "group-1",
                startedOn: "2026-01-01",
                endedOn: null,
              },
            ],
            trainerGroupMemberships: [],
          };
        },
        async createAthlete(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.createAthlete(...args);
        },
        async updateAthlete(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.updateAthlete(...args);
        },
        async deactivateAthlete(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.deactivateAthlete(...args);
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/export.xlsx", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="athleten-export.xlsx"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readOrganization).toBe("verein-server");
    expect(mutationCalls).toBe(0);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Anna");
    expect(text).toContain("Muster");
    expect(text).not.toContain("verein-server");
  });

  it("serves the E6F4A athlete import template and keeps workbook endpoints GET-only", async () => {
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot(organizationId) {
          return {
            trainingGroups: [
              {
                id: "group-1",
                organizationId,
                name: "Sprint",
                shortName: "SP",
                description: null,
                attendanceMode: "trainer_roll_call",
                isActive: true,
                sortOrder: 10,
              },
            ],
            athletes: [],
            athleteContacts: [],
            trainers: [],
            athleteGroupMemberships: [],
            trainerGroupMemberships: [],
          };
        },
      },
    }));

    const template = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/template.xlsx", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(template.status).toBe(200);
    expect(template.headers.get("content-disposition")).toBe(
      'attachment; filename="athleten-importvorlage.xlsx"',
    );
    expect(new TextDecoder().decode(await template.arrayBuffer())).toContain(
      "Mustermann",
    );

    const post = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/export.xlsx", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET");
  });

  it("denies E6F4A athlete workbook reads before loading masterdata", async () => {
    let readCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertViewAccess() {
          throw new UlcLinzAuthorizationDeniedError();
        },
      },
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot() {
          readCalls += 1;
          return base.athleteMasterdata.readOrganizationSnapshot("verein-1");
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/export.xlsx", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
    expect(readCalls).toBe(0);
  });

  it("previews E6F4B athlete XLSX only after edit authorization without mutations", async () => {
    let editCalls = 0;
    let readCalls = 0;
    let mutationCalls = 0;
    const base = runtime();
    const snapshot: AthleteMasterdataSnapshot = {
      trainingGroups: [
        {
          id: "group-1",
          organizationId: "verein-server",
          name: "Sprint",
          shortName: "SP",
          description: null,
          attendanceMode: "trainer_roll_call",
          isActive: true,
          sortOrder: 10,
        },
      ],
      athletes: [],
      athleteContacts: [],
      trainers: [],
      athleteGroupMemberships: [],
      trainerGroupMemberships: [],
    };
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertEditAccess() {
          editCalls += 1;
          return { organizationId: "verein-server", canEdit: true };
        },
      },
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot(organizationId) {
          readCalls += 1;
          expect(organizationId).toBe("verein-server");
          return snapshot;
        },
        async createAthlete(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.createAthlete(...args);
        },
        async updateAthlete(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.updateAthlete(...args);
        },
        async createAthleteGroupMembership(...args) {
          mutationCalls += 1;
          return base.athleteMasterdata.createAthleteGroupMembership(...args);
        },
      },
    }));
    const workbook = createAthletesWorkbook(snapshot, "template");
    const body = new Uint8Array(workbook.byteLength);
    body.set(workbook);

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-preview", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: body.buffer,
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(editCalls).toBe(1);
    expect(readCalls).toBe(1);
    expect(mutationCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      preview: {
        contractVersion: "appbasis.athletes.exchange/v2",
        applyAvailable: false,
        summary: {
          rows: 1,
          create: 1,
          update: 0,
          errors: 0,
        },
      },
      apply: {
        available: true,
        previewToken: expect.stringMatching(/^e6f4b-v1\.[0-9a-f]{64}$/),
      },
    });
  });

  it("authorizes E6F4B preview before inspecting content type", async () => {
    let editCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertEditAccess() {
          editCalls += 1;
          throw new UlcLinzAuthorizationDeniedError();
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-preview", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: "{}",
      }),
      validEnv,
    );

    expect(editCalls).toBe(1);
    expect(response.status).toBe(403);
  });

  it("applies E6F4B with the exact preview token and server organization", async () => {
    let createCalls = 0;
    let membershipCalls = 0;
    const base = runtime();
    const snapshot: AthleteMasterdataSnapshot = {
      trainingGroups: [
        {
          id: "group-1",
          organizationId: "verein-server",
          name: "Sprint",
          shortName: "SP",
          description: null,
          attendanceMode: "trainer_roll_call",
          isActive: true,
          sortOrder: 10,
        },
      ],
      athletes: [],
      athleteContacts: [],
      trainers: [],
      athleteGroupMemberships: [],
      trainerGroupMemberships: [],
    };
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertEditAccess() {
          return { organizationId: "verein-server", canEdit: true };
        },
      },
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot(organizationId) {
          expect(organizationId).toBe("verein-server");
          return snapshot;
        },
        async createAthlete(organizationId, input) {
          createCalls += 1;
          expect(organizationId).toBe("verein-server");
          return {
            id: "athlete-imported",
            organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            birthYear: input.birthYear ?? null,
            notes: input.notes ?? null,
            isActive: true,
          };
        },
        async createAthleteGroupMembership(organizationId, input) {
          membershipCalls += 1;
          expect(organizationId).toBe("verein-server");
          return {
            organizationId,
            athleteId: input.athleteId,
            groupId: input.groupId,
            startedOn: input.startedOn,
            endedOn: input.endedOn ?? null,
          };
        },
      },
    }));
    const workbook = createAthletesWorkbook(snapshot, "template");

    const previewBody = new Uint8Array(workbook.byteLength);
    previewBody.set(workbook);
    const previewResponse = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-preview", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: previewBody.buffer,
      }),
      validEnv,
    );
    expect(previewResponse.status).toBe(200);
    const previewPayload = await previewResponse.json() as {
      apply: { previewToken: string };
    };

    const applyBody = new Uint8Array(workbook.byteLength);
    applyBody.set(workbook);
    const applyResponse = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-apply", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-appbasis-import-preview-token": previewPayload.apply.previewToken,
        },
        body: applyBody.buffer,
      }),
      validEnv,
    );

    expect(applyResponse.status).toBe(200);
    expect(createCalls).toBe(1);
    expect(membershipCalls).toBe(1);
    await expect(applyResponse.json()).resolves.toMatchObject({
      result: {
        contractVersion: "appbasis.athletes.import-result/v1",
        summary: {
          rows: 1,
          created: 1,
          updated: 0,
          skipped: 0,
          failed: 0,
        },
        rows: [
          {
            requestedAction: "create",
            outcome: "created",
            athleteId: "athlete-imported",
          },
        ],
        logCsv: expect.stringContaining("Excel-Zeile"),
      },
    });
  });

  it("rejects stale E6F4B apply tokens before any mutation", async () => {
    let mutations = 0;
    const base = runtime();
    const snapshot: AthleteMasterdataSnapshot = {
      trainingGroups: [
        {
          id: "group-1",
          organizationId: "verein-server",
          name: "Sprint",
          shortName: "SP",
          description: null,
          attendanceMode: "trainer_roll_call",
          isActive: true,
          sortOrder: 10,
        },
      ],
      athletes: [],
      athleteContacts: [],
      trainers: [],
      athleteGroupMemberships: [],
      trainerGroupMemberships: [],
    };
    const worker = createGeneratedWorker(() => ({
      ...base,
      athletesAccess: {
        ...base.athletesAccess,
        async assertEditAccess() {
          return { organizationId: "verein-server", canEdit: true };
        },
      },
      athleteMasterdata: {
        ...base.athleteMasterdata,
        async readOrganizationSnapshot() {
          return snapshot;
        },
        async createAthlete(...args) {
          mutations += 1;
          return base.athleteMasterdata.createAthlete(...args);
        },
        async updateAthlete(...args) {
          mutations += 1;
          return base.athleteMasterdata.updateAthlete(...args);
        },
        async createAthleteGroupMembership(...args) {
          mutations += 1;
          return base.athleteMasterdata.createAthleteGroupMembership(...args);
        },
      },
    }));
    const workbook = createAthletesWorkbook(snapshot, "template");
    const body = new Uint8Array(workbook.byteLength);
    body.set(workbook);

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-apply", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-appbasis-import-preview-token": "e6f4b-v1." + "0".repeat(64),
        },
        body: body.buffer,
      }),
      validEnv,
    );

    expect(response.status).toBe(409);
    expect(mutations).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "STALE_IMPORT_PREVIEW" },
    });
  });

  it("returns 413 for E6F4B oversized uploads detected by the shared request-body limiter", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/import-preview", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-length": String(5 * 1024 * 1024 + 1),
        },
      }),
      validEnv,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "IMPORT_FILE_TOO_LARGE" },
    });
  });

  it("keeps E6F4B endpoints POST-only and XLSX-only", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const path of ["import-preview", "import-apply"]) {
      const get = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/athletes/" + path, {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );
      expect(get.status).toBe(405);
      expect(get.headers.get("allow")).toBe("POST");

      const json = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/athletes/" + path, {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: "{}",
        }),
        validEnv,
      );
      expect(json.status).toBe(415);
    }
  });

  it("serves organization-scoped Stammdaten only after server-side view authorization", async () => {
    let authorizedOrganization: string | null = null;
    let readOrganization: string | null = null;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        {
          async assertViewAccess(current) {
            expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
            authorizedOrganization = "verein-1";
            return { organizationId: "verein-1", canEdit: true };
          },
          async assertEditAccess() {
            return { organizationId: "verein-1", canEdit: true };
          },
        },
        {
          ...runtime().athleteMasterdata,
          async readOrganizationSnapshot(organizationId) {
            readOrganization = organizationId;
            return {
              trainingGroups: [
                {
                  id: "group-1",
                  organizationId,
                  name: "U14",
                  shortName: "U14",
                  description: null,
                  attendanceMode: "trainer_roll_call",
                  isActive: true,
                  sortOrder: 10,
                },
              ],
              athletes: [],
              athleteContacts: [],
              trainers: [],
              athleteGroupMemberships: [],
              trainerGroupMemberships: [],
            };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/masterdata", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(authorizedOrganization).toBe("verein-1");
    expect(readOrganization).toBe("verein-1");
    await expect(response.json()).resolves.toEqual({
      masterdata: {
        trainingGroups: [
          {
            id: "group-1",
            organizationId: "verein-1",
            name: "U14",
            shortName: "U14",
            description: null,
            attendanceMode: "trainer_roll_call",
            isActive: true,
            sortOrder: 10,
          },
        ],
        athletes: [],
        athleteContacts: [],
        trainers: [],
        athleteGroupMemberships: [],
        trainerGroupMemberships: [],
      },
    });
  });

  it("does not expose Stammdaten to unauthenticated requests", async () => {
    let accessCalls = 0;
    const worker = createGeneratedWorker(() => {
      const value = runtime(
        async () => {},
        async () => {},
        undefined,
        {
          async assertViewAccess() {
            accessCalls += 1;
            return { organizationId: "verein-1", canEdit: true };
          },
          async assertEditAccess() {
            return { organizationId: "verein-1", canEdit: true };
          },
        },
      );
      return value;
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/masterdata"),
      validEnv,
    );

    expect(response.status).toBe(401);
    expect(accessCalls).toBe(0);
  });

  it("keeps the Stammdaten snapshot endpoint read-only", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/athletes/masterdata", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("creates Stammdaten only after edit authorization and injects the server organization", async () => {
    let editCalls = 0;
    let receivedOrganization: string | null = null;
    let receivedInput: unknown = null;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        {
          async assertViewAccess() {
            return { organizationId: "verein-1", canEdit: true };
          },
          async assertEditAccess(current) {
            editCalls += 1;
            expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
            return { organizationId: "verein-1", canEdit: true };
          },
        },
        {
          ...runtime().athleteMasterdata,
          async createAthlete(organizationId, input) {
            receivedOrganization = organizationId;
            receivedInput = input;
            return {
              id: "server-athlete-1",
              organizationId,
              firstName: input.firstName,
              lastName: input.lastName,
              birthYear: input.birthYear ?? null,
              notes: input.notes ?? null,
              isActive: true,
            };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/athletes",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            firstName: "Anna",
            lastName: "Muster",
            birthYear: 2012,
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(editCalls).toBe(1);
    expect(receivedOrganization).toBe("verein-1");
    expect(receivedInput).toEqual({
      firstName: "Anna",
      lastName: "Muster",
      birthYear: 2012,
      notes: undefined,
    });
    await expect(response.json()).resolves.toMatchObject({
      athlete: {
        id: "server-athlete-1",
        organizationId: "verein-1",
      },
    });
  });

  it("rejects client-controlled organization fields on Stammdaten mutations", async () => {
    let createCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        undefined,
        {
          ...base.athleteMasterdata,
          async createAthlete(organizationId, input) {
            createCalls += 1;
            return base.athleteMasterdata.createAthlete(organizationId, input);
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/athletes",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            organizationId: "verein-2",
            firstName: "Anna",
            lastName: "Muster",
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(400);
    expect(createCalls).toBe(0);
  });

  it("updates Stammdaten only after edit authorization with route id and server-derived organization", async () => {
    let editCalls = 0;
    let received: unknown = null;
    const base = runtime();
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        {
          async assertViewAccess() {
            return { organizationId: "verein-1", canEdit: true };
          },
          async assertEditAccess() {
            editCalls += 1;
            return { organizationId: "verein-1", canEdit: true };
          },
        },
        {
          ...base.athleteMasterdata,
          async updateAthlete(organizationId, athleteId, input) {
            received = { organizationId, athleteId, input };
            return {
              id: athleteId,
              organizationId,
              firstName: input.firstName,
              lastName: input.lastName,
              birthYear: input.birthYear,
              notes: input.notes,
              isActive: true,
            };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/athletes/athlete-1/update",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            firstName: "Anna",
            lastName: "Beispiel",
            birthYear: null,
            notes: "neu",
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(editCalls).toBe(1);
    expect(received).toEqual({
      organizationId: "verein-1",
      athleteId: "athlete-1",
      input: {
        firstName: "Anna",
        lastName: "Beispiel",
        birthYear: null,
        notes: "neu",
      },
    });
  });

  it("requires the complete replacement field set for Stammdaten updates", async () => {
    let updateCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        undefined,
        {
          ...base.athleteMasterdata,
          async updateTrainer(organizationId, trainerId, input) {
            updateCalls += 1;
            return base.athleteMasterdata.updateTrainer(
              organizationId,
              trainerId,
              input,
            );
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/trainers/trainer-1/update",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            firstName: "Max",
            lastName: "Trainer",
            email: null,
            notes: null,
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(400);
    expect(updateCalls).toBe(0);
  });

  it("returns not found when an inactive, missing or foreign Stammdaten update target is not mutable", async () => {
    const base = runtime();
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        undefined,
        {
          ...base.athleteMasterdata,
          async updateTrainingGroup() {
            return null;
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/training-groups/group-1/update",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "U14",
            shortName: "U14",
            description: null,
            attendanceMode: "trainer_roll_call",
            sortOrder: 10,
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(404);
  });

  it("deactivates Stammdaten only through edit authorization and the derived organization", async () => {
    let editCalls = 0;
    let deactivation: readonly string[] | null = null;
    const base = runtime();
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        undefined,
        {
          async assertViewAccess() {
            return { organizationId: "verein-1", canEdit: true };
          },
          async assertEditAccess() {
            editCalls += 1;
            return { organizationId: "verein-1", canEdit: true };
          },
        },
        {
          ...base.athleteMasterdata,
          async deactivateAthlete(organizationId, athleteId) {
            deactivation = [organizationId, athleteId];
            return true;
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/athletes/masterdata/athletes/athlete-1/deactivate",
        {
          method: "POST",
          headers: { cookie: currentIdentity.sessionToken },
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(editCalls).toBe(1);
    expect(deactivation).toEqual(["verein-1", "athlete-1"]);
  });

  it("builds an authorized countdown plan from the public domain contract", async () => {
    const worker = createGeneratedWorker(() => runtime());

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rounds: 2,
          workSeconds: 20,
          restSeconds: 10,
          workAnnouncementIntervalSeconds: 10,
          restAnnouncementIntervalSeconds: 5,
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.configuration).toEqual({
      rounds: 2,
      workSeconds: 20,
      restSeconds: 10,
      workAnnouncementIntervalSeconds: 10,
      restAnnouncementIntervalSeconds: 5,
      totalSeconds: 53,
    });
    expect(payload.timeline.slice(0, 4)).toEqual([
      { type: "count", atSecond: 0, phase: "prepare", round: 1, value: 3 },
      { type: "count", atSecond: 1, phase: "prepare", round: 1, value: 2 },
      { type: "count", atSecond: 2, phase: "prepare", round: 1, value: 1 },
      { type: "start", atSecond: 3, phase: "work", round: 1, value: "Los" },
    ]);
    expect(payload.timeline.at(-1)).toEqual({
      type: "finished",
      atSecond: 53,
      phase: "finished",
      round: 2,
      value: "Fertig",
    });
  });

  it("rejects invalid countdown plans without leaking validation details", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rounds: 0,
          workSeconds: 20,
          restSeconds: 10,
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_COUNTDOWN_CONFIGURATION",
        message: "The countdown configuration is invalid.",
      },
    });
  });

  it("requires POST for the countdown plan endpoint", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("keeps the countdown contract closed and audited without a valid session", async () => {
    let accessCalls = 0;
    const events: unknown[] = [];
    const worker = createGeneratedWorker(() => {
      const value = runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess() {
            accessCalls += 1;
            return { organizationId: "verein-1", canEdit: true };
          },
        },
      );
      return {
        ...value,
        securityEvents: {
          record(event: unknown) {
            events.push(event);
          },
          async flush() {},
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown"),
      validEnv,
    );

    expect(response.status).toBe(401);
    expect(accessCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_INVALID" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "authorization.denied",
      actorPrincipalId: null,
      organizationId: null,
      action: "view",
      targetId: "countdown",
      reasonCode: "identity-access-denied",
    });
  });

  it("returns a generic forbidden countdown response for denied module access", async () => {
    const { UlcLinzCountdownAccessDeniedError } = await import(
      "../worker/countdown-access"
    );
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess() {
            throw new UlcLinzCountdownAccessDeniedError();
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ULC_LINZ_COUNTDOWN_ACCESS_DENIED",
        message: "Countdown access denied.",
      },
    });
  });

  it("keeps unexpected countdown authorization failures generic and secret-free", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(
          async () => {},
          async () => {},
          {
            async assertViewAccess() {
              throw new Error("postgresql://countdown-secret/private");
            },
          },
        ),
      );

      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/countdown", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("countdown-secret");
      expect(logged.join("\n")).not.toContain("countdown-secret");
    } finally {
      console.error = originalError;
    }
  });

  it("does not accept mutating methods on the countdown contract endpoint", async () => {
    const worker = createGeneratedWorker(() => runtime());

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("maps validated bindings into one request-scoped runtime, flushes security events and closes it", async () => {
    let flushCalls = 0;
    let closeCalls = 0;
    let receivedOptions: unknown = null;
    const worker = createGeneratedWorker(async (options) => {
      receivedOptions = options;
      return runtime(
        async () => {
          closeCalls += 1;
        },
        async () => {
          flushCalls += 1;
        },
      );
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(receivedOptions).toEqual({
      connectionString: validEnv.HYPERDRIVE.connectionString,
      securityLogConnectionString:
        validEnv.SECURITY_LOG_HYPERDRIVE.connectionString,
      baseURL: validEnv.APPBASIS_BASE_URL,
      secret: validEnv.BETTER_AUTH_SECRET,
    });
    expect(flushCalls).toBe(1);
    expect(closeCalls).toBe(1);
  });

  it("returns a generic runtime failure without leaking provider error details", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const response = await createGeneratedWorker(() => {
        throw new Error("postgresql://secret-host/private");
      }).fetch(
        new Request("https://ulc.example.test/api/auth/session"),
        validEnv,
      );

      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("secret-host");
      expect(logged.join("\n")).toContain("UNEXPECTED_RUNTIME_ERROR");
      expect(logged.join("\n")).not.toContain("secret-host");
    } finally {
      console.error = originalError;
    }
  });

  it("keeps a successful response when security-event flush fails and still closes the runtime", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    let closeCalls = 0;
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(
          async () => {
            closeCalls += 1;
          },
          async () => {
            throw new Error("postgresql://security-log-secret/private");
          },
        ),
      );
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/auth/session", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(200);
      expect(closeCalls).toBe(1);
      expect(logged.join("\n")).toContain("SECURITY_EVENT_FLUSH_ERROR");
      expect(logged.join("\n")).not.toContain("security-log-secret");
    } finally {
      console.error = originalError;
    }
  });

  it("keeps a successful response when runtime close fails", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(async () => {
          throw new Error("close-secret");
        }),
      );
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/auth/session", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(200);
      expect(logged.join("\n")).toContain("RUNTIME_CLOSE_ERROR");
      expect(logged.join("\n")).not.toContain("close-secret");
    } finally {
      console.error = originalError;
    }
  });
});


describe("Athlete user administration API", () => {
  it("creates an athlete user only from server-owned admin scope and session", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            return {
              organizationId: "verein-server",
              actorPrincipalId: "identity-worker-1",
            };
          },
        },
        athleteUserProvisioning: {
          async createAthleteUser(input) {
            received = input;
            return {
              identityId: "identity-athlete-new",
              username: input.username,
              displayName: input.displayName,
              athleteId: input.athleteId,
              mustChangePassword: true as const,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/athlete-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "athlete.a",
          displayName: "Athlete A",
          temporaryPassword: "Startpasswort-1",
          contactEmail: "athlete.a@example.test",
          athleteId: "athlete-1",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(received).toEqual({
      organizationId: "verein-server",
      actorPrincipalId: "identity-worker-1",
      username: "athlete.a",
      displayName: "Athlete A",
      temporaryPassword: "Startpasswort-1",
      contactEmail: "athlete.a@example.test",
      athleteId: "athlete-1",
    });

    const rejectedClientScope = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/athlete-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          username: "athlete.b",
          displayName: "Athlete B",
          temporaryPassword: "Startpasswort-2",
          athleteId: "athlete-2",
        }),
      }),
      validEnv,
    );
    expect(rejectedClientScope.status).toBe(400);
  });

  it("rejects non-admin athlete user creation before provisioning", async () => {
    let provisioningCalls = 0;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            throw new UlcLinzAuthorizationDeniedError();
          },
        },
        athleteUserProvisioning: {
          async createAthleteUser(input) {
            provisioningCalls += 1;
            return {
              identityId: "should-not-exist",
              username: input.username,
              displayName: input.displayName,
              athleteId: input.athleteId,
              mustChangePassword: true as const,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/athlete-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "athlete.a",
          displayName: "Athlete A",
          temporaryPassword: "Startpasswort-1",
          athleteId: "athlete-1",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
    expect(provisioningCalls).toBe(0);
  });
});

describe("Trainer user administration API", () => {
  it("creates a trainer user only from server-owned admin scope and session", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            return {
              organizationId: "verein-server",
              actorPrincipalId: "identity-worker-1",
            };
          },
        },
        trainerUserProvisioning: {
          async createTrainerUser(input) {
            received = input;
            return {
              identityId: "identity-new",
              username: input.username,
              displayName: input.displayName,
              trainerId: input.trainerId,
              mustChangePassword: true as const,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "trainer.a",
          displayName: "Trainer A",
          temporaryPassword: "Startpasswort-1",
          contactEmail: "trainer.a@example.test",
          trainerId: "trainer-1",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(received).toEqual({
      organizationId: "verein-server",
      actorPrincipalId: "identity-worker-1",
      username: "trainer.a",
      displayName: "Trainer A",
      temporaryPassword: "Startpasswort-1",
      contactEmail: "trainer.a@example.test",
      trainerId: "trainer-1",
    });
    await expect(response.json()).resolves.toEqual({
      trainerUser: {
        identityId: "identity-new",
        username: "trainer.a",
        displayName: "Trainer A",
        trainerId: "trainer-1",
        mustChangePassword: true,
      },
    });

    const rejectedClientScope = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          username: "trainer.b",
          displayName: "Trainer B",
          temporaryPassword: "Startpasswort-2",
          trainerId: "trainer-2",
        }),
      }),
      validEnv,
    );
    expect(rejectedClientScope.status).toBe(400);
  });

  it("rejects non-admin trainer user creation before provisioning", async () => {
    let provisioningCalls = 0;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            throw new UlcLinzAuthorizationDeniedError();
          },
        },
        trainerUserProvisioning: {
          async createTrainerUser(input) {
            provisioningCalls += 1;
            return {
              identityId: "should-not-exist",
              username: input.username,
              displayName: input.displayName,
              trainerId: input.trainerId,
              mustChangePassword: true as const,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-users", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: "trainer.a",
          displayName: "Trainer A",
          temporaryPassword: "Startpasswort-1",
          trainerId: "trainer-1",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
    expect(provisioningCalls).toBe(0);
  });
});

describe("Trainer identity administration API", () => {
  it("lists trainer identities only inside the server-authorized organization", async () => {
    let receivedOrganization: string | null = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            return {
              organizationId: "verein-server",
              actorPrincipalId: "identity-worker-1",
            };
          },
        },
        trainerIdentityLinks: {
          ...base.trainerIdentityLinks,
          async listBindings(organizationId) {
            receivedOrganization = organizationId;
            return [
              {
                identityId: "identity-1",
                username: "trainer.one",
                displayName: "Trainer One",
                trainerId: "trainer-1",
              },
            ];
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-identities", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(receivedOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toEqual({
      trainerIdentities: [
        {
          identityId: "identity-1",
          username: "trainer.one",
          displayName: "Trainer One",
          trainerId: "trainer-1",
        },
      ],
    });
  });

  it("binds a trainer identity using only server-owned organization scope", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            return {
              organizationId: "verein-server",
              actorPrincipalId: "identity-worker-1",
            };
          },
        },
        trainerIdentityLinks: {
          ...base.trainerIdentityLinks,
          async bindTrainer(input) {
            received = input;
            return {
              identityId: input.identityId,
              username: "trainer.one",
              displayName: "Trainer One",
              trainerId: input.trainerId,
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-identities", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          identityId: "identity-1",
          trainerId: "trainer-1",
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      actorPrincipalId: "identity-worker-1",
      identityId: "identity-1",
      trainerId: "trainer-1",
    });

    const rejected = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-identities", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          identityId: "identity-1",
          trainerId: "trainer-1",
        }),
      }),
      validEnv,
    );
    expect(rejected.status).toBe(400);

    const rejectedQuery = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/admin/trainer-identities?organizationId=verein-client",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(rejectedQuery.status).toBe(400);
  });

  it("fails closed for non-admin trainer identity administration", async () => {
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            throw new UlcLinzAuthorizationDeniedError();
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/trainer-identities", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
  });
});

describe("ULC organization user administration API", () => {
  it("returns only the server-authorized tenant's account directory", async () => {
    let receivedOrganization: string | null = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            return { organizationId: "verein-server", actorPrincipalId: "identity-worker-1" };
          },
        },
        userAdminOverview: {
          async listUsers(organizationId) {
            receivedOrganization = organizationId;
            return [{
              identityId: "test-1",
              username: "test.trainer",
              displayName: "Test Trainer",
              sourceRole: "trainer" as const,
              subjectId: "trainer-1",
              active: true,
              blocked: false,
            }];
          },
        },
      };
    });
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/users", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(response.status).toBe(200);
    expect(receivedOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toEqual({
      users: [{
        identityId: "test-1",
        username: "test.trainer",
        displayName: "Test Trainer",
        sourceRole: "trainer",
        subjectId: "trainer-1",
        active: true,
        blocked: false,
      }],
    });
    const injection = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/users?organizationId=verein-other", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(injection.status).toBe(400);
  });

  it("denies non-admins without listing user data", async () => {
    let touched = false;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        trainerIdentityAccess: {
          async assertAdminAccess() {
            throw new UlcLinzAuthorizationDeniedError();
          },
        },
        userAdminOverview: {
          async listUsers() {
            touched = true;
            return [];
          },
        },
      };
    });
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/admin/users", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(response.status).toBe(403);
    expect(touched).toBe(false);
  });
});

describe("Kindertraining runtime API", () => {
  it("returns active Kindertraining groups from the server-authorized organization", async () => {
    let receivedOrganization: string | null = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        kindertrainingAccess: {
          ...base.kindertrainingAccess,
          async assertViewAccess() {
            return kindertrainingOrganizationAccess("verein-server");
          },
        },
        kindertraining: {
          ...base.kindertraining,
          async listGroups(organizationId) {
            receivedOrganization = organizationId;
            return [
              {
                id: "group-1",
                name: "Kindertraining",
                shortName: "KT",
                attendanceMode: "trainer_roll_call",
              },
            ];
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(receivedOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toEqual({
      module: { moduleId: "kindertraining" },
      access: { view: true },
      trainingGroups: [
        {
                id: "group-1",
                name: "Kindertraining",
                shortName: "KT",
                attendanceMode: "trainer_roll_call",
              },
      ],
    });
  });

  it("filters trainer groups and hides unassigned read and write targets", async () => {
    let readCalls = 0;
    let saveCalls = 0;
    const securityEvents: unknown[] = [];
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        kindertrainingAccess: {
          ...base.kindertrainingAccess,
          async assertViewAccess() {
            return kindertrainingTrainerAccess(
              "verein-server",
              "trainer-1",
              ["group-1"],
            );
          },
          async assertEditAccess() {
            return kindertrainingTrainerAccess(
              "verein-server",
              "trainer-1",
              ["group-1"],
            );
          },
        },
        kindertraining: {
          ...base.kindertraining,
          async listGroups(organizationId) {
            expect(organizationId).toBe("verein-server");
            return [
              {
                id: "group-1",
                name: "Kindertraining",
                shortName: "KT",
                attendanceMode: "trainer_roll_call",
              },
              {
                id: "group-2",
                name: "Unerlaubt",
                shortName: "X",
                attendanceMode: "trainer_roll_call",
              },
            ];
          },
          async readSnapshot() {
            readCalls += 1;
            throw new Error("unassigned group must not reach the service");
          },
          async saveSession() {
            saveCalls += 1;
            throw new Error("unassigned group must not reach the service");
          },
        },
        securityEvents: {
          ...base.securityEvents,
          record(event) {
            securityEvents.push(event);
          },
        },
      };
    });

    const moduleResponse = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(moduleResponse.status).toBe(200);
    await expect(moduleResponse.json()).resolves.toMatchObject({
      trainingGroups: [
        {
                id: "group-1",
                name: "Kindertraining",
                shortName: "KT",
                attendanceMode: "trainer_roll_call",
              },
      ],
    });

    const denied = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/kindertraining/session?groupId=group-2&sessionDate=2026-09-27",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(denied.status).toBe(404);
    expect(readCalls).toBe(0);

    const deniedWrite = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-2",
          sessionDate: "2026-09-27",
          expectedRevision: null,
          attendance: [],
        }),
      }),
      validEnv,
    );
    expect(deniedWrite.status).toBe(404);
    expect(saveCalls).toBe(0);

    for (const groupId of [42, {}, "", " group-1 ", "x".repeat(201)]) {
      const malformed = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/kindertraining/session", {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            groupId,
            sessionDate: "2026-09-27",
            expectedRevision: null,
            attendance: [],
          }),
        }),
        validEnv,
      );
      expect(malformed.status).toBe(400);
    }
    expect(saveCalls).toBe(0);
    expect(securityEvents).toEqual([
      expect.objectContaining({
        eventType: "authorization.denied",
        actorPrincipalId: currentIdentity.identity.identityId,
        organizationId: "verein-server",
        action: "view",
        targetId: "kindertraining",
        reasonCode: "scope-denied",
      }),
      expect.objectContaining({
        eventType: "authorization.denied",
        actorPrincipalId: currentIdentity.identity.identityId,
        organizationId: "verein-server",
        action: "edit",
        targetId: "kindertraining",
        reasonCode: "scope-denied",
      }),
    ]);
  });

  it("reads a participant snapshot only for the server-authorized organization", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        kindertrainingAccess: {
          ...base.kindertrainingAccess,
          async assertViewAccess() {
            return kindertrainingOrganizationAccess("verein-server");
          },
        },
        kindertraining: {
          ...base.kindertraining,
          async readSnapshot(organizationId, groupId, sessionDate) {
            received = { organizationId, groupId, sessionDate };
            return {
              group: {
          id: groupId,
          name: "Kindertraining",
          shortName: "KT",
          attendanceMode: "trainer_roll_call",
        },
              sessionDate,
              session: null,
              participants: [],
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/kindertraining/session?groupId=group-1&sessionDate=2026-09-27",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      groupId: "group-1",
      sessionDate: "2026-09-27",
    });
  });

  it("saves attendance through edit access without accepting client organization scope", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        kindertrainingAccess: {
          ...base.kindertrainingAccess,
          async assertEditAccess() {
            return kindertrainingOrganizationAccess("verein-server");
          },
        },
        kindertraining: {
          ...base.kindertraining,
          async saveSession(organizationId, input) {
            received = { organizationId, input };
            return {
              group: {
                id: input.groupId,
                name: "Kindertraining",
                shortName: "KT",
                attendanceMode: "trainer_roll_call",
              },
              sessionDate: input.sessionDate,
              session: {
                id: "session-1",
                revision: "42",
                state: input.state ?? "scheduled",
                note: input.note ?? null,
              },
              participants: [],
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-1",
          sessionDate: "2026-09-27",
          state: "scheduled",
          note: "Halle",
          expectedRevision: "41",
          attendance: [],
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      input: {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        state: "scheduled",
        note: "Halle",
        expectedRevision: "41",
        attendance: [],
      },
    });

    const rejected = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          groupId: "group-1",
          sessionDate: "2026-09-27",
          expectedRevision: null,
          attendance: [],
        }),
      }),
      validEnv,
    );
    expect(rejected.status).toBe(400);
  });

  it("requires an explicit Kindertraining revision contract on save", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const body of [
      {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        attendance: [],
      },
      {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        expectedRevision: "not-a-revision",
        attendance: [],
      },
    ]) {
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/kindertraining/session", {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        validEnv,
      );
      expect(response.status).toBe(400);
    }
  });

  it("returns 409 when the loaded Kindertraining revision is stale", async () => {
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        kindertraining: {
          ...base.kindertraining,
          async saveSession() {
            throw new UlcTrainingSessionConflictError();
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/kindertraining/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-1",
          sessionDate: "2026-09-27",
          expectedRevision: "41",
          attendance: [],
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRAINING_SESSION_CONFLICT",
        message: "The training session changed since it was loaded.",
      },
    });
  });

  it("rejects unknown query parameters and duplicate scope parameters", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const query of [
      "groupId=group-1&sessionDate=2026-09-27&organizationId=verein-client",
      "groupId=group-1&groupId=group-2&sessionDate=2026-09-27",
    ]) {
      const response = await worker.fetch(
        new Request(
          `https://ulc.example.test/api/modules/kindertraining/session?${query}`,
          { headers: { cookie: currentIdentity.sessionToken } },
        ),
        validEnv,
      );
      expect(response.status).toBe(400);
    }
  });
});

describe("Training self-registration runtime API", () => {
  it("uses only the server-derived athlete scope and rejects client-owned athlete ids", async () => {
    const calls: unknown[] = [];
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      selfRegistrationAccess: {
        ...base.selfRegistrationAccess,
        async assertEditAccess(current) {
          expect(current.identity.identityId).toBe(
            currentIdentity.identity.identityId,
          );
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            athleteId: "athlete-server",
          };
        },
      },
      selfRegistration: {
        ...base.selfRegistration,
        async save(organizationId, athleteId, actorIdentityId, input) {
          calls.push({
            organizationId,
            athleteId,
            actorIdentityId,
            input,
          });
          return {
            group: {
              id: input.groupId,
              name: "Selbstanmeldung",
              shortName: "SA",
            },
            sessionDate: input.sessionDate,
            sessionState: "scheduled" as const,
            intention: input.intention,
            revision:
              input.expectedRevision === null
                ? 1
                : input.expectedRevision + 1,
          };
        },
      },
    }));

    const accepted = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/kindertraining/registration",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            groupId: "group-self",
            sessionDate: "2026-09-27",
            intention: "attending",
            expectedRevision: null,
          }),
        },
      ),
      validEnv,
    );

    expect(accepted.status).toBe(200);
    expect(calls).toEqual([
      {
        organizationId: "verein-server",
        athleteId: "athlete-server",
        actorIdentityId: currentIdentity.identity.identityId,
        input: {
          groupId: "group-self",
          sessionDate: "2026-09-27",
          intention: "attending",
          expectedRevision: null,
        },
      },
    ]);

    const rejected = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/kindertraining/registration",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            athleteId: "athlete-client",
            groupId: "group-self",
            sessionDate: "2026-09-27",
            intention: "attending",
            expectedRevision: null,
          }),
        },
      ),
      validEnv,
    );

    expect(rejected.status).toBe(400);
    expect(calls).toHaveLength(1);
  });
});

describe("U12 runtime API", () => {
  it("returns active U12 groups from the server-authorized organization", async () => {
    let receivedOrganization: string | null = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        u12Access: {
          ...base.u12Access,
          async assertViewAccess() {
            return u12OrganizationAccess("verein-server");
          },
        },
        u12: {
          ...base.u12,
          async listGroups(organizationId) {
            receivedOrganization = organizationId;
            return [
              { id: "group-1", name: "U12", shortName: "KT" },
            ];
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(receivedOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toEqual({
      module: { moduleId: "u12" },
      access: { view: true },
      trainingGroups: [
        { id: "group-1", name: "U12", shortName: "KT" },
      ],
    });
  });

  it("filters trainer groups and hides unassigned read and write targets", async () => {
    let readCalls = 0;
    let saveCalls = 0;
    const securityEvents: unknown[] = [];
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        u12Access: {
          ...base.u12Access,
          async assertViewAccess() {
            return u12TrainerAccess(
              "verein-server",
              "trainer-1",
              ["group-1"],
            );
          },
          async assertEditAccess() {
            return u12TrainerAccess(
              "verein-server",
              "trainer-1",
              ["group-1"],
            );
          },
        },
        u12: {
          ...base.u12,
          async listGroups(organizationId) {
            expect(organizationId).toBe("verein-server");
            return [
              { id: "group-1", name: "U12", shortName: "KT" },
              { id: "group-2", name: "Unerlaubt", shortName: "X" },
            ];
          },
          async readSnapshot() {
            readCalls += 1;
            throw new Error("unassigned group must not reach the service");
          },
          async saveSession() {
            saveCalls += 1;
            throw new Error("unassigned group must not reach the service");
          },
        },
        securityEvents: {
          ...base.securityEvents,
          record(event) {
            securityEvents.push(event);
          },
        },
      };
    });

    const moduleResponse = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(moduleResponse.status).toBe(200);
    await expect(moduleResponse.json()).resolves.toMatchObject({
      trainingGroups: [
        { id: "group-1", name: "U12", shortName: "KT" },
      ],
    });

    const denied = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/u12/session?groupId=group-2&sessionDate=2026-09-27",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(denied.status).toBe(404);
    expect(readCalls).toBe(0);

    const deniedWrite = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-2",
          sessionDate: "2026-09-27",
          expectedRevision: null,
          attendance: [],
        }),
      }),
      validEnv,
    );
    expect(deniedWrite.status).toBe(404);
    expect(saveCalls).toBe(0);

    for (const groupId of [42, {}, "", " group-1 ", "x".repeat(201)]) {
      const malformed = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/u12/session", {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            groupId,
            sessionDate: "2026-09-27",
            expectedRevision: null,
            attendance: [],
          }),
        }),
        validEnv,
      );
      expect(malformed.status).toBe(400);
    }
    expect(saveCalls).toBe(0);
    expect(securityEvents).toEqual([
      expect.objectContaining({
        eventType: "authorization.denied",
        actorPrincipalId: currentIdentity.identity.identityId,
        organizationId: "verein-server",
        action: "view",
        targetId: "u12",
        reasonCode: "scope-denied",
      }),
      expect.objectContaining({
        eventType: "authorization.denied",
        actorPrincipalId: currentIdentity.identity.identityId,
        organizationId: "verein-server",
        action: "edit",
        targetId: "u12",
        reasonCode: "scope-denied",
      }),
    ]);
  });

  it("reads a participant snapshot only for the server-authorized organization", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        u12Access: {
          ...base.u12Access,
          async assertViewAccess() {
            return u12OrganizationAccess("verein-server");
          },
        },
        u12: {
          ...base.u12,
          async readSnapshot(organizationId, groupId, sessionDate) {
            received = { organizationId, groupId, sessionDate };
            return {
              group: { id: groupId, name: "U12", shortName: "KT" },
              sessionDate,
              session: null,
              participants: [],
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/u12/session?groupId=group-1&sessionDate=2026-09-27",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      groupId: "group-1",
      sessionDate: "2026-09-27",
    });
  });

  it("saves attendance through edit access without accepting client organization scope", async () => {
    let received: unknown = null;
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        u12Access: {
          ...base.u12Access,
          async assertEditAccess() {
            return u12OrganizationAccess("verein-server");
          },
        },
        u12: {
          ...base.u12,
          async saveSession(organizationId, input) {
            received = { organizationId, input };
            return {
              group: {
                id: input.groupId,
                name: "U12",
                shortName: "KT",
              },
              sessionDate: input.sessionDate,
              session: {
                id: "session-1",
                revision: "42",
                state: input.state ?? "scheduled",
                note: input.note ?? null,
              },
              participants: [],
            };
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-1",
          sessionDate: "2026-09-27",
          state: "scheduled",
          note: "Halle",
          expectedRevision: "41",
          attendance: [],
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      input: {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        state: "scheduled",
        note: "Halle",
        expectedRevision: "41",
        attendance: [],
      },
    });

    const rejected = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          groupId: "group-1",
          sessionDate: "2026-09-27",
          expectedRevision: null,
          attendance: [],
        }),
      }),
      validEnv,
    );
    expect(rejected.status).toBe(400);
  });

  it("requires an explicit U12 revision contract on save", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const body of [
      {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        attendance: [],
      },
      {
        groupId: "group-1",
        sessionDate: "2026-09-27",
        expectedRevision: "not-a-revision",
        attendance: [],
      },
    ]) {
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/modules/u12/session", {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        validEnv,
      );
      expect(response.status).toBe(400);
    }
  });

  it("returns 409 when the loaded U12 revision is stale", async () => {
    const worker = createGeneratedWorker(() => {
      const base = runtime();
      return {
        ...base,
        u12: {
          ...base.u12,
          async saveSession() {
            throw new UlcTrainingSessionConflictError();
          },
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/u12/session", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          groupId: "group-1",
          sessionDate: "2026-09-27",
          expectedRevision: "41",
          attendance: [],
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRAINING_SESSION_CONFLICT",
        message: "The training session changed since it was loaded.",
      },
    });
  });

  it("rejects unknown query parameters and duplicate scope parameters", async () => {
    const worker = createGeneratedWorker(() => runtime());

    for (const query of [
      "groupId=group-1&sessionDate=2026-09-27&organizationId=verein-client",
      "groupId=group-1&groupId=group-2&sessionDate=2026-09-27",
    ]) {
      const response = await worker.fetch(
        new Request(
          `https://ulc.example.test/api/modules/u12/session?${query}`,
          { headers: { cookie: currentIdentity.sessionToken } },
        ),
        validEnv,
      );
      expect(response.status).toBe(400);
    }
  });
  it("serves E7B6 planning bootstrap and block templates from server-authorized organization scope", async () => {
    let subjectOrganization = "";
    let templateOrganization = "";
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertViewAccess(current) {
          expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async listSubjects(organizationId) {
          subjectOrganization = organizationId;
          return [
            {
              id: "athlete-1",
              firstName: "Anna",
              lastName: "Sprint",
              displayName: "Sprint, Anna",
            },
          ];
        },
        async listBlockTemplates(organizationId) {
          templateOrganization = organizationId;
          return [
            {
              id: "block-1",
              currentRevision: 3,
              name: "Sprintblock",
              audienceName: "U16",
              durationMinutes: 25,
              exerciseCount: 2,
            },
          ];
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-plans", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(subjectOrganization).toBe("verein-server");
    expect(templateOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toMatchObject({
      module: {
        moduleId: "training_planning",
        capabilities: {
          view: "training-plans:view",
          edit: "training-plans:edit",
        },
        features: {
          weekView: true,
          autosave: false,
          manualSave: true,
          confirmOnLeave: true,
          optimisticConcurrency: true,
          attendanceSummary: true,
          attendanceFilter: true,
          groupWeekOverview: true,
          planCopy: true,
          blockTemplateAdoption: true,
          blockTemplateSaveBack: true,
        },
      },
      access: { view: true, edit: true },
      subjects: [{ id: "athlete-1", displayName: "Sprint, Anna" }],
      blockTemplates: [
        {
          id: "block-1",
          currentRevision: 3,
          name: "Sprintblock",
          audienceName: "U16",
          durationMinutes: 25,
          exerciseCount: 2,
        },
      ],
    });
  });

  it("serves the training-plan group week overview from server-owned organization scope", async () => {
    let received: unknown = null;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertViewAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async groupWeekOverview(organizationId, groupId, weekStart) {
          received = { organizationId, groupId, weekStart };
          return {
            group: { id: groupId, name: "U16", shortName: "U16" },
            weekStart,
            weekEnd: "2026-10-18",
            dates: [
              "2026-10-12",
              "2026-10-13",
              "2026-10-14",
              "2026-10-15",
              "2026-10-16",
              "2026-10-17",
              "2026-10-18",
            ],
            rows: [
              {
                subject: {
                  id: "athlete-1",
                  firstName: "Anna",
                  lastName: "Sprint",
                  displayName: "Sprint, Anna",
                },
                cells: [
                  {
                    planDate: "2026-10-12",
                    planId: "plan-1",
                    durationMinutes: 45,
                    exerciseCount: 3,
                    attendanceStatuses: [],
                  },
                ],
              },
            ],
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/overview?groupId=group-u16&weekStart=2026-10-12",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      groupId: "group-u16",
      weekStart: "2026-10-12",
    });
    await expect(response.json()).resolves.toMatchObject({
      overview: {
        group: { id: "group-u16" },
        weekStart: "2026-10-12",
        weekEnd: "2026-10-18",
        rows: [
          {
            subject: { id: "athlete-1" },
            cells: [
              {
                planId: "plan-1",
                durationMinutes: 45,
                exerciseCount: 3,
              },
            ],
          },
        ],
      },
    });
  });

  it("lists E7B7 save-back audiences only after both edit authorizations agree on scope", async () => {
    const base = runtime();
    let listOrganization = "";
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingBlocksAccess: {
        ...base.trainingBlocksAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async listBlockTemplateAudiences(organizationId) {
          listOrganization = organizationId;
          return [
            {
              id: "group-u16",
              name: "U16",
              shortName: "U16",
            },
          ];
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/block-template-save-options",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(listOrganization).toBe("verein-server");
    await expect(response.json()).resolves.toEqual({
      audiences: [
        {
          id: "group-u16",
          name: "U16",
          shortName: "U16",
        },
      ],
    });

    const mismatchWorker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-a",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingBlocksAccess: {
        ...base.trainingBlocksAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-b",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
    }));
    const denied = await mismatchWorker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/block-template-save-options",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(denied.status).toBe(403);
  });

  it("saves an E7B7 plan block as a new template from server-owned scope without accepting block content", async () => {
    const base = runtime();
    let received: unknown = null;
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingBlocksAccess: {
        ...base.trainingBlocksAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async saveBlockAsTemplate(organizationId, input) {
          received = { organizationId, input };
          return {
            id: "block-new",
            currentRevision: 1,
            name: "Neue Vorlage",
            audienceId: "group-u16",
            audienceName: "U16",
            durationMinutes: 30,
            exerciseCount: 2,
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/block-templates",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            planId: "plan-1",
            blockItemId: "block-item-2",
            expectedRevision: 4,
            audienceId: "group-u16",
            name: "Neue Vorlage",
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(received).toEqual({
      organizationId: "verein-server",
      input: {
        planId: "plan-1",
        blockItemId: "block-item-2",
        expectedRevision: 4,
        audienceId: "group-u16",
        name: "Neue Vorlage",
      },
    });
    await expect(response.json()).resolves.toEqual({
      template: {
        id: "block-new",
        currentRevision: 1,
        name: "Neue Vorlage",
        audienceId: "group-u16",
        audienceName: "U16",
        durationMinutes: 30,
        exerciseCount: 2,
      },
    });

    for (const invalidBody of [
      {
        planId: "plan-1",
        blockItemId: "block-item-2",
        expectedRevision: 4,
        audienceId: "group-u16",
        organizationId: "verein-client",
      },
      {
        planId: "plan-1",
        blockItemId: "block-item-2",
        expectedRevision: 4,
        audienceId: "group-u16",
        items: [],
      },
      {
        planId: "plan-1",
        blockItemId: "block-item-2",
        expectedRevision: 4,
        audienceId: "group-u16",
        block: { name: "Client content" },
      },
    ]) {
      const invalid = await worker.fetch(
        new Request(
          "https://ulc.example.test/api/modules/training-plans/block-templates",
          {
            method: "POST",
            headers: {
              cookie: currentIdentity.sessionToken,
              "content-type": "application/json",
            },
            body: JSON.stringify(invalidBody),
          },
        ),
        validEnv,
      );
      expect(invalid.status).toBe(400);
    }
  });

  it("loads one E7B5 week with read-only attendance in server-owned scope", async () => {
    let received: unknown = null;
    let attendanceReceived: unknown = null;
    const base = runtime();
    const snapshot = {
      id: "plan-1",
      organizationId: "verein-server",
      subjectId: "athlete-1",
      planDate: "2026-10-14",
      currentRevision: 1,
      createdAt: "2026-10-12T10:00:00.000Z",
      updatedAt: "2026-10-12T10:00:00.000Z",
      revision: {
        organizationId: "verein-server",
        planId: "plan-1",
        revision: 1,
        note: "Sprint",
        createdAt: "2026-10-12T10:00:00.000Z",
        items: [
          {
            kind: "exercise" as const,
            itemId: "item-1",
            sourceExerciseId: null,
            name: "30 m",
            sets: null,
            repetitions: "3",
            amount: null,
            unit: null,
            comment: null,
            sortOrder: 0,
          },
        ],
      },
    };
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertViewAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async listSubjects() {
          return [
            {
              id: "athlete-1",
              firstName: "Anna",
              lastName: "Sprint",
              displayName: "Sprint, Anna",
            },
          ];
        },
        async listForSubjectDateRange(
          organizationId,
          subjectId,
          fromDate,
          toDate,
        ) {
          received = { organizationId, subjectId, fromDate, toDate };
          return [snapshot];
        },
        async listAttendanceForSubjectDateRange(
          organizationId,
          subjectId,
          fromDate,
          toDate,
        ) {
          attendanceReceived = {
            organizationId,
            subjectId,
            fromDate,
            toDate,
          };
          return [
            {
              sessionId: "session-1",
              sessionDate: "2026-10-14",
              status: "present" as const,
            },
          ];
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/week?subjectId=athlete-1&weekStart=2026-10-12",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      subjectId: "athlete-1",
      fromDate: "2026-10-12",
      toDate: "2026-10-18",
    });
    expect(attendanceReceived).toEqual({
      organizationId: "verein-server",
      subjectId: "athlete-1",
      fromDate: "2026-10-12",
      toDate: "2026-10-18",
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      subjectId: "athlete-1",
      weekStart: "2026-10-12",
      weekEnd: "2026-10-18",
      plans: [
        {
          id: "plan-1",
          subjectId: "athlete-1",
          planDate: "2026-10-14",
          currentRevision: 1,
        },
      ],
      attendance: [
        {
          sessionId: "session-1",
          sessionDate: "2026-10-14",
          status: "present",
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("organizationId");

    for (const query of [
      "subjectId=athlete-1&weekStart=2026-10-11",
      "subjectId=athlete-1&weekStart=2026-10-12&organizationId=verein-client",
      "subjectId=athlete-1&subjectId=athlete-2&weekStart=2026-10-12",
    ]) {
      const invalid = await worker.fetch(
        new Request(
          "https://ulc.example.test/api/modules/training-plans/week?" + query,
          { headers: { cookie: currentIdentity.sessionToken } },
        ),
        validEnv,
      );
      expect(invalid.status).toBe(400);
    }
  });

  it("creates E7B4 plans only in edit-authorized server scope and rejects client-owned scope", async () => {
    let received: unknown = null;
    let createCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async create(organizationId, input) {
          createCalls += 1;
          received = { organizationId, input };
          return {
            id: "plan-created",
            organizationId,
            subjectId: input.subjectId,
            planDate: input.planDate,
            currentRevision: 1,
            createdAt: "2026-10-12T10:00:00.000Z",
            updatedAt: "2026-10-12T10:00:00.000Z",
            revision: {
              organizationId,
              planId: "plan-created",
              revision: 1,
              note: input.note ?? null,
              items: [],
              createdAt: "2026-10-12T10:00:00.000Z",
            },
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-plans", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          subjectId: "athlete-1",
          planDate: "2026-10-14",
          note: "Sprint",
          items: [],
        }),
      }),
      validEnv,
    );
    expect(response.status).toBe(201);
    expect(received).toEqual({
      organizationId: "verein-server",
      input: {
        subjectId: "athlete-1",
        planDate: "2026-10-14",
        note: "Sprint",
        items: [],
      },
    });

    const rejected = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-plans", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId: "verein-client",
          subjectId: "athlete-1",
          planDate: "2026-10-15",
        }),
      }),
      validEnv,
    );
    expect(rejected.status).toBe(400);
    expect(createCalls).toBe(1);
  });

  it("copies a persisted training plan to one selected athlete without client-owned organization scope", async () => {
    const base = runtime();
    let received = null;
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async copyCurrentTo(
          organizationId,
          sourcePlanId,
          expectedSourceRevision,
          targetSubjectId,
          targetDate,
        ) {
          received = {
            organizationId,
            sourcePlanId,
            expectedSourceRevision,
            targetSubjectId,
            targetDate,
          };
          return {
            id: "plan-copy-1",
            organizationId,
            subjectId: targetSubjectId,
            planDate: targetDate,
            currentRevision: 1,
            createdAt: "2026-10-12T12:00:00.000Z",
            updatedAt: "2026-10-12T12:00:00.000Z",
            revision: {
              organizationId,
              planId: "plan-copy-1",
              revision: 1,
              note: "Kopie",
              items: [],
              createdAt: "2026-10-12T12:00:00.000Z",
            },
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/plan-1/copy",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedSourceRevision: 4,
            targetSubjectId: "athlete-2",
            targetDate: "2026-10-14",
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(received).toEqual({
      organizationId: "verein-server",
      sourcePlanId: "plan-1",
      expectedSourceRevision: 4,
      targetSubjectId: "athlete-2",
      targetDate: "2026-10-14",
    });
    await expect(response.json()).resolves.toMatchObject({
      plan: {
        id: "plan-copy-1",
        subjectId: "athlete-2",
        planDate: "2026-10-14",
        currentRevision: 1,
      },
    });
  });

  it("returns a conflict instead of silently overwriting a stale E7B4 plan revision", async () => {
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async findCurrent() {
          return {
            id: "plan-1",
            organizationId: "verein-server",
            subjectId: "athlete-1",
            planDate: "2026-10-14",
            currentRevision: 2,
            createdAt: "2026-10-12T10:00:00.000Z",
            updatedAt: "2026-10-12T11:00:00.000Z",
            revision: {
              organizationId: "verein-server",
              planId: "plan-1",
              revision: 2,
              note: null,
              items: [],
              createdAt: "2026-10-12T11:00:00.000Z",
            },
          };
        },
        async update() {
          throw new TrainingPlanConflictError(2, 3);
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/plan-1/update",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedRevision: 2,
            note: "Nicht überschreiben",
            items: [],
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "TRAINING_PLAN_CONFLICT",
        message: "The training plan changed since it was loaded.",
        expectedRevision: 2,
        currentRevision: 3,
      },
    });
  });

  it("reads an exact E7B6 block template through planning view scope without client organization scope", async () => {
    let received: unknown = null;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertViewAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async findBlockTemplate(organizationId, blockId, revision) {
          received = { organizationId, blockId, revision };
          return {
            id: blockId,
            currentRevision: revision,
            item: {
              kind: "block" as const,
              sourceBlockId: blockId,
              sourceBlockRevision: revision,
              name: "Sprintblock",
              durationMinutes: 25,
              note: "Technik",
              exercises: [
                {
                  sourceExerciseId: "exercise-1",
                  name: "30 m",
                  sets: "4",
                  repetitions: "3",
                  amount: "30",
                  unit: "m",
                  comment: null,
                },
              ],
            },
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/block-templates/block-1?revision=3",
        { headers: { cookie: currentIdentity.sessionToken } },
      ),
      validEnv,
    );
    expect(response.status).toBe(200);
    expect(received).toEqual({
      organizationId: "verein-server",
      blockId: "block-1",
      revision: 3,
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      template: {
        id: "block-1",
        currentRevision: 3,
        item: {
          sourceBlockId: "block-1",
          sourceBlockRevision: 3,
          name: "Sprintblock",
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("organizationId");

    for (const suffix of [
      "?revision=0",
      "?revision=3&organizationId=verein-client",
      "?revision=3&revision=4",
      "",
    ]) {
      const invalid = await worker.fetch(
        new Request(
          "https://ulc.example.test/api/modules/training-plans/block-templates/block-1" +
            suffix,
          { headers: { cookie: currentIdentity.sessionToken } },
        ),
        validEnv,
      );
      expect(invalid.status).toBe(400);
    }
  });

  it("forwards E7B6 sourced block snapshots to the server-side planning service", async () => {
    let received: unknown = null;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async create(organizationId, input) {
          received = { organizationId, input };
          return {
            id: "plan-created",
            organizationId,
            subjectId: input.subjectId,
            planDate: input.planDate,
            currentRevision: 1,
            createdAt: "2026-10-16T20:00:00.000Z",
            updatedAt: "2026-10-16T20:00:00.000Z",
            revision: {
              organizationId,
              planId: "plan-created",
              revision: 1,
              note: input.note ?? null,
              items: [],
              createdAt: "2026-10-16T20:00:00.000Z",
            },
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/training-plans", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          subjectId: "athlete-1",
          planDate: "2026-10-16",
          items: [
            {
              kind: "block",
              sourceBlockId: "block-1",
              sourceBlockRevision: 3,
              name: "Sprintblock",
              durationMinutes: 25,
              note: "Snapshot",
              exercises: [
                {
                  sourceExerciseId: "exercise-1",
                  name: "30 m",
                  repetitions: "3",
                },
              ],
            },
          ],
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(201);
    expect(received).toMatchObject({
      organizationId: "verein-server",
      input: {
        subjectId: "athlete-1",
        planDate: "2026-10-16",
        items: [
          {
            sourceBlockId: "block-1",
            sourceBlockRevision: 3,
          },
        ],
      },
    });
  });

  it("returns stale E7B6 revision conflicts before delegating an update", async () => {
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async findCurrent() {
          return {
            id: "plan-1",
            organizationId: "verein-server",
            subjectId: "athlete-1",
            planDate: "2026-10-14",
            currentRevision: 3,
            createdAt: "2026-10-12T10:00:00.000Z",
            updatedAt: "2026-10-12T12:00:00.000Z",
            revision: {
              organizationId: "verein-server",
              planId: "plan-1",
              revision: 3,
              note: null,
              items: [],
              createdAt: "2026-10-12T12:00:00.000Z",
            },
          };
        },
      },
    }));

    const response = await worker.fetch(
      new Request(
        "https://ulc.example.test/api/modules/training-plans/plan-1/update",
        {
          method: "POST",
          headers: {
            cookie: currentIdentity.sessionToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expectedRevision: 2,
            note: null,
            items: [
              {
                kind: "block",
                sourceBlockId: "forged",
                sourceBlockRevision: 99,
                name: "Stale und gefälscht",
                exercises: [],
              },
            ],
          }),
        },
      ),
      validEnv,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "TRAINING_PLAN_CONFLICT",
        expectedRevision: 2,
        currentRevision: 3,
      },
    });
  });

  it("rejects E7B4 updates without a full item snapshot to prevent accidental plan clearing", async () => {
    let findCalls = 0;
    let updateCalls = 0;
    const base = runtime();
    const worker = createGeneratedWorker(() => ({
      ...base,
      trainingPlansAccess: {
        ...base.trainingPlansAccess,
        async assertEditAccess() {
          return {
            organizationId: "verein-server",
            actorPrincipalId: currentIdentity.identity.identityId,
            canEdit: true,
          };
        },
      },
      trainingPlans: {
        ...base.trainingPlans,
        async findCurrent() {
          findCalls += 1;
          return undefined;
        },
        async update() {
          updateCalls += 1;
          return undefined;
        },
      },
    }));

    for (const body of [
      {
        expectedRevision: 2,
        note: "Nur Notiz ändern",
      },
      {
        expectedRevision: 2,
        items: [],
      },
    ]) {
      const response = await worker.fetch(
        new Request(
          "https://ulc.example.test/api/modules/training-plans/plan-1/update",
          {
            method: "POST",
            headers: {
              cookie: currentIdentity.sessionToken,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
        ),
        validEnv,
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "INVALID_TRAINING_PLAN" },
      });
    }
    expect(findCalls).toBe(0);
    expect(updateCalls).toBe(0);
  });

});
