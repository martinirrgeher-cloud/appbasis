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
import type {
  UlcLinzTrainingModuleGroupReader,
} from "./training-module-group-postgres";

const MODULE_ID = "u12" as const;

export interface UlcU12GroupOption {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
}

export interface UlcU12Participant {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly status: UlcTrainingAttendanceStatus;
}

export interface UlcU12Snapshot {
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
  readonly participants: readonly UlcU12Participant[];
}

export interface UlcU12MasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): Promise<AthleteMasterdataSnapshot>;
}

export interface UlcU12SessionStore {
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

export class UlcU12NotFoundError extends Error {
  readonly code = "ULC_U12_GROUP_NOT_FOUND";

  constructor() {
    super("U12 group not found.");
    this.name = "UlcU12NotFoundError";
  }
}

export class UlcU12ConsistencyError extends Error {
  readonly code = "ULC_U12_CONSISTENCY_ERROR";

  constructor() {
    super("U12 data is inconsistent.");
    this.name = "UlcU12ConsistencyError";
  }
}

export function createUlcU12Service({
  masterdata,
  sessions,
  moduleGroups,
}: {
  masterdata: UlcU12MasterdataReader;
  sessions: UlcU12SessionStore;
  moduleGroups: UlcLinzTrainingModuleGroupReader;
}) {
  return Object.freeze({
    async listGroups(
      organizationId: string,
    ): Promise<readonly UlcU12GroupOption[]> {
      const normalizedOrganizationId = requiredIdentifier(
        organizationId,
        "Organization id",
      );
      const configuredGroupId = await moduleGroups.readGroupId(
        normalizedOrganizationId,
        MODULE_ID,
      );
      if (configuredGroupId === null) return Object.freeze([]);

      const snapshot = await masterdata.readOrganizationSnapshot(
        normalizedOrganizationId,
      );
      const group = configuredGroup(
        snapshot,
        normalizedOrganizationId,
        configuredGroupId,
        false,
      );
      if (group.isActive !== true) return Object.freeze([]);

      return Object.freeze([
        Object.freeze({
          id: group.id,
          name: group.name,
          shortName: group.shortName,
        }),
      ]);
    },

    async readSnapshot(
      organizationId: string,
      groupId: string,
      sessionDate: string,
    ): Promise<UlcU12Snapshot> {
      const normalizedOrganizationId = requiredIdentifier(
        organizationId,
        "Organization id",
      );
      const normalizedGroupId = requiredIdentifier(groupId, "Training group id");
      await requireConfiguredGroup(
        moduleGroups,
        normalizedOrganizationId,
        normalizedGroupId,
      );
      const context = await resolveContext(
        masterdata,
        normalizedOrganizationId,
        normalizedGroupId,
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
    ): Promise<UlcU12Snapshot> {
      if (!Array.isArray(input.attendance)) {
        throw new UlcTrainingValidationError(
          "Training attendance must be an array.",
        );
      }
      const normalizedOrganizationId = requiredIdentifier(
        organizationId,
        "Organization id",
      );
      const normalizedGroupId = requiredIdentifier(
        input.groupId,
        "Training group id",
      );
      await requireConfiguredGroup(
        moduleGroups,
        normalizedOrganizationId,
        normalizedGroupId,
      );
      const context = await resolveContext(
        masterdata,
        normalizedOrganizationId,
        normalizedGroupId,
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

async function requireConfiguredGroup(
  moduleGroups: UlcLinzTrainingModuleGroupReader,
  organizationId: string,
  groupId: string,
): Promise<void> {
  const configuredGroupId = await moduleGroups.readGroupId(
    organizationId,
    MODULE_ID,
  );
  if (configuredGroupId !== groupId) {
    throw new UlcU12NotFoundError();
  }
}

function configuredGroup(
  snapshot: AthleteMasterdataSnapshot,
  organizationId: string,
  groupId: string,
  requireActive: boolean,
): TrainingGroup {
  const seen = new Set<string>();
  for (const candidate of snapshot.trainingGroups) {
    if (
      candidate.organizationId !== organizationId ||
      seen.has(candidate.id)
    ) {
      throw new UlcU12ConsistencyError();
    }
    seen.add(candidate.id);
  }
  const matches = snapshot.trainingGroups.filter(
    (candidate) => candidate.id === groupId,
  );
  if (
    matches.length !== 1 ||
    matches[0] === undefined ||
    (requireActive && matches[0].isActive !== true)
  ) {
    throw new UlcU12NotFoundError();
  }
  return matches[0];
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
  masterdata: UlcU12MasterdataReader,
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
  const group = configuredGroup(
    snapshot,
    normalizedOrganizationId,
    normalizedGroupId,
    requireActiveGroup,
  );

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
      throw new UlcU12ConsistencyError();
    }
    if (!athletesById.has(membership.athleteId)) {
      throw new UlcU12ConsistencyError();
    }
    participantIds.add(membership.athleteId);
  }

  const participants = [...participantIds]
    .map((athleteId) => {
      const athlete = athletesById.get(athleteId);
      if (athlete === undefined) throw new UlcU12ConsistencyError();
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
): UlcU12Snapshot {
  if (
    stored !== null &&
    (stored.session.organizationId !== context.organizationId ||
      stored.session.moduleId !== MODULE_ID ||
      stored.session.groupId !== context.group.id ||
      stored.session.sessionDate !== context.sessionDate)
  ) {
    throw new UlcU12ConsistencyError();
  }

  const statusByAthlete = new Map<string, UlcTrainingAttendanceStatus>();
  if (stored !== null) {
    for (const attendance of stored.attendance) {
      if (
        attendance.organizationId !== context.organizationId ||
        attendance.sessionId !== stored.session.id ||
        statusByAthlete.has(attendance.athleteId)
      ) {
        throw new UlcU12ConsistencyError();
      }
      statusByAthlete.set(attendance.athleteId, attendance.status);
    }
  }

  const participantIds = new Set(
    context.participants.map((participant) => participant.athleteId),
  );
  for (const athleteId of statusByAthlete.keys()) {
    if (!participantIds.has(athleteId)) {
      throw new UlcU12ConsistencyError();
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
