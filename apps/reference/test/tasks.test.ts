import { describe, expect, it } from 'vitest';

import { InMemoryTaskRepository } from '../../../modules/tasks/src';

describe('InMemoryTaskRepository', () => {
  it('creates a normalized open task', async () => {
    const repository = new InMemoryTaskRepository();

    const task = await repository.create({
      title: '  Demo prüfen  ',
      description: '  Mobile Ansicht  ',
    });

    expect(task).toEqual({
      id: '1',
      title: 'Demo prüfen',
      description: 'Mobile Ansicht',
      status: 'open',
    });
    await expect(repository.list()).resolves.toEqual([task]);
  });

  it('toggles a task between open and completed', async () => {
    const repository = new InMemoryTaskRepository();
    const task = await repository.create({ title: 'Status testen' });

    expect((await repository.toggleStatus(task.id))?.status).toBe('completed');
    expect((await repository.toggleStatus(task.id))?.status).toBe('open');
  });

  it('returns undefined for unknown tasks', async () => {
    const repository = new InMemoryTaskRepository();

    await expect(repository.findById('missing')).resolves.toBeUndefined();
    await expect(repository.toggleStatus('missing')).resolves.toBeUndefined();
  });

  it('rejects an empty title without changing the list', async () => {
    const repository = new InMemoryTaskRepository();

    await expect(repository.create({ title: '   ' })).rejects.toThrow(
      'A task title is required.',
    );
    await expect(repository.list()).resolves.toHaveLength(0);
  });

  it('does not overwrite seeded tasks when allocating numeric ids', async () => {
    const repository = new InMemoryTaskRepository([
      { id: '1', title: 'Erste Aufgabe', description: '', status: 'open' },
      { id: '3', title: 'Dritte Aufgabe', description: '', status: 'completed' },
    ]);

    const second = await repository.create({ title: 'Zweite Aufgabe' });
    const fourth = await repository.create({ title: 'Vierte Aufgabe' });

    expect(second.id).toBe('2');
    expect(fourth.id).toBe('4');
    expect((await repository.findById('3'))?.title).toBe('Dritte Aufgabe');
    await expect(repository.list()).resolves.toHaveLength(4);
  });
});
