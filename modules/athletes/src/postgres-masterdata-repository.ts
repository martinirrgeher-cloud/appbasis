import {
  createAthlete,
  createAthleteGroupMembership,
  createTrainer,
  createTrainerGroupMembership,
  createTrainingGroup,
  type Athlete,
  type AthleteGroupMembership,
  type CreateAthleteGroupMembershipInput,
  type CreateAthleteInput,
  type CreateTrainerGroupMembershipInput,
  type CreateTrainerInput,
  type CreateTrainingGroupInput,
  type Trainer,
  type TrainerGroupMembership,
  type TrainingGroup,
} from './domain/masterdata';

export type AthleteMasterdataSqlParameter = string | number | boolean | null;

export interface AthleteMasterdataPostgresClient {
  unsafe(
    query: string,
    parameters?: AthleteMasterdataSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface AthleteMasterdataRetentionResult {
  readonly deletedAthletes: number;
  readonly deletedTrainers: number;
  readonly deletedAthleteGroupMemberships: number;
  readonly deletedTrainerGroupMemberships: number;
}

export type AthleteMasterdataDeletionEntityType = 'athlete' | 'trainer';

export interface AthleteMasterdataDeletionMarker {
  readonly entityType: AthleteMasterdataDeletionEntityType;
  readonly entityId: string;
  readonly organizationId: string;
  readonly completedAt: Date;
  readonly purgeAfter: Date;
}

export interface AthleteMasterdataDeletionReplayResult {
  readonly markerInserted: boolean;
  readonly deletedEntity: boolean;
  readonly deletedGroupMemberships: number;
}

export interface AthleteMasterdataSnapshot {
  readonly trainingGroups: readonly TrainingGroup[];
  readonly athletes: readonly Athlete[];
  readonly trainers: readonly Trainer[];
  readonly athleteGroupMemberships: readonly AthleteGroupMembership[];
  readonly trainerGroupMemberships: readonly TrainerGroupMembership[];
}

/**
 * PostgreSQL read boundary owned by the athletes module.
 *
 * The application must supply the organization from its authenticated
 * authorization context. Every statement repeats that boundary in SQL so the
 * caller cannot accidentally turn an app-level authorization bug into a
 * cross-organization data read.
 */
export class PostgresAthleteMasterdataRepository {
  readonly #client: AthleteMasterdataPostgresClient;
  readonly #createId: () => string;

  constructor(
    client: AthleteMasterdataPostgresClient,
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.#client = client;
    this.#createId = createId;
  }

  async createTrainingGroup(
    organizationId: string,
    input: CreateTrainingGroupInput,
  ): Promise<TrainingGroup> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const group = createTrainingGroup(input, {
      id: requiredGeneratedId(this.#createId()),
      organizationId: normalizedOrganizationId,
    });
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_training_group (
         id, organization_id, name, short_name, description, is_active, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, organization_id, name, short_name, description, is_active, sort_order`,
      [
        group.id,
        group.organizationId,
        group.name,
        group.shortName,
        group.description,
        group.isActive,
        group.sortOrder,
      ],
    );
    return singleRow(rows, (row) =>
      trainingGroupFromRow(row, normalizedOrganizationId),
    );
  }

  async createAthlete(
    organizationId: string,
    input: CreateAthleteInput,
  ): Promise<Athlete> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const athlete = createAthlete(input, {
      id: requiredGeneratedId(this.#createId()),
      organizationId: normalizedOrganizationId,
    });
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_athlete (
         id, organization_id, first_name, last_name, birth_year, notes, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, organization_id, first_name, last_name, birth_year, notes, is_active`,
      [
        athlete.id,
        athlete.organizationId,
        athlete.firstName,
        athlete.lastName,
        athlete.birthYear,
        athlete.notes,
        athlete.isActive,
      ],
    );
    return singleRow(rows, (row) =>
      athleteFromRow(row, normalizedOrganizationId),
    );
  }

  async createTrainer(
    organizationId: string,
    input: CreateTrainerInput,
  ): Promise<Trainer> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const trainer = createTrainer(input, {
      id: requiredGeneratedId(this.#createId()),
      organizationId: normalizedOrganizationId,
    });
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_trainer (
         id, organization_id, first_name, last_name, phone, email, notes, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id, first_name, last_name, phone, email, notes, is_active`,
      [
        trainer.id,
        trainer.organizationId,
        trainer.firstName,
        trainer.lastName,
        trainer.phone,
        trainer.email,
        trainer.notes,
        trainer.isActive,
      ],
    );
    return singleRow(rows, (row) =>
      trainerFromRow(row, normalizedOrganizationId),
    );
  }

  async createAthleteGroupMembership(
    organizationId: string,
    input: Omit<CreateAthleteGroupMembershipInput, 'organizationId'>,
  ): Promise<AthleteGroupMembership> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const membership = createAthleteGroupMembership({
      ...input,
      organizationId: normalizedOrganizationId,
    });
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_athlete_group_membership (
         organization_id, athlete_id, group_id, started_on, ended_on
       )
       SELECT $1, a.id, g.id, $4::date, $5::date
       FROM appbasis_athlete a
       INNER JOIN appbasis_training_group g
         ON g.id = $3 AND g.organization_id = $1 AND g.is_active = true
       WHERE a.id = $2
         AND a.organization_id = $1
         AND a.is_active = true
       RETURNING organization_id, athlete_id, group_id,
                 started_on::text AS started_on,
                 ended_on::text AS ended_on`,
      [
        normalizedOrganizationId,
        membership.athleteId,
        membership.groupId,
        membership.startedOn,
        membership.endedOn,
      ],
    );
    return singleRow(rows, (row) =>
      athleteGroupMembershipFromRow(row, normalizedOrganizationId),
    );
  }

  async createTrainerGroupMembership(
    organizationId: string,
    input: Omit<CreateTrainerGroupMembershipInput, 'organizationId'>,
  ): Promise<TrainerGroupMembership> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const membership = createTrainerGroupMembership({
      ...input,
      organizationId: normalizedOrganizationId,
    });
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_trainer_group_membership (
         organization_id, trainer_id, group_id
       )
       SELECT $1, t.id, g.id
       FROM appbasis_trainer t
       INNER JOIN appbasis_training_group g
         ON g.id = $3 AND g.organization_id = $1 AND g.is_active = true
       WHERE t.id = $2
         AND t.organization_id = $1
         AND t.is_active = true
       RETURNING organization_id, trainer_id, group_id`,
      [
        normalizedOrganizationId,
        membership.trainerId,
        membership.groupId,
      ],
    );
    return singleRow(rows, (row) =>
      trainerGroupMembershipFromRow(row, normalizedOrganizationId),
    );
  }

  async deactivateAthlete(
    organizationId: string,
    athleteId: string,
  ): Promise<boolean> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const normalizedAthleteId = requiredIdentifier(athleteId, 'Athlete id');
    const rows = await this.#client.unsafe(
      `WITH deactivated AS (
         UPDATE appbasis_athlete
         SET is_active = false, updated_at = now()
         WHERE id = $1
           AND organization_id = $2
           AND is_active = true
         RETURNING id
       ),
       closed_memberships AS (
         UPDATE appbasis_athlete_group_membership
         SET ended_on = COALESCE(
               ended_on,
               GREATEST(CURRENT_DATE, started_on)
             ),
             updated_at = now()
         WHERE organization_id = $2
           AND athlete_id IN (SELECT id FROM deactivated)
           AND ended_on IS NULL
       )
       SELECT id FROM deactivated`,
      [normalizedAthleteId, normalizedOrganizationId],
    );
    return rows.length === 1;
  }

  async deactivateTrainer(
    organizationId: string,
    trainerId: string,
  ): Promise<boolean> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );
    const normalizedTrainerId = requiredIdentifier(trainerId, 'Trainer id');
    const rows = await this.#client.unsafe(
      `UPDATE appbasis_trainer
       SET is_active = false, updated_at = now()
       WHERE id = $1
         AND organization_id = $2
         AND is_active = true
       RETURNING id`,
      [normalizedTrainerId, normalizedOrganizationId],
    );
    return rows.length === 1;
  }

  async purgeDeactivatedPersonalData(
    now: Date = new Date(),
  ): Promise<AthleteMasterdataRetentionResult> {
    const retentionNow = requiredDate(now);
    const rows = await this.#client.unsafe(
      `WITH due_athletes AS MATERIALIZED (
         SELECT organization_id, id
         FROM appbasis_athlete
         WHERE is_active = false
           AND updated_at + interval '12 months' <= $1::timestamptz
         FOR UPDATE
       ),
       athlete_markers AS (
         INSERT INTO appbasis_athletes_deletion (
           entity_type, entity_id, organization_id, completed_at, purge_after
         )
         SELECT 'athlete', id, organization_id,
                $1::timestamptz,
                $1::timestamptz + interval '35 days'
         FROM due_athletes
         RETURNING entity_id, organization_id
       ),
       deleted_athlete_memberships AS (
         DELETE FROM appbasis_athlete_group_membership m
         USING athlete_markers marker
         WHERE m.organization_id = marker.organization_id
           AND m.athlete_id = marker.entity_id
         RETURNING 1
       ),
       deleted_athletes AS (
         DELETE FROM appbasis_athlete a
         USING athlete_markers marker
         WHERE a.organization_id = marker.organization_id
           AND a.id = marker.entity_id
         RETURNING a.id
       ),
       due_trainers AS MATERIALIZED (
         SELECT organization_id, id
         FROM appbasis_trainer
         WHERE is_active = false
           AND updated_at + interval '12 months' <= $1::timestamptz
         FOR UPDATE
       ),
       trainer_markers AS (
         INSERT INTO appbasis_athletes_deletion (
           entity_type, entity_id, organization_id, completed_at, purge_after
         )
         SELECT 'trainer', id, organization_id,
                $1::timestamptz,
                $1::timestamptz + interval '35 days'
         FROM due_trainers
         RETURNING entity_id, organization_id
       ),
       deleted_trainer_memberships AS (
         DELETE FROM appbasis_trainer_group_membership m
         USING trainer_markers marker
         WHERE m.organization_id = marker.organization_id
           AND m.trainer_id = marker.entity_id
         RETURNING 1
       ),
       deleted_trainers AS (
         DELETE FROM appbasis_trainer t
         USING trainer_markers marker
         WHERE t.organization_id = marker.organization_id
           AND t.id = marker.entity_id
         RETURNING t.id
       )
       SELECT
         (SELECT count(*)::int FROM deleted_athletes) AS deleted_athletes,
         (SELECT count(*)::int FROM deleted_trainers) AS deleted_trainers,
         (SELECT count(*)::int FROM deleted_athlete_memberships)
           AS deleted_athlete_group_memberships,
         (SELECT count(*)::int FROM deleted_trainer_memberships)
           AS deleted_trainer_group_memberships`,
      [retentionNow.toISOString()],
    );
    return retentionResult(singleRawRow(rows));
  }

  async listCurrentDeletionMarkers(
    now: Date = new Date(),
  ): Promise<readonly AthleteMasterdataDeletionMarker[]> {
    const current = requiredDate(now);
    const rows = await this.#client.unsafe(
      `SELECT entity_type,
              entity_id,
              organization_id,
              completed_at,
              purge_after,
              completed_at <= $1::timestamptz AS completed_not_future,
              purge_after = completed_at + interval '35 days' AS retention_window_valid
       FROM appbasis_athletes_deletion
       WHERE purge_after >= $1::timestamptz
       ORDER BY completed_at ASC, entity_type ASC, entity_id ASC`,
      [current.toISOString()],
    );
    return Object.freeze(
      rows.map((row) => deletionMarkerFromRow(row, current)),
    );
  }

  async reconcileDeletionMarker(
    marker: AthleteMasterdataDeletionMarker,
  ): Promise<AthleteMasterdataDeletionReplayResult> {
    const normalized = requiredDeletionMarker(marker);
    const rows = await this.#client.unsafe(
      `WITH existing_marker AS MATERIALIZED (
         SELECT entity_type, entity_id, organization_id, completed_at, purge_after
         FROM appbasis_athletes_deletion
         WHERE entity_type = $1 AND entity_id = $2
       ),
       live_entity AS MATERIALIZED (
         SELECT organization_id
         FROM appbasis_athlete
         WHERE $1 = 'athlete' AND id = $2
         UNION ALL
         SELECT organization_id
         FROM appbasis_trainer
         WHERE $1 = 'trainer' AND id = $2
       ),
       state AS MATERIALIZED (
         SELECT
           (SELECT count(*)::int FROM existing_marker) AS existing_marker_count,
           (SELECT count(*)::int FROM live_entity) AS live_entity_count,
           COALESCE(
             (SELECT organization_id = $3 FROM existing_marker LIMIT 1),
             true
           ) AS existing_marker_org_matches,
           COALESCE(
             (SELECT organization_id = $3 FROM live_entity LIMIT 1),
             true
           ) AS live_entity_org_matches,
           COALESCE(
             (
               SELECT completed_at = $4::timestamptz
                 AND purge_after = $5::timestamptz
               FROM existing_marker
               LIMIT 1
             ),
             true
           ) AS existing_marker_time_matches
       ),
       inserted_marker AS (
         INSERT INTO appbasis_athletes_deletion (
           entity_type, entity_id, organization_id, completed_at, purge_after
         )
         SELECT $1, $2, $3, $4::timestamptz, $5::timestamptz
         FROM state
         WHERE existing_marker_count = 0
           AND live_entity_count <= 1
           AND live_entity_org_matches
         RETURNING entity_type, entity_id, organization_id
       ),
       replay_marker AS MATERIALIZED (
         SELECT entity_type, entity_id, organization_id
         FROM inserted_marker
         UNION ALL
         SELECT existing.entity_type, existing.entity_id, existing.organization_id
         FROM existing_marker existing
         CROSS JOIN state
         WHERE state.existing_marker_count = 1
           AND state.live_entity_count = 0
           AND state.existing_marker_org_matches
           AND state.existing_marker_time_matches
       ),
       deleted_athlete_memberships AS (
         DELETE FROM appbasis_athlete_group_membership m
         USING replay_marker marker
         WHERE marker.entity_type = 'athlete'
           AND m.organization_id = marker.organization_id
           AND m.athlete_id = marker.entity_id
         RETURNING 1
       ),
       deleted_trainer_memberships AS (
         DELETE FROM appbasis_trainer_group_membership m
         USING replay_marker marker
         WHERE marker.entity_type = 'trainer'
           AND m.organization_id = marker.organization_id
           AND m.trainer_id = marker.entity_id
         RETURNING 1
       ),
       deleted_athlete AS (
         DELETE FROM appbasis_athlete a
         USING replay_marker marker
         WHERE marker.entity_type = 'athlete'
           AND a.organization_id = marker.organization_id
           AND a.id = marker.entity_id
         RETURNING a.id
       ),
       deleted_trainer AS (
         DELETE FROM appbasis_trainer t
         USING replay_marker marker
         WHERE marker.entity_type = 'trainer'
           AND t.organization_id = marker.organization_id
           AND t.id = marker.entity_id
         RETURNING t.id
       )
       SELECT state.*,
              (SELECT count(*)::int FROM inserted_marker) AS inserted_marker_count,
              (SELECT count(*)::int FROM replay_marker) AS replay_marker_count,
              (
                (SELECT count(*)::int FROM deleted_athlete)
                + (SELECT count(*)::int FROM deleted_trainer)
              ) AS deleted_entity_count,
              (
                (SELECT count(*)::int FROM deleted_athlete_memberships)
                + (SELECT count(*)::int FROM deleted_trainer_memberships)
              ) AS deleted_group_membership_count
       FROM state`,
      [
        normalized.entityType,
        normalized.entityId,
        normalized.organizationId,
        normalized.completedAt.toISOString(),
        normalized.purgeAfter.toISOString(),
      ],
    );
    const row = singleRawRow(rows);
    const existingMarkerCount = rowNonNegativeInteger(
      row,
      'existing_marker_count',
    );
    const liveEntityCount = rowNonNegativeInteger(row, 'live_entity_count');
    const insertedMarkerCount = rowNonNegativeInteger(
      row,
      'inserted_marker_count',
    );
    const replayMarkerCount = rowNonNegativeInteger(row, 'replay_marker_count');
    const deletedEntityCount = rowNonNegativeInteger(
      row,
      'deleted_entity_count',
    );
    if (
      existingMarkerCount > 1 ||
      liveEntityCount > 1 ||
      insertedMarkerCount > 1 ||
      replayMarkerCount !== 1 ||
      row['existing_marker_org_matches'] !== true ||
      row['live_entity_org_matches'] !== true ||
      row['existing_marker_time_matches'] !== true ||
      (existingMarkerCount === 1 && liveEntityCount !== 0) ||
      (existingMarkerCount === 0 && insertedMarkerCount !== 1) ||
      deletedEntityCount !== liveEntityCount
    ) {
      invalidRow();
    }
    return Object.freeze({
      markerInserted: insertedMarkerCount === 1,
      deletedEntity: deletedEntityCount === 1,
      deletedGroupMemberships: rowNonNegativeInteger(
        row,
        'deleted_group_membership_count',
      ),
    });
  }

  async purgeExpiredDeletionMarkers(now: Date = new Date()): Promise<number> {
    const current = requiredDate(now);
    const rows = await this.#client.unsafe(
      `DELETE FROM appbasis_athletes_deletion
       WHERE purge_after < $1::timestamptz
       RETURNING entity_id`,
      [current.toISOString()],
    );
    return rows.length;
  }

  async readOrganizationSnapshot(
    organizationId: string,
  ): Promise<AthleteMasterdataSnapshot> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      'Organization id',
    );

    const trainingGroups = (
      await this.#client.unsafe(
        `SELECT id, organization_id, name, short_name, description, is_active, sort_order
         FROM appbasis_training_group
         WHERE organization_id = $1
         ORDER BY sort_order ASC, name ASC, id ASC`,
        [normalizedOrganizationId],
      )
    ).map((row) => trainingGroupFromRow(row, normalizedOrganizationId));

    const athletes = (
      await this.#client.unsafe(
        `SELECT id, organization_id, first_name, last_name, birth_year, notes, is_active
         FROM appbasis_athlete
         WHERE organization_id = $1
         ORDER BY last_name ASC, first_name ASC, id ASC`,
        [normalizedOrganizationId],
      )
    ).map((row) => athleteFromRow(row, normalizedOrganizationId));

    const trainers = (
      await this.#client.unsafe(
        `SELECT id, organization_id, first_name, last_name, phone, email, notes, is_active
         FROM appbasis_trainer
         WHERE organization_id = $1
         ORDER BY last_name ASC, first_name ASC, id ASC`,
        [normalizedOrganizationId],
      )
    ).map((row) => trainerFromRow(row, normalizedOrganizationId));

    const athleteGroupMemberships = (
      await this.#client.unsafe(
        `SELECT organization_id, athlete_id, group_id,
                started_on::text AS started_on,
                ended_on::text AS ended_on
         FROM appbasis_athlete_group_membership
         WHERE organization_id = $1
         ORDER BY athlete_id ASC, started_on ASC, group_id ASC`,
        [normalizedOrganizationId],
      )
    ).map((row) => athleteGroupMembershipFromRow(row, normalizedOrganizationId));

    const trainerGroupMemberships = (
      await this.#client.unsafe(
        `SELECT organization_id, trainer_id, group_id
         FROM appbasis_trainer_group_membership
         WHERE organization_id = $1
         ORDER BY trainer_id ASC, group_id ASC`,
        [normalizedOrganizationId],
      )
    ).map((row) => trainerGroupMembershipFromRow(row, normalizedOrganizationId));

    return Object.freeze({
      trainingGroups: Object.freeze(trainingGroups),
      athletes: Object.freeze(athletes),
      trainers: Object.freeze(trainers),
      athleteGroupMemberships: Object.freeze(athleteGroupMemberships),
      trainerGroupMemberships: Object.freeze(trainerGroupMemberships),
    });
  }
}

function deletionMarkerFromRow(
  row: Record<string, unknown>,
  now: Date,
): AthleteMasterdataDeletionMarker {
  if (
    row['completed_not_future'] !== true ||
    row['retention_window_valid'] !== true
  ) {
    invalidRow();
  }
  const marker = requiredDeletionMarker({
    entityType: requiredDeletionEntityType(row['entity_type']),
    entityId: rowString(row, 'entity_id'),
    organizationId: rowString(row, 'organization_id'),
    completedAt: requiredDate(row['completed_at']),
    purgeAfter: requiredDate(row['purge_after']),
  });
  if (marker.purgeAfter.getTime() < now.getTime()) invalidRow();
  return marker;
}

function requiredDeletionMarker(
  marker: AthleteMasterdataDeletionMarker,
): AthleteMasterdataDeletionMarker {
  const entityType = requiredDeletionEntityType(marker.entityType);
  const entityId = requiredIdentifier(marker.entityId, 'Deletion entity id');
  const organizationId = requiredIdentifier(
    marker.organizationId,
    'Deletion organization id',
  );
  const completedAt = requiredDate(marker.completedAt);
  const purgeAfter = requiredDate(marker.purgeAfter);
  const expectedPurgeAfter = new Date(
    completedAt.getTime() + 35 * 24 * 60 * 60 * 1000,
  );
  if (purgeAfter.getTime() !== expectedPurgeAfter.getTime()) invalidRow();
  return Object.freeze({
    entityType,
    entityId,
    organizationId,
    completedAt,
    purgeAfter,
  });
}

function requiredDeletionEntityType(
  value: unknown,
): AthleteMasterdataDeletionEntityType {
  if (value !== 'athlete' && value !== 'trainer') invalidRow();
  return value;
}

function requiredGeneratedId(value: string): string {
  return requiredIdentifier(value, 'Generated entity id');
}

function requiredDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error('Retention clock is invalid.');
  }
  return new Date(value.getTime());
}

function singleRawRow(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown> {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Athletes masterdata persistence returned an invalid row count.');
  }
  return rows[0];
}

function singleRow<T>(
  rows: readonly Record<string, unknown>[],
  map: (row: Record<string, unknown>) => T,
): T {
  return map(singleRawRow(rows));
}

function retentionResult(
  row: Record<string, unknown>,
): AthleteMasterdataRetentionResult {
  return Object.freeze({
    deletedAthletes: rowNonNegativeInteger(row, 'deleted_athletes'),
    deletedTrainers: rowNonNegativeInteger(row, 'deleted_trainers'),
    deletedAthleteGroupMemberships: rowNonNegativeInteger(
      row,
      'deleted_athlete_group_memberships',
    ),
    deletedTrainerGroupMemberships: rowNonNegativeInteger(
      row,
      'deleted_trainer_group_memberships',
    ),
  });
}

function trainingGroupFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): TrainingGroup {
  const organizationId = rowOrganization(row, expectedOrganizationId);
  return {
    id: rowString(row, 'id'),
    organizationId,
    name: rowString(row, 'name'),
    shortName: rowNullableString(row, 'short_name'),
    description: rowNullableString(row, 'description'),
    isActive: rowBoolean(row, 'is_active'),
    sortOrder: rowInteger(row, 'sort_order'),
  };
}

function athleteFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): Athlete {
  const organizationId = rowOrganization(row, expectedOrganizationId);
  return {
    id: rowString(row, 'id'),
    organizationId,
    firstName: rowString(row, 'first_name'),
    lastName: rowString(row, 'last_name'),
    birthYear: rowNullableInteger(row, 'birth_year'),
    notes: rowNullableString(row, 'notes'),
    isActive: rowBoolean(row, 'is_active'),
  };
}

function trainerFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): Trainer {
  const organizationId = rowOrganization(row, expectedOrganizationId);
  return {
    id: rowString(row, 'id'),
    organizationId,
    firstName: rowString(row, 'first_name'),
    lastName: rowString(row, 'last_name'),
    phone: rowNullableString(row, 'phone'),
    email: rowNullableString(row, 'email'),
    notes: rowNullableString(row, 'notes'),
    isActive: rowBoolean(row, 'is_active'),
  };
}

function athleteGroupMembershipFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): AthleteGroupMembership {
  return {
    organizationId: rowOrganization(row, expectedOrganizationId),
    athleteId: rowString(row, 'athlete_id'),
    groupId: rowString(row, 'group_id'),
    startedOn: rowString(row, 'started_on'),
    endedOn: rowNullableString(row, 'ended_on'),
  };
}

function trainerGroupMembershipFromRow(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): TrainerGroupMembership {
  return {
    organizationId: rowOrganization(row, expectedOrganizationId),
    trainerId: rowString(row, 'trainer_id'),
    groupId: rowString(row, 'group_id'),
  };
}

function requiredIdentifier(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function rowOrganization(
  row: Record<string, unknown>,
  expectedOrganizationId: string,
): string {
  const value = rowString(row, 'organization_id');
  if (value !== expectedOrganizationId) invalidRow();
  return value;
}

function rowString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') invalidRow();
  return value;
}

function rowNullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'string') invalidRow();
  return value;
}

function rowBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') invalidRow();
  return value;
}

function rowNonNegativeInteger(
  row: Record<string, unknown>,
  key: string,
): number {
  const value = rowInteger(row, key);
  if (value < 0) invalidRow();
  return value;
}

function rowInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalidRow();
  return value;
}

function rowNullableInteger(
  row: Record<string, unknown>,
  key: string,
): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalidRow();
  return value;
}

function invalidRow(): never {
  throw new Error('Athletes masterdata row has an invalid shape.');
}
