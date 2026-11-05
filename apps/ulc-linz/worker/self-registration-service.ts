import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";

import {
  UlcTrainingValidationError,
  type UlcTrainingRegistrationIntention,
} from "./training-session-domain";
import type {
  PostgresUlcTrainingSessionRepository,
  UlcTrainingSessionSnapshot,
} from "./training-session-postgres";

const MODULE_ID = "kindertraining" as const;

export interface UlcSelfRegistrationOption {
  readonly group: Readonly<{
    id: string;
    name: string;
    shortName: string | null;
  }>;
  readonly sessionDate: string;
  readonly sessionState: "scheduled" | "cancelled" | null;
  readonly intention: UlcTrainingRegistrationIntention;
  readonly revision: number | null;
  readonly note?: string | null;
}

export interface UlcProxyRegistrationOption {
  readonly athlete: Readonly<{ id: string; firstName: string; lastName: string }>;
  readonly intention: UlcTrainingRegistrationIntention;
  readonly revision: number | null;
  readonly note?: string | null;
}

export interface UlcProxyRegistrationRoster {
  readonly group: UlcSelfRegistrationOption["group"];
  readonly sessionDate: string;
  readonly sessionState: "scheduled" | "cancelled" | null;
  readonly options: readonly UlcProxyRegistrationOption[];
}

export interface UlcSelfRegistrationMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): Promise<AthleteMasterdataSnapshot>;
}

export type UlcSelfRegistrationSessionStore = Pick<
  PostgresUlcTrainingSessionRepository,
  "readSession" | "ensureScheduledSession" | "saveRegistration"
> & Partial<Pick<PostgresUlcTrainingSessionRepository, "withRegistrationTransaction">>;

/**
 * Real PostgreSQL sessions must wrap session creation and registration
 * together. Historical in-memory tests inject the legacy smaller interface;
 * the runtime Postgres repository always provides this transaction method.
 */
async function registerAtomically(
  sessions: UlcSelfRegistrationSessionStore,
  input: {
    organizationId: string;
    groupId: string;
    sessionDate: string;
    athleteId: string;
    intention: UlcTrainingRegistrationIntention;
    expectedRevision: number | null;
    actorIdentityId: string;
    proxyActorAthleteId?: string;
    note?: string | null;
  },
) {
  const write = async (
    store: Pick<PostgresUlcTrainingSessionRepository,
      "ensureScheduledSession" | "saveRegistration">,
  ) => {
    const snapshot = await store.ensureScheduledSession(
      input.organizationId, MODULE_ID, input.groupId, input.sessionDate,
    );
    return store.saveRegistration(
      input.organizationId,
      snapshot.session.id,
      input.athleteId,
      input.intention,
      input.expectedRevision,
      input.actorIdentityId,
      input.proxyActorAthleteId,
      input.note,
    );
  };
  return sessions.withRegistrationTransaction
    ? sessions.withRegistrationTransaction(write)
    : write(sessions);
}

export class UlcSelfRegistrationNotFoundError extends Error {
  readonly code = "ULC_SELF_REGISTRATION_NOT_FOUND";

  constructor() {
    super("Self-registration target was not found.");
    this.name = "UlcSelfRegistrationNotFoundError";
  }
}

export class UlcSelfRegistrationModeError extends Error {
  readonly code = "ULC_SELF_REGISTRATION_DISABLED";

  constructor() {
    super("Self-registration is disabled for this group.");
    this.name = "UlcSelfRegistrationModeError";
  }
}

