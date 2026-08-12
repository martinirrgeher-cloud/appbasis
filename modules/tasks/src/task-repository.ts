import type { CreateTaskInput, Task } from './domain/task';

export interface TaskRepository {
  list(): readonly Task[];
  findById(id: string): Task | undefined;
  create(input: CreateTaskInput): Task;
  toggleStatus(id: string): Task | undefined;
}
