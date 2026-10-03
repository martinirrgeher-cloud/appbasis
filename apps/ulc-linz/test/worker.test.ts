import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import { InMemoryPermissionStore } from "@appbasis/permissions";

import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { createGeneratedWorker } from "../worker/index";
import type { GeneratedPostgresApplicationRuntime } from "../worker/postgres";
import { UlcTrainingSessionConflictError } from "../worker/training-session-postgres";
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
      return { organizationId: "verein-1" };
    },
  },
  athletesAccess: GeneratedPostgresApplicationRuntime["athletesAccess"] = {
    async assertViewAccess() {
      return { organizationId: "verein-1" };
    },
    async assertEditAccess() {
      return { organizationId: "verein-1" };
    },
  },
  athleteMasterdata: GeneratedPostgresApplicationRuntime["athleteMasterdata"] = {
    async readOrganizationSnapshot() {
      return {
        trainingGroups: [],
        athletes: [],
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
  },
  kindertrainingAccess: GeneratedPostgresApplicationRuntime["kindertrainingAccess"] = {
    async assertViewAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
    async assertEditAccess() {
      return kindertrainingOrganizationAccess("verein-1");
    },
  },
  kindertraining: GeneratedPostgresApplicationRuntime["kindertraining"] = {
    async listGroups() {
      return [
        { id: "group-test", name: "Kindertraining", shortName: "KT" },
      ];
    },
    async readSnapshot(_organizationId, groupId, sessionDate) {
      return {
        group: { id: groupId, name: "Kindertraining", shortName: "KT" },
        sessionDate,
        session: null,
        participants: [],
      };
    },
    async saveSession(_organizationId, input) {
      return {
        group: { id: input.groupId, name: "Kindertraining", shortName: "KT" },
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
          status: entry.status,
        })),
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
    kindertrainingAccess,
    u12Access,
    trainerIdentityAccess: {
      async assertAdminAccess() {
        return {
          organizationId: "verein-1",
          actorPrincipalId: "identity-worker-1",
        };
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
    athleteMasterdata,
    kindertraining,
    u12,
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
          goal: input.goal ?? null,
          description: input.description ?? null,
          coachingCues: input.coachingCues ?? null,
          commonMistakes: input.commonMistakes ?? null,
          equipment: input.equipment ?? [],
          videoUrl: input.videoUrl ?? null,
          groupIds: input.groupIds ?? [],
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
          goal: input.goal ?? null,
          description: input.description ?? null,
          coachingCues: input.coachingCues ?? null,
          commonMistakes: input.commonMistakes ?? null,
          equipment: input.equipment ?? [],
          videoUrl: input.videoUrl ?? null,
          groupIds: input.groupIds ?? [],
          parameters: [],
          isActive: true,
          isFavorite: false,
        };
      },
      async deactivate() {},
      async setFavorite(organizationId, _identityId, exerciseId, favorite) {
        return {
          id: exerciseId,
          organizationId,
          name: "Sprint",
          categoryKey: "acceleration",
          subcategory: null,
          goal: null,
          description: null,
          coachingCues: null,
          commonMistakes: null,
          equipment: [],
          videoUrl: null,
          groupIds: [],
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
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="masterdata" data-nav-priority="3" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="kindertraining" data-nav-priority="1" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="countdown" data-nav-priority="4" hidden disabled');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="settings" data-nav-priority="5" hidden disabled');
    expect(ULC_LINZ_APP_SCRIPT).toContain('showAppSection("home");');
    expect(ULC_LINZ_APP_SCRIPT).toContain("refreshAppAvailability();");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.countdownQuickAction.disabled = !countdownReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.masterdataQuickAction.disabled = !masterdataReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.kindertrainingQuickAction.disabled = !kindertrainingReady;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '(section === "masterdata" && masterdataReady)',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '(section === "kindertraining" && kindertrainingReady)',
    );
  });

  it("ships the E3A Stammdaten UI on the existing server-authorized API contract", () => {
    expect(ULC_LINZ_APP_HTML).toContain("<h1>Stammdaten</h1>");
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="athletes"');
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="trainers"');
    expect(ULC_LINZ_APP_HTML).toContain('data-masterdata-tab="groups"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-form"');
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
            return { organizationId: "verein-1" };
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

  it("serves exercise catalog overview only after protected server-side authorization", async () => {
    const response = await createGeneratedWorker(() => runtime()).fetch(
      new Request("https://ulc.example.test/api/modules/exercise-catalog", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      module: { moduleId: "exercise_catalog" },
      access: { view: true, edit: true },
      catalog: { items: [], trainingGroups: [] },
    });
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
            return { organizationId: "verein-1" };
          },
          async assertEditAccess() {
            return { organizationId: "verein-1" };
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
                  isActive: true,
                  sortOrder: 10,
                },
              ],
              athletes: [],
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
            isActive: true,
            sortOrder: 10,
          },
        ],
        athletes: [],
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
            return { organizationId: "verein-1" };
          },
          async assertEditAccess() {
            return { organizationId: "verein-1" };
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
            return { organizationId: "verein-1" };
          },
          async assertEditAccess(current) {
            editCalls += 1;
            expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
            return { organizationId: "verein-1" };
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
            return { organizationId: "verein-1" };
          },
          async assertEditAccess() {
            editCalls += 1;
            return { organizationId: "verein-1" };
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
            return { organizationId: "verein-1" };
          },
          async assertEditAccess() {
            editCalls += 1;
            return { organizationId: "verein-1" };
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
            return { organizationId: "verein-1" };
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
              { id: "group-1", name: "Kindertraining", shortName: "KT" },
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
        { id: "group-1", name: "Kindertraining", shortName: "KT" },
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
              { id: "group-1", name: "Kindertraining", shortName: "KT" },
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
      new Request("https://ulc.example.test/api/modules/kindertraining", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );
    expect(moduleResponse.status).toBe(200);
    await expect(moduleResponse.json()).resolves.toMatchObject({
      trainingGroups: [
        { id: "group-1", name: "Kindertraining", shortName: "KT" },
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
              group: { id: groupId, name: "Kindertraining", shortName: "KT" },
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
});