export function createUlcSelfRegistrationService({
  masterdata,
  sessions,
}: {
  masterdata: UlcSelfRegistrationMasterdataReader;
  sessions: UlcSelfRegistrationSessionStore;
}) {
  return Object.freeze({
    async listOptions(
      organizationId: string,
      athleteId: string,
      sessionDate: string,
    ): Promise<readonly UlcSelfRegistrationOption[]> {
      const context = await resolveContext(
        masterdata,
        organizationId,
        athleteId,
        sessionDate,
      );
      const groups = eligibleGroups(context);
      const options = await Promise.all(
        groups.map(async (group) =>
          optionFromSnapshot(
            group,
            context.athleteId,
            context.sessionDate,
            await sessions.readSession(
              context.organizationId,
              MODULE_ID,
              group.id,
              context.sessionDate,
            ),
          ),
        ),
      );
      return Object.freeze(options);
    },

    // Athletes may act for another currently enrolled member of the SAME
    // self-registration group. Both memberships are checked again at write.
    async listProxyOptions(
      organizationId: string,
      actorAthleteId: string,
      groupId: string,
      sessionDate: string,
    ): Promise<UlcProxyRegistrationRoster> {
      const context = await resolveContext(
        masterdata, organizationId, actorAthleteId, sessionDate,
      );
      const { group, colleagues } = resolveProxyGroup(context, groupId);
      const snapshot = await sessions.readSession(
        context.organizationId, MODULE_ID, group.id, context.sessionDate,
      );
      if (snapshot !== null && (
        snapshot.session.organizationId !== context.organizationId ||
        snapshot.session.moduleId !== MODULE_ID ||
        snapshot.session.groupId !== group.id ||
        snapshot.session.sessionDate !== context.sessionDate
      )) {
        throw new UlcTrainingValidationError("Registration session scope is inconsistent.");
      }
      const options = colleagues.map((athlete) => {
        const matching = snapshot?.registrations.filter(
          (registration) => registration.athleteId === athlete.id,
        ) ?? [];
        if (matching.length > 1) {
          throw new UlcTrainingValidationError(
            "Training registration is inconsistent.",
          );
        }
        return Object.freeze({
          athlete: Object.freeze({
            id: athlete.id,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
          }),
          intention: matching[0]?.intention ?? "unknown",
          revision: matching[0]?.revision ?? null,
          ...(matching[0]?.note !== undefined ? { note: matching[0].note } : {}),
        });
      });
      return Object.freeze({
        group: groupOption(group),
        sessionDate: context.sessionDate,
        sessionState: snapshot?.session.state ?? null,
        options: Object.freeze(options),
      });
    },

    async saveProxy(
      organizationId: string,
      actorAthleteId: string,
      actorIdentityId: string,
      input: {
        readonly groupId: string;
        readonly targetAthleteId: string;
        readonly sessionDate: string;
        readonly intention: UlcTrainingRegistrationIntention;
        readonly expectedRevision: number | null;
        readonly note?: string | null;
      },
    ): Promise<UlcProxyRegistrationOption> {
      const context = await resolveContext(
        masterdata, organizationId, actorAthleteId, input.sessionDate,
      );
      const { group, colleagues } = resolveProxyGroup(context, input.groupId);
      const targetId = requiredIdentifier(input.targetAthleteId, "Target athlete id");
      const target = colleagues.find((athlete) => athlete.id === targetId);
      if (target === undefined) throw new UlcSelfRegistrationNotFoundError();
      const intention = requiredIntention(input.intention);
      const expectedRevision = registrationRevision(input.expectedRevision);
      const actor = requiredIdentifier(actorIdentityId, "Registration actor identity id");
      const registration = await registerAtomically(sessions, {
        organizationId: context.organizationId,
        groupId: group.id,
        sessionDate: context.sessionDate,
        athleteId: target.id,
        intention,
        expectedRevision,
        actorIdentityId: actor,
        proxyActorAthleteId: context.athleteId,
        note: input.note,
      });
      return Object.freeze({
        athlete: Object.freeze({
          id: target.id, firstName: target.firstName, lastName: target.lastName,
        }),
        intention: registration.intention,
        revision: registration.revision,
        ...(registration.note !== undefined ? { note: registration.note } : {}),
      });
    },

    async save(
      organizationId: string,
      athleteId: string,
      actorIdentityId: string,
      input: {
        readonly groupId: string;
        readonly sessionDate: string;
        readonly intention: UlcTrainingRegistrationIntention;
        readonly expectedRevision: number | null;
        readonly note?: string | null;
      },
    ): Promise<UlcSelfRegistrationOption> {
      const context = await resolveContext(
        masterdata,
        organizationId,
        athleteId,
        input.sessionDate,
      );
      const groupId = requiredIdentifier(input.groupId, "Training group id");
      const group = context.snapshot.trainingGroups.find(
        (candidate) =>
          candidate.id === groupId &&
          candidate.organizationId === context.organizationId,
      );
      if (group === undefined || group.isActive !== true) {
        throw new UlcSelfRegistrationNotFoundError();
      }
      if (group.attendanceMode !== "self_registration") {
        throw new UlcSelfRegistrationModeError();
      }
      if (!hasMembership(context, group.id)) {
        throw new UlcSelfRegistrationNotFoundError();
      }
      const intention = requiredIntention(input.intention);
      const expectedRevision = registrationRevision(input.expectedRevision);
      const actor = requiredIdentifier(
        actorIdentityId,
        "Registration actor identity id",
      );

      const registration = await registerAtomically(sessions, {
        organizationId: context.organizationId,
        groupId: group.id,
        sessionDate: context.sessionDate,
        athleteId: context.athleteId,
        intention,
        expectedRevision,
        actorIdentityId: actor,
        note: input.note,
      });
      return Object.freeze({
        group: groupOption(group),
        sessionDate: context.sessionDate,
        sessionState: "scheduled",
        intention: registration.intention,
        revision: registration.revision,
        ...(registration.note !== undefined ? { note: registration.note } : {}),
      });
    },
  });
}

interface ResolvedContext {
  readonly organizationId: string;
  readonly athleteId: string;
  readonly sessionDate: string;
  readonly snapshot: AthleteMasterdataSnapshot;
}

