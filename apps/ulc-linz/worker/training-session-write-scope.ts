import type { UlcTrainingSessionSqlClient } from "./training-session-postgres";

/**
 * Opt-in P03-H scope guard. Locks CURRENT canonical scope rows inside the
 * caller's PostgreSQL transaction; no new user-level deletion authority.
 *
 * Limits: direct SQL writers, permission-grant revocation, newly inserted
 * overlapping memberships, restore and third-party free text are NOT fenced.
 */
export class UlcTrainingScopeWriteBlockedError extends Error {
  readonly code = "ULC_TRAINING_SCOPE_WRITE_BLOCKED";
  constructor() {
    super("Current training group or actor scope does not allow this write.");
    this.name = "UlcTrainingScopeWriteBlockedError";
  }
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 ||
      value.length > 200 || value.trim() !== value) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
  return value;
}

function requiredDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
  const parsed = new Date(value + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
  return value;
}

function uniqueSorted(ids: readonly string[]): string[] {
  if (!Array.isArray(ids)) throw new UlcTrainingScopeWriteBlockedError();
  return [...new Set(ids.map(requiredId))].sort();
}

/** Must execute only inside a real BEGIN, after canonical athlete FOR SHARE. */
export async function assertUlcLiveTrainingGroupScope(
  sql: UlcTrainingSessionSqlClient,
  input: {
    readonly organizationId: string;
    readonly groupId: string;
    readonly sessionDate: string;
    readonly athleteIds: readonly string[];
    readonly trainerIds: readonly string[];
    readonly requireSelfRegistration?: boolean;
  },
): Promise<void> {
  const organizationId = requiredId(input.organizationId);
  const groupId = requiredId(input.groupId);
  const date = requiredDate(input.sessionDate);
  const athleteIds = uniqueSorted(input.athleteIds);
  const trainerIds = uniqueSorted(input.trainerIds);

  // Lock the group row against deactivate/mode changes until commit.
  const groups = await sql.unsafe(
    `SELECT id, attendance_mode FROM appbasis_training_group
     WHERE organization_id = $1 AND id = $2 AND is_active = true
     FOR SHARE`,
    [organizationId, groupId],
  );
  if (groups.length !== 1 || groups[0]?.id !== groupId ||
      (input.requireSelfRegistration === true &&
        groups[0]?.attendance_mode !== "self_registration")) {
    throw new UlcTrainingScopeWriteBlockedError();
  }

  // Existing assignment rows are locked against UPDATE/DELETE revocation.
  // The training date, not today's date, determines group eligibility.
  for (const athleteId of athleteIds) {
    const rows = await sql.unsafe(
      `SELECT athlete_id FROM appbasis_athlete_group_membership
       WHERE organization_id = $1 AND group_id = $2 AND athlete_id = $3
         AND started_on <= $4::date
         AND (ended_on IS NULL OR ended_on >= $4::date)
       FOR SHARE`,
      [organizationId, groupId, athleteId, date],
    );
    if (rows.length !== 1 || rows[0]?.athlete_id !== athleteId) {
      throw new UlcTrainingScopeWriteBlockedError();
    }
  }

  for (const trainerId of trainerIds) {
    const trainers = await sql.unsafe(
      `SELECT id FROM appbasis_trainer
       WHERE organization_id = $1 AND id = $2 AND is_active = true
       FOR SHARE`,
      [organizationId, trainerId],
    );
    if (trainers.length !== 1 || trainers[0]?.id !== trainerId) {
      throw new UlcTrainingScopeWriteBlockedError();
    }
    const memberships = await sql.unsafe(
      `SELECT trainer_id FROM appbasis_trainer_group_membership
       WHERE organization_id = $1 AND group_id = $2 AND trainer_id = $3
       FOR SHARE`,
      [organizationId, groupId, trainerId],
    );
    if (memberships.length !== 1 || memberships[0]?.trainer_id !== trainerId) {
      throw new UlcTrainingScopeWriteBlockedError();
    }
  }
}

/**
 * Verify scheduled self/proxy registration target and current actor binding
 * under the SAME transaction as the registration/notes/history write.
 */
export async function assertUlcLiveRegistrationScope(
  sql: UlcTrainingSessionSqlClient,
  input: {
    readonly organizationId: string;
    readonly sessionId: string;
    readonly athleteId: string;
    readonly actorIdentityId: string;
    readonly proxyActorAthleteId?: string | undefined;
  },
): Promise<void> {
  const organizationId = requiredId(input.organizationId);
  const sessionId = requiredId(input.sessionId);
  const athleteId = requiredId(input.athleteId);
  const identityId = requiredId(input.actorIdentityId);
  const proxyId = input.proxyActorAthleteId === undefined
    ? undefined : requiredId(input.proxyActorAthleteId);
  if (proxyId === athleteId) throw new UlcTrainingScopeWriteBlockedError();

  const sessions = await sql.unsafe(
    `SELECT group_id, session_date::text AS session_date
     FROM ulc_linz_training_session
     WHERE organization_id = $1 AND id = $2 AND state = 'scheduled'
     FOR SHARE`,
    [organizationId, sessionId],
  );
  if (sessions.length !== 1 || sessions[0] === undefined) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
  const groupId = requiredId(sessions[0].group_id);
  const sessionDate = requiredDate(sessions[0].session_date);
  await assertUlcLiveTrainingGroupScope(sql, {
    organizationId, groupId, sessionDate,
    athleteIds: proxyId === undefined ? [athleteId] : [athleteId, proxyId],
    trainerIds: [],
    requireSelfRegistration: true,
  });

  const actingAthlete = proxyId ?? athleteId;
  // Both the membership's role and the explicit self-scope must remain live.
  // Their row locks prevent concurrent UPDATE/DELETE revocation mid-write.
  const memberships = await sql.unsafe(
    `SELECT identity_id FROM ulc_linz_membership
     WHERE identity_id = $1 AND organization_id = $2
       AND subject_id = $3 AND source_role = 'athlete'
       AND active = true AND ended_at IS NULL
     FOR SHARE`,
    [identityId, organizationId, actingAthlete],
  );
  if (memberships.length !== 1 || memberships[0]?.identity_id !== identityId) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
  const relations = await sql.unsafe(
    `SELECT identity_id FROM ulc_linz_subject_scope
     WHERE identity_id = $1 AND organization_id = $2
       AND subject_id = $3 AND relation_type = 'self'
     FOR SHARE`,
    [identityId, organizationId, actingAthlete],
  );
  if (relations.length !== 1 || relations[0]?.identity_id !== identityId) {
    throw new UlcTrainingScopeWriteBlockedError();
  }
}
