import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";

import {
  UlcTrainingValidationError,
  type UlcTrainingAttendanceStatus,
  type UlcTrainingSessionState,
} from "./training-session-domain";
import type {
  UlcTrainingSessionSnapshot,
} from "./training-session-postgres";

const MODULE_ID = "kindertraining" as const;

export interface UlcKindertrainingGroupOption {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
}

export interface UlcKindertrainingParticipant {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly status: UlcTrainingAttendanceStatus;
}

export interface UlcKindertrainingSnapshot {
  readonly group: Readonly<{
    id: string;
    name: string;
    shortName: string | null;
  }>;
  readonly sessionDate: string;
  readonly session: Readonly<{
    id: string;
    revision: string;
    state: UlcTrainingSessionState;
    note: string | null;
  }> | null;
  readonly participants: readonly UlcKindertrainingParticipant[];
}

export interface UlcKindertrainingMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): Promise<AthleteMasterdataSnapshot>;
}

export interface UlcKindertrainingSessionStore {
  readSession(
    organizationId: string,
    moduleId: typeof MODULE_ID,
    groupId: string,
    sessionDate: string,
  ): Promise<UlcTrainingSessionSnapshot | null>;
  saveSession(
    organizationId: string,
    input: {
      readonly moduleId: typeof MODULE_ID;
      readonly groupId: string;
      readonly sessionDate: string;
      readonly state?: UlcTrainingSessionState;
      readonly note?: string | null;
    },
    attendance: readonly {
      readonly athleteId: string;
      readonly status: UlcTrainingAttendanceStatus;
    }[],
    expectedRevision: string | null,
  ): Promise<UlcTrainingSessionSnapshot>;
}

export class UlcKindertrainingNotFoundError extends Error {
  readonly code = "ULC_KINDERTRAINING_GROUP_NOT_FOUND";

  constructor() {
    super("Kindertraining group not found.");
    this.name = "UlcKindertrainingNotFoundError";
  }
}

export class UlcKindertrainingConsistencyError extends Error {
  readonly code = "ULC_KINDERTRAINING_CONSISTENCY_ERROR";

  constructor() {
    super("Kindertraining data is inconsistent.");
    this.name = "UlcKindertrainingConsistencyError";
  }
}

export function createUlcKindertrainingService({
  masterdata,
  sessions,
}: {
  masterdata: UlcKindertrainingMasterdataReader;
  sessions: UlcKindertrainingSessionStore;
}) {
  return Object.freeze({
    async listGroups(
      organizationId: string,
    ): Promise<readonly UlcKindertrainingGroupOption[]> {
      const normalizedOrganizationId = requiredIdentifier(
        organizationId,
        "Organization id",
      );
      const snapshot = await masterdata.readOrganizationSnapshot(
        normalizedOrganizationId,
      );
      const seen = new Set<string>();
      const groups = snapshot.trainingGroups
        .filter((group) => {
          if (group.organizationId !== normalizedOrganizationId) {
            throw new UlcKindertrainingConsistencyError();
          }
          if (seen.has(group.id)) {
            throw new UlcKindertrainingConsistencyError();
          }
          seen.add(group.id);
          return group.isActive === true;
        })
        .map((group) =>
          Object.freeze({
            id: group.id,
            name: group.name,
            shortName: group.shortName,
          }),
        )
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name, "de") ||
            left.id.localeCompare(right.id),
        );
      return Object.freeze(groups);
    },

    async readSnapshot(
      organizationId: string,
      groupId: string,
      sessionDate: string,
    ): Promise<UlcKindertrainingSnapshot> {
      const context = await resolveContext(
        masterdata,
        organizationId,
        groupId,
        sessionDate,
        false,
      );
      const stored = await sessions.readSession(
        context.organizationId,
        MODULE_ID,
        context.group.id,
        context.sessionDate,
      );
      return presentSnapshot(context, stored);
    },

    async saveSession(
      organizationId: string,
      input: {
        readonly groupId: string;
        readonly sessionDate: string;
        readonly state?: UlcTrainingSessionState;
        readonly note?: string | null;
        readonly expectedRevision: string | null;
        readonly attendance: readonly {
          readonly athleteId: string;
          readonly status: UlcTrainingAttendanceStatus;
        }[];
      },
    ): Promise<UlcKindertrainingSnapshot> {
      if (!Array.isArray(input.attendance)) {
        throw new UlcTrainingValidationError(
          "Training attendance must be an array.",
        );
      }
      const context = await resolveContext(
        masterdata,
        organizationId,
        input.groupId,
        input.sessionDate,
        true,
      );
      assertExactParticipantSet(context.participants, input.attendance);
      const expectedRevision = revisionToken(input.expectedRevision);

      const stored = await sessions.saveSession(
        context.organizationId,
        {
          moduleId: MODULE_ID,
          groupId: context.group.id,
          sessionDate: context.sessionDate,
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        input.attendance,
        expectedRevision,
      );
      return presentSnapshot(context, stored);
    },
  });
}

interface ResolvedContext {
  readonly organizationId: string;
  readonly group: TrainingGroup;
  readonly sessionDate: string;
  readonly participants: readonly {
    readonly athleteId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly birthYear: number | null;
  }[];
}

