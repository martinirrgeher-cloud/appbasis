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
      `WITH due_athletes AS (
         DELETE FROM appbasis_athlete
         WHERE is_active = false
           AND updated_at + interval '12 months' <= $1::timestamptz
         RETURNING organization_id, id
       ),
       deleted_athlete_memberships AS (
         DELETE FROM appbasis_athlete_group_membership m
         USING due_athletes d
         WHERE m.organization_id = d.organization_id
           AND m.athlete_id = d.id
         RETURNING 1
       ),
       due_trainers AS (
         DELETE FROM appbasis_trainer
         WHERE is_active = false
           AND updated_at + interval '12 months' <= $1::timestamptz
         RETURNING organization_id, id
       ),
       deleted_trainer_memberships AS (
         DELETE FROM appbasis_trainer_group_membership m
         USING due_trainers d
         WHERE m.organization_id = d.organization_id
           AND m.trainer_id = d.id
         RETURNING 1
       )
       SELECT
         (SELECT count(*)::int FROM due_athletes) AS deleted_athletes,
         (SELECT count(*)::int FROM due_trainers) AS deleted_trainers,
         (SELECT count(*)::int FROM deleted_athlete_memberships)
           AS deleted_athlete_group_memberships,
         (SELECT count(*)::int FROM deleted_trainer_memberships)
           AS deleted_trainer_group_memberships`,
      [retentionNow.toISOString()],
    );
    return retentionResult(singleRawRow(rows));
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
