import { describe, expect, it } from 'vitest';

import { InMemoryTaskRepository } from '../../../modules/tasks/src';

describe('InMemoryTaskRepository', () => {
  it('creates a normalized open task', () => {
    const repository = new InMemoryTaskRepository();

    const task = repository.create({ title: '  Demo prüfen  ', description: '  Mobile Ansicht  ' });

    expect(task).toEqual({ id: '1', title: 'Demo prüfen', description: 'Mobile Ansicht', status: 'open' });
    expect(repository.list()).toEqual([task]);
  });

  it('toggles a task between open and completed', () => {
    const repository = new InMemoryTaskRepository();
    const task = repository.create({ title: 'Status testen' });

    expect(repository.toggleStatus(task.id)?.status).toBe('completed');
    expect(repository.toggleStatus(task.id)?.status).toBe('open');
  });

  it('returns undefined for unknown tasks', () => {
    const repository = new InMemoryTaskRepository();

    expect(repository.findById('missing')).toBeUndefined();
    expect(repository.toggleStatus('missing')).toBeUndefined();
  });

  it('rejects an empty title without changing the list', () => {
    const repository = new InMemoryTaskRepository();

    expect(() => repository.create({ title: '   ' })).toThrow('A task title is required.');
    expect(repository.list()).toHaveLength(0);
  });

  it('does not overwrite seeded tasks when allocating numeric ids', () => {
    const repository = new InMemoryTaskRepository([
      { id: '1', title: 'Erste Aufgabe', description: '', status: 'open' },
      { id: '3', title: 'Dritte Aufgabe', description: '', status: 'completed' },
    ]);

    const second = repository.create({ title: 'Zweite Aufgabe' });
    const fourth = repository.create({ title: 'Vierte Aufgabe' });

    expect(second.id).toBe('2');
    expect(fourth.id).toBe('4');
    expect(repository.findById('3')?.title).toBe('Dritte Aufgabe');
    expect(repository.list()).toHaveLength(4);
  });
});
