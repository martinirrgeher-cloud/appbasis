import { createTask, toggleTaskStatus, type CreateTaskInput, type Task } from './domain/task';
import type { TaskRepository } from './task-repository';

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks: Map<string, Task>;
  #nextId = 1;

  constructor(initialTasks: readonly Task[] = []) {
    this.#tasks = new Map(initialTasks.map((task) => [task.id, task]));
  }

  list(): readonly Task[] {
    return [...this.#tasks.values()];
  }

  findById(id: string): Task | undefined {
    return this.#tasks.get(id);
  }

  create(input: CreateTaskInput): Task {
    while (this.#tasks.has(String(this.#nextId))) {
      this.#nextId += 1;
    }

    const task = createTask(input, String(this.#nextId));
    this.#nextId += 1;
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
