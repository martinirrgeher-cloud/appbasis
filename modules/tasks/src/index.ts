import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const TASK_CAPABILITIES = {
  manage: requiredTaskCapability("tasks:manage"),
} as const;

export { InMemoryTaskRepository } from "./in-memory-task-repository";
export { PostgresTaskRepository } from "./postgres-task-repository";
export { TaskValidationError } from "./domain/task";
export type { CreateTaskInput, Task, TaskStatus } from "./domain/task";
export type {
  TaskPostgresClient,
  TaskSqlParameter,
} from "./postgres-task-repository";
export type { TaskRepository } from "./task-repository";

function requiredTaskCapability<const T extends string>(capability: T): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Tasks capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
