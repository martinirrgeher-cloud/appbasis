import type { CreateTaskInput, Task } from './domain/task';

export interface TaskRepository {
  list(): Promise<readonly Task[]>;
  findById(id: string): Promise<Task | undefined>;
  create(input: CreateTaskInput): Promise<Task>;
  toggleStatus(id: string): Promise<Task | undefined>;
}