async function resolveContext(
  masterdata: UlcKindertrainingMasterdataReader,
  organizationId: string,
  groupId: string,
  sessionDate: string,
  requireActiveGroup: boolean,
): Promise<ResolvedContext> {
  const normalizedOrganizationId = requiredIdentifier(
    organizationId,
    "Organization id",
  );
  const normalizedGroupId = requiredIdentifier(groupId, "Training group id");
  const normalizedSessionDate = isoDate(sessionDate);

  const snapshot = await masterdata.readOrganizationSnapshot(
    normalizedOrganizationId,
  );
  const groups = snapshot.trainingGroups.filter(
    (group) =>
      group.id === normalizedGroupId &&
      group.organizationId === normalizedOrganizationId,
  );
  if (groups.length !== 1 || groups[0] === undefined) {
    throw new UlcKindertrainingNotFoundError();
  }
  const group = groups[0];
  if (requireActiveGroup && group.isActive !== true) {
    throw new UlcKindertrainingNotFoundError();
  }

  const athletesById = new Map(
    snapshot.athletes
      .filter(
        (athlete) => athlete.organizationId === normalizedOrganizationId,
      )
      .map((athlete) => [athlete.id, athlete]),
  );
  const participantIds = new Set<string>();
  for (const membership of snapshot.athleteGroupMemberships) {
    if (
      membership.organizationId !== normalizedOrganizationId ||
      membership.groupId !== normalizedGroupId ||
      membership.startedOn > normalizedSessionDate ||
      (membership.endedOn !== null &&
        membership.endedOn < normalizedSessionDate)
    ) {
      continue;
    }
    if (participantIds.has(membership.athleteId)) {
      throw new UlcKindertrainingConsistencyError();
    }
    if (!athletesById.has(membership.athleteId)) {
      throw new UlcKindertrainingConsistencyError();
    }
    participantIds.add(membership.athleteId);
  }

  const participants = [...participantIds]
    .map((athleteId) => {
      const athlete = athletesById.get(athleteId);
      if (athlete === undefined) throw new UlcKindertrainingConsistencyError();
      return Object.freeze({
        athleteId: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        birthYear: athlete.birthYear,
      });
    })
    .sort(
      (left, right) =>
        left.lastName.localeCompare(right.lastName, "de") ||
        left.firstName.localeCompare(right.firstName, "de") ||
        left.athleteId.localeCompare(right.athleteId),
    );

  return Object.freeze({
    organizationId: normalizedOrganizationId,
    group,
    sessionDate: normalizedSessionDate,
    participants: Object.freeze(participants),
  });
}

function presentSnapshot(
  context: ResolvedContext,
  stored: UlcTrainingSessionSnapshot | null,
): UlcKindertrainingSnapshot {
  if (
    stored !== null &&
    (stored.session.organizationId !== context.organizationId ||
      stored.session.moduleId !== MODULE_ID ||
      stored.session.groupId !== context.group.id ||
      stored.session.sessionDate !== context.sessionDate)
  ) {
    throw new UlcKindertrainingConsistencyError();
  }

  const statusByAthlete = new Map<string, UlcTrainingAttendanceStatus>();
  if (stored !== null) {
    for (const attendance of stored.attendance) {
      if (
        attendance.organizationId !== context.organizationId ||
        attendance.sessionId !== stored.session.id ||
        statusByAthlete.has(attendance.athleteId)
      ) {
        throw new UlcKindertrainingConsistencyError();
      }
      statusByAthlete.set(attendance.athleteId, attendance.status);
    }
  }

  const participantIds = new Set(
    context.participants.map((participant) => participant.athleteId),
  );
  for (const athleteId of statusByAthlete.keys()) {
    if (!participantIds.has(athleteId)) {
      throw new UlcKindertrainingConsistencyError();
    }
  }

  return Object.freeze({
    group: Object.freeze({
      id: context.group.id,
      name: context.group.name,
      shortName: context.group.shortName,
    }),
    sessionDate: context.sessionDate,
    session:
      stored === null
        ? null
        : Object.freeze({
            id: stored.session.id,
            revision: stored.revision,
            state: stored.session.state,
            note: stored.session.note,
          }),
    participants: Object.freeze(
      context.participants.map((participant) =>
        Object.freeze({
          ...participant,
          status: statusByAthlete.get(participant.athleteId) ?? "open",
        }),
      ),
    ),
  });
}

function assertExactParticipantSet(
  participants: ResolvedContext["participants"],
  attendance: readonly {
    readonly athleteId: string;
    readonly status: UlcTrainingAttendanceStatus;
  }[],
): void {
  const expected = new Set(
    participants.map((participant) => participant.athleteId),
  );
  const received = new Set<string>();
  for (const entry of attendance) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new UlcTrainingValidationError(
        "Training attendance entry is invalid.",
      );
    }
    const athleteId = requiredIdentifier(entry.athleteId, "Athlete id");
    requiredAttendanceStatus(entry.status);
    if (received.has(athleteId)) {
      throw new UlcTrainingValidationError(
        "Training attendance contains a duplicate athlete.",
      );
    }
    received.add(athleteId);
  }
  if (
    received.size !== expected.size ||
    [...received].some((athleteId) => !expected.has(athleteId))
  ) {
    throw new UlcTrainingValidationError(
      "Training attendance must match the participant snapshot exactly.",
    );
  }
}

function revisionToken(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    value.length > 20
  ) {
    throw new UlcTrainingValidationError(
      "Training revision is invalid.",
    );
  }
  return value;
}

function requiredAttendanceStatus(
  value: unknown,
): UlcTrainingAttendanceStatus {
  if (
    value !== "open" &&
    value !== "present" &&
    value !== "excused" &&
    value !== "absent"
  ) {
    throw new UlcTrainingValidationError(
      "Training attendance status is invalid.",
    );
  }
  return value;
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
