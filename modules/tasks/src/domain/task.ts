export type TaskStatus = 'open' | 'completed';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
}

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string;
}

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

export function createTask(input: CreateTaskInput, id: string): Task {
  const title = input.title.trim();

  if (title.length === 0) {
    throw new TaskValidationError('A task title is required.');
  }

  return {
    id,
    title,
    description: input.description?.trim() ?? '',
    status: 'open',
  };
}

export function toggleTaskStatus(task: Task): Task {
  return {
    ...task,
    status: task.status === 'open' ? 'completed' : 'open',
  };
}
