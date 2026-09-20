export interface SchoolClass {
  readonly id: string;
  readonly name: string;
  readonly schoolYear: string;
  readonly archived: boolean;
}

export interface Student {
  readonly id: string;
  readonly classId: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface CreateSchoolClassInput {
  readonly name: string;
  readonly schoolYear: string;
}

export interface CreateStudentInput {
  readonly classId: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface MasterDataRepository {
  listClasses(): Promise<readonly SchoolClass[]>;
  createClass(input: CreateSchoolClassInput): Promise<SchoolClass>;
  archiveClass(id: string): Promise<SchoolClass | undefined>;
  listStudents(classId: string): Promise<readonly Student[]>;
  createStudent(input: CreateStudentInput): Promise<Student>;
}

export class MasterDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataValidationError";
  }
}

export class MasterDataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataConflictError";
  }
}

export class MasterDataStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterDataStateError";
  }
}

type MasterDataSqlParameter = string | number | boolean | null;

export interface MasterDataPostgresClient {
  unsafe(
    query: string,
    parameters?: MasterDataSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export class PostgresMasterDataRepository implements MasterDataRepository {
  constructor(
    private readonly client: MasterDataPostgresClient,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async listClasses(): Promise<readonly SchoolClass[]> {
    const rows = await this.client.unsafe(
      `SELECT id, name, school_year, archived_at
       FROM unterrichtsverwaltung_class
       ORDER BY school_year DESC, name ASC, id ASC`,
    );
    return rows.map(classFromRow);
  }

  async createClass(input: CreateSchoolClassInput): Promise<SchoolClass> {
    const normalized = normalizeClassInput(input);
    const rows = await this.client.unsafe(
      `INSERT INTO unterrichtsverwaltung_class (id, name, school_year)
       VALUES ($1, $2, $3)
       ON CONFLICT (school_year, name) DO NOTHING
       RETURNING id, name, school_year, archived_at`,
      [this.createId(), normalized.name, normalized.schoolYear],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new MasterDataConflictError(
        "Eine Klasse mit diesem Namen existiert in diesem Schuljahr bereits.",
      );
    }
    return classFromRow(row);
  }

  async archiveClass(id: string): Promise<SchoolClass | undefined> {
    const classId = requiredText(id, "classId", 120);
    const rows = await this.client.unsafe(
      `UPDATE unterrichtsverwaltung_class
       SET archived_at = COALESCE(archived_at, now()),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, school_year, archived_at`,
      [classId],
    );
    const row = rows[0];
    return row === undefined ? undefined : classFromRow(row);
  }

  async listStudents(classId: string): Promise<readonly Student[]> {
    const normalizedClassId = requiredText(classId, "classId", 120);
    const rows = await this.client.unsafe(
      `SELECT id, class_id, first_name, last_name
       FROM unterrichtsverwaltung_student
       WHERE class_id = $1
       ORDER BY last_name ASC, first_name ASC, id ASC`,
      [normalizedClassId],
    );
    return rows.map(studentFromRow);
  }

  async createStudent(input: CreateStudentInput): Promise<Student> {
    const normalized = normalizeStudentInput(input);
    const rows = await this.client.unsafe(
      `INSERT INTO unterrichtsverwaltung_student
         (id, class_id, first_name, last_name)
       SELECT $1, c.id, $3, $4
       FROM unterrichtsverwaltung_class c
       WHERE c.id = $2 AND c.archived_at IS NULL
       RETURNING id, class_id, first_name, last_name`,
      [
        this.createId(),
        normalized.classId,
        normalized.firstName,
        normalized.lastName,
      ],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new MasterDataStateError(
        "Die ausgewählte Klasse ist nicht verfügbar.",
      );
    }
    return studentFromRow(row);
  }
}

export class InMemoryMasterDataRepository implements MasterDataRepository {
  readonly #classes = new Map<string, SchoolClass>();
  readonly #students = new Map<string, Student>();

  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  async listClasses(): Promise<readonly SchoolClass[]> {
    return [...this.#classes.values()].sort(
      (left, right) =>
        right.schoolYear.localeCompare(left.schoolYear) ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  }

  async createClass(input: CreateSchoolClassInput): Promise<SchoolClass> {
    const normalized = normalizeClassInput(input);
    if (
      [...this.#classes.values()].some(
        (entry) =>
          entry.schoolYear === normalized.schoolYear &&
          entry.name === normalized.name,
      )
    ) {
      throw new MasterDataConflictError(
        "Eine Klasse mit diesem Namen existiert in diesem Schuljahr bereits.",
      );
    }
    const schoolClass: SchoolClass = Object.freeze({
      id: this.createId(),
      ...normalized,
      archived: false,
    });
    this.#classes.set(schoolClass.id, schoolClass);
    return schoolClass;
  }

  async archiveClass(id: string): Promise<SchoolClass | undefined> {
    const classId = requiredText(id, "classId", 120);
    const current = this.#classes.get(classId);
    if (current === undefined) return undefined;
    const archived = Object.freeze({ ...current, archived: true });
    this.#classes.set(classId, archived);
    return archived;
  }

  async listStudents(classId: string): Promise<readonly Student[]> {
    const normalizedClassId = requiredText(classId, "classId", 120);
    return [...this.#students.values()]
      .filter((student) => student.classId === normalizedClassId)
      .sort(
        (left, right) =>
          left.lastName.localeCompare(right.lastName) ||
          left.firstName.localeCompare(right.firstName) ||
          left.id.localeCompare(right.id),
      );
  }

  async createStudent(input: CreateStudentInput): Promise<Student> {
    const normalized = normalizeStudentInput(input);
    const schoolClass = this.#classes.get(normalized.classId);
    if (schoolClass === undefined || schoolClass.archived) {
      throw new MasterDataStateError(
        "Die ausgewählte Klasse ist nicht verfügbar.",
      );
    }
    const student: Student = Object.freeze({
      id: this.createId(),
      ...normalized,
    });
    this.#students.set(student.id, student);
    return student;
  }
}

function normalizeClassInput(input: CreateSchoolClassInput) {
  const name = requiredText(input.name, "name", 80);
  const schoolYear = requiredSchoolYear(input.schoolYear);
  return Object.freeze({ name, schoolYear });
}

function normalizeStudentInput(input: CreateStudentInput) {
  return Object.freeze({
    classId: requiredText(input.classId, "classId", 120),
    firstName: requiredText(input.firstName, "firstName", 80),
    lastName: requiredText(input.lastName, "lastName", 80),
  });
}

function requiredText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new MasterDataValidationError(`${field} ist ungültig.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new MasterDataValidationError(`${field} ist ungültig.`);
  }
  return normalized;
}

function requiredSchoolYear(value: string): string {
  const normalized = requiredText(value, "schoolYear", 7);
  const match = /^(\d{4})\/(\d{2})$/.exec(normalized);
  if (match === null) {
    throw new MasterDataValidationError("schoolYear ist ungültig.");
  }
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if ((startYear + 1) % 100 !== endYear) {
    throw new MasterDataValidationError("schoolYear ist ungültig.");
  }
  return normalized;
}

function classFromRow(row: Record<string, unknown>): SchoolClass {
  const id = row.id;
  const name = row.name;
  const schoolYear = row.school_year;
  const archivedAt = row.archived_at;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof schoolYear !== "string" ||
    !(
      archivedAt === null ||
      archivedAt instanceof Date ||
      typeof archivedAt === "string"
    )
  ) {
    throw new Error("Class row has an invalid shape.");
  }
  return Object.freeze({
    id,
    name,
    schoolYear,
    archived: archivedAt !== null,
  });
}

function studentFromRow(row: Record<string, unknown>): Student {
  const id = row.id;
  const classId = row.class_id;
  const firstName = row.first_name;
  const lastName = row.last_name;
  if (
    typeof id !== "string" ||
    typeof classId !== "string" ||
    typeof firstName !== "string" ||
    typeof lastName !== "string"
  ) {
    throw new Error("Student row has an invalid shape.");
  }
  return Object.freeze({ id, classId, firstName, lastName });
}
