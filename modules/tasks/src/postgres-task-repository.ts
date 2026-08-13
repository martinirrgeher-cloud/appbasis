import { createTask, type CreateTaskInput, type Task, type TaskStatus } from './domain/task';
import type { TaskRepository } from './task-repository';

export type TaskSqlParameter = string | number | boolean | null;

export interface TaskPostgresClient {
  unsafe(
    query: string,
    parameters?: TaskSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export class PostgresTaskRepository implements TaskRepository {
  readonly #client: TaskPostgresClient;
  readonly #createId: () => string;

  constructor(client: TaskPostgresClient, createId: () => string = () => crypto.randomUUID()) {
    this.#client = client;
    this.#createId = createId;
  }

  async list(): Promise<readonly Task[]> {
    const rows = await this.#client.unsafe(
      `SELECT id, title, description, status
       FROM appbasis_task
       ORDER BY created_at ASC, id ASC`,
    );
    return rows.map(taskFromRow);
  }

  async findById(id: string): Promise<Task | undefined> {
    const rows = await this.#client.unsafe(
      `SELECT id, title, description, status
       FROM appbasis_task
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? undefined : taskFromRow(row);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task = createTask(input, this.#createId());
    const rows = await this.#client.unsafe(
      `INSERT INTO appbasis_task (id, title, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, description, status`,
      [task.id, task.title, task.description, task.status],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Task insert did not return a row.');
    }
    return taskFromRow(row);
  }

  async toggleStatus(id: string): Promise<Task | undefined> {
    const rows = await this.#client.unsafe(
      `UPDATE appbasis_task
       SET status = CASE status
         WHEN 'open' THEN 'completed'
         ELSE 'open'
       END,
       updated_at = now()
       WHERE id = $1
       RETURNING id, title, description, status`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? undefined : taskFromRow(row);
  }
}

function taskFromRow(row: Record<string, unknown>): Task {
  const id = row.id;
  const title = row.title;
  const description = row.description;
  const status = row.status;

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    !isTaskStatus(status)
  ) {
    throw new Error('Task row has an invalid shape.');
  }

  return { id, title, description, status };
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'open' || value === 'completed';
}
