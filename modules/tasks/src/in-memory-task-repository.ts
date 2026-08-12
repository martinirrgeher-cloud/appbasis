import { createTask, toggleTaskStatus, type CreateTaskInput, type Task } from './domain/task';
import type { TaskRepository } from './task-repository';

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks: Map<string, Task>;
  #nextId: number;

  constructor(initialTasks: readonly Task[] = []) {
    this.#tasks = new Map(initialTasks.map((task) => [task.id, task]));
    this.#nextId = initialTasks.length + 1;
  }

  list(): readonly Task[] {
    return [...this.#tasks.values()];
  }

  findById(id: string): Task | undefined {
    return this.#tasks.get(id);
  }

  create(input: CreateTaskInput): Task {
    const task = createTask(input, String(this.#nextId++));
    this.#tasks.set(task.id, task);
    return task;
  }

  toggleStatus(id: string): Task | undefined {
    const task = this.#tasks.get(id);

    if (!task) {
      return undefined;
    }

    const updatedTask = toggleTaskStatus(task);
    this.#tasks.set(id, updatedTask);
    return updatedTask;
  }
}
