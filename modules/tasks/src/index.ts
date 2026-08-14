export const TASK_CAPABILITIES = {
  manage: 'tasks:manage',
} as const;

export { InMemoryTaskRepository } from './in-memory-task-repository';
export { PostgresTaskRepository } from './postgres-task-repository';
export { TaskValidationError } from './domain/task';
export type { CreateTaskInput, Task, TaskStatus } from './domain/task';
export type { TaskPostgresClient, TaskSqlParameter } from './postgres-task-repository';
export type { TaskRepository } from './task-repository';
