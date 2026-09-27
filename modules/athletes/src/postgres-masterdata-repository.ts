import type {
  Athlete,
  AthleteGroupMembership,
  Trainer,
  TrainerGroupMembership,
  TrainingGroup,
} from './domain/masterdata';

export type AthleteMasterdataSqlParameter = string | number | boolean | null;

export interface AthleteMasterdataPostgresClient {
  unsafe(
    query: string,
    parameters?: AthleteMasterdataSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
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

  constructor(client: AthleteMasterdataPostgresClient) {
    this.#client = client;
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
