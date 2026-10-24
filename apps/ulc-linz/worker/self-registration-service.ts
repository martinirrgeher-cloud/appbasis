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
}

export interface UlcSelfRegistrationMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): Promise<AthleteMasterdataSnapshot>;
}

export type UlcSelfRegistrationSessionStore = Pick<
  PostgresUlcTrainingSessionRepository,
  "readSession" | "ensureScheduledSession" | "saveRegistration"
>;

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

    async save(
      organizationId: string,
      athleteId: string,
      actorIdentityId: string,
      input: {
        readonly groupId: string;
        readonly sessionDate: string;
        readonly intention: UlcTrainingRegistrationIntention;
        readonly expectedRevision: number | null;
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

      const snapshot = await sessions.ensureScheduledSession(
        context.organizationId,
        MODULE_ID,
        group.id,
        context.sessionDate,
      );
      const registration = await sessions.saveRegistration(
        context.organizationId,
        snapshot.session.id,
        context.athleteId,
        intention,
        expectedRevision,
        actor,
      );
      return Object.freeze({
        group: groupOption(group),
        sessionDate: context.sessionDate,
        sessionState: "scheduled",
        intention: registration.intention,
        revision: registration.revision,
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
