export interface EntityContext {
  readonly id: string;
  readonly organizationId: string;
}

export interface TrainingGroup {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

export interface CreateTrainingGroupInput {
  readonly name: string;
  readonly shortName?: string | null;
  readonly description?: string | null;
  readonly sortOrder?: number;
}

export interface Athlete {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear: number | null;
  readonly notes: string | null;
  readonly isActive: boolean;
}

export interface CreateAthleteInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthYear?: number | null;
  readonly notes?: string | null;
}

export interface Trainer {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
}

export interface CreateTrainerInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly notes?: string | null;
}

export interface AthleteGroupMembership {
  readonly organizationId: string;
  readonly athleteId: string;
  readonly groupId: string;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface CreateAthleteGroupMembershipInput {
  readonly organizationId: string;
  readonly athleteId: string;
  readonly groupId: string;
  readonly startedOn: string;
  readonly endedOn?: string | null;
}

export interface TrainerGroupMembership {
  readonly organizationId: string;
  readonly trainerId: string;
  readonly groupId: string;
}

export interface CreateTrainerGroupMembershipInput {
  readonly organizationId: string;
  readonly trainerId: string;
  readonly groupId: string;
}

export class MasterdataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MasterdataValidationError';
  }
}

export function createTrainingGroup(
  input: CreateTrainingGroupInput,
  context: EntityContext,
): TrainingGroup {
  return {
    id: requiredIdentifier(context.id, 'Training group id'),
    organizationId: requiredIdentifier(
      context.organizationId,
      'Organization id',
    ),
    name: requiredText(input.name, 'Training group name', 2, 100),
    shortName: optionalText(input.shortName, 'Training group short name', 20),
    description: optionalText(input.description, 'Training group description', 1000),
    isActive: true,
    sortOrder: integerInRange(input.sortOrder ?? 100, 'Training group sort order', 0, 10000),
  };
}

export function createAthlete(
  input: CreateAthleteInput,
  context: EntityContext,
): Athlete {
  return {
    id: requiredIdentifier(context.id, 'Athlete id'),
    organizationId: requiredIdentifier(
      context.organizationId,
      'Organization id',
    ),
    firstName: requiredText(input.firstName, 'Athlete first name', 1, 80),
    lastName: requiredText(input.lastName, 'Athlete last name', 1, 80),
    birthYear:
      input.birthYear === undefined || input.birthYear === null
        ? null
        : integerInRange(input.birthYear, 'Athlete birth year', 1900, 2100),
    notes: optionalText(input.notes, 'Athlete notes', 3000),
    isActive: true,
  };
}

export function createTrainer(
  input: CreateTrainerInput,
  context: EntityContext,
): Trainer {
  return {
    id: requiredIdentifier(context.id, 'Trainer id'),
    organizationId: requiredIdentifier(
      context.organizationId,
      'Organization id',
    ),
    firstName: requiredText(input.firstName, 'Trainer first name', 1, 80),
    lastName: requiredText(input.lastName, 'Trainer last name', 1, 80),
    phone: optionalText(input.phone, 'Trainer phone', 80),
    email: optionalText(input.email, 'Trainer email', 320),
    notes: optionalText(input.notes, 'Trainer notes', 3000),
    isActive: true,
  };
}

export function createAthleteGroupMembership(
  input: CreateAthleteGroupMembershipInput,
): AthleteGroupMembership {
  const startedOn = isoDate(input.startedOn, 'Membership start date');
  const endedOn =
    input.endedOn === undefined || input.endedOn === null
      ? null
      : isoDate(input.endedOn, 'Membership end date');

  if (endedOn !== null && endedOn < startedOn) {
    throw new MasterdataValidationError(
      'Membership end date must not be before its start date.',
    );
  }

  return {
    organizationId: requiredIdentifier(input.organizationId, 'Organization id'),
    athleteId: requiredIdentifier(input.athleteId, 'Athlete id'),
    groupId: requiredIdentifier(input.groupId, 'Training group id'),
    startedOn,
    endedOn,
  };
}

export function createTrainerGroupMembership(
  input: CreateTrainerGroupMembershipInput,
): TrainerGroupMembership {
  return {
    organizationId: requiredIdentifier(input.organizationId, 'Organization id'),
    trainerId: requiredIdentifier(input.trainerId, 'Trainer id'),
    groupId: requiredIdentifier(input.groupId, 'Training group id'),
  };
}

function requiredIdentifier(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MasterdataValidationError(`${label} is required.`);
  }
  return value.trim();
}

function requiredText(
  value: string,
  label: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new MasterdataValidationError(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new MasterdataValidationError(
      `${label} must contain between ${minLength} and ${maxLength} characters.`,
    );
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new MasterdataValidationError(`${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) {
    throw new MasterdataValidationError(
      `${label} must contain at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

function integerInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new MasterdataValidationError(
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function isoDate(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new MasterdataValidationError(
      `${label} must use YYYY-MM-DD.`,
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new MasterdataValidationError(`${label} is invalid.`);
  }

  return value;
}