async function resolveContext(
  masterdata: UlcSelfRegistrationMasterdataReader,
  organizationId: string,
  athleteId: string,
  sessionDate: string,
): Promise<ResolvedContext> {
  const organization = requiredIdentifier(organizationId, "Organization id");
  const athlete = requiredIdentifier(athleteId, "Athlete id");
  const date = isoDate(sessionDate);
  const snapshot = await masterdata.readOrganizationSnapshot(organization);
  const matches = snapshot.athletes.filter(
    (candidate) =>
      candidate.id === athlete &&
      candidate.organizationId === organization &&
      candidate.isActive === true,
  );
  if (matches.length !== 1) throw new UlcSelfRegistrationNotFoundError();
  return Object.freeze({
    organizationId: organization,
    athleteId: athlete,
    sessionDate: date,
    snapshot,
  });
}

function resolveProxyGroup(
  context: ResolvedContext,
  rawGroupId: string,
): { group: TrainingGroup; colleagues: AthleteMasterdataSnapshot["athletes"] } {
  const groupId = requiredIdentifier(rawGroupId, "Training group id");
  const group = context.snapshot.trainingGroups.find(
    (candidate) =>
      candidate.organizationId === context.organizationId &&
      candidate.id === groupId &&
      candidate.isActive,
  );
  if (group === undefined || !hasMembership(context, group.id)) {
    throw new UlcSelfRegistrationNotFoundError();
  }
  if (group.attendanceMode !== "self_registration") {
    throw new UlcSelfRegistrationModeError();
  }
  const colleagues = context.snapshot.athletes.filter(
    (athlete) => athlete.organizationId === context.organizationId &&
      athlete.isActive === true &&
      athlete.id !== context.athleteId &&
      hasMembership({ ...context, athleteId: athlete.id }, group.id),
  ).sort(
    (a, b) => a.lastName.localeCompare(b.lastName, "de") ||
      a.firstName.localeCompare(b.firstName, "de") ||
      a.id.localeCompare(b.id),
  );
  return { group, colleagues };
}

function eligibleGroups(
  context: ResolvedContext,
): readonly TrainingGroup[] {
  return Object.freeze(
    context.snapshot.trainingGroups
      .filter(
        (group) =>
          group.organizationId === context.organizationId &&
          group.isActive === true &&
          group.attendanceMode === "self_registration" &&
          hasMembership(context, group.id),
      )
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.name.localeCompare(right.name, "de") ||
          left.id.localeCompare(right.id),
      ),
  );
}

function hasMembership(
  context: ResolvedContext,
  groupId: string,
): boolean {
  const matches = context.snapshot.athleteGroupMemberships.filter(
    (membership) =>
      membership.organizationId === context.organizationId &&
      membership.athleteId === context.athleteId &&
      membership.groupId === groupId &&
      membership.startedOn <= context.sessionDate &&
      (membership.endedOn === null ||
        membership.endedOn >= context.sessionDate),
  );
  if (matches.length > 1) {
    throw new UlcTrainingValidationError(
      "Athlete group membership is inconsistent.",
    );
  }
  return matches.length === 1;
}

function optionFromSnapshot(
  group: TrainingGroup,
  athleteId: string,
  sessionDate: string,
  snapshot: UlcTrainingSessionSnapshot | null,
): UlcSelfRegistrationOption {
  if (snapshot === null) {
    return Object.freeze({
      group: groupOption(group),
      sessionDate,
      sessionState: null,
      intention: "unknown",
      revision: null,
    });
  }
  const registrations = snapshot.registrations.filter(
    (registration) => registration.athleteId === athleteId,
  );
  if (registrations.length > 1) {
    throw new UlcTrainingValidationError(
      "Training registration is inconsistent.",
    );
  }
  const registration = registrations[0];
  return Object.freeze({
    group: groupOption(group),
    sessionDate,
    sessionState: snapshot.session.state,
    intention: registration?.intention ?? "unknown",
    revision: registration?.revision ?? null,
    ...(registration?.note !== undefined ? { note: registration.note } : {}),
  });
}

function groupOption(group: TrainingGroup) {
  return Object.freeze({
    id: group.id,
    name: group.name,
    shortName: group.shortName,
  });
}

function requiredIntention(
  value: unknown,
): UlcTrainingRegistrationIntention {
  if (
    value !== "unknown" &&
    value !== "attending" &&
    value !== "not_attending" &&
    value !== "maybe"
  ) {
    throw new UlcTrainingValidationError(
      "Training registration intention is invalid.",
    );
  }
  return value;
}

function registrationRevision(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new UlcTrainingValidationError(
      "Training registration revision is invalid.",
    );
  }
  return Number(value);
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcTrainingValidationError(`${label} is invalid.`);
  }
  return value;
}

function isoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcTrainingValidationError(
      "Training date must use YYYY-MM-DD.",
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new UlcTrainingValidationError("Training date is invalid.");
  }
  return value;
}
