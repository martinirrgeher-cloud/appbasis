import { createTask, toggleTaskStatus, type CreateTaskInput, type Task } from './domain/task';
import type { TaskRepository } from './task-repository';

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks: Map<string, Task>;
  #nextId = 1;

  constructor(initialTasks: readonly Task[] = []) {
    this.#tasks = new Map(initialTasks.map((task) => [task.id, task]));
  }

  async list(): Promise<readonly Task[]> {
    return [...this.#tasks.values()];
  }

  async findById(id: string): Promise<Task | undefined> {
    return this.#tasks.get(id);
  }

  async create(input: CreateTaskInput): Promise<Task> {
    while (this.#tasks.has(String(this.#nextId))) {
      this.#nextId += 1;
    }

    const task = createTask(input, String(this.#nextId));
    this.#nextId += 1;
    this.#tasks.set(task.id, task);
    return task;
  }

  async toggleStatus(id: string): Promise<Task | undefined> {
    const task = this.#tasks.get(id);

    if (!task) {
      return undefined;
    }

    const updatedTask = toggleTaskStatus(task);
    this.#tasks.set(id, updatedTask);
    return updatedTask;
  }
}
