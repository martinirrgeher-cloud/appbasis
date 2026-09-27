import { describe, expect, it } from 'vitest';

import { PostgresAthleteMasterdataRepository } from '../src/postgres-masterdata-repository';

describe('PostgresAthleteMasterdataRepository', () => {
  it('reads every Stammdaten collection through the same organization boundary', async () => {
    const calls: Array<{ query: string; parameters?: readonly unknown[] }> = [];
    const rows = [
      [
        {
          id: 'group-1',
          organization_id: 'verein-1',
          name: 'U14',
          short_name: 'U14',
          description: null,
          is_active: true,
          sort_order: 10,
        },
      ],
      [
        {
          id: 'athlete-1',
          organization_id: 'verein-1',
          first_name: 'Anna',
          last_name: 'Muster',
          birth_year: 2012,
          notes: null,
          is_active: true,
        },
      ],
      [
        {
          id: 'trainer-1',
          organization_id: 'verein-1',
          first_name: 'Max',
          last_name: 'Trainer',
          phone: null,
          email: 'max@example.test',
          notes: null,
          is_active: true,
        },
      ],
      [
        {
          organization_id: 'verein-1',
          athlete_id: 'athlete-1',
          group_id: 'group-1',
          started_on: '2026-09-01',
          ended_on: null,
        },
      ],
      [
        {
          organization_id: 'verein-1',
          trainer_id: 'trainer-1',
          group_id: 'group-1',
        },
      ],
    ];
    let index = 0;
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return rows[index++] ?? [];
      },
    });

    const snapshot = await repository.readOrganizationSnapshot('verein-1');

    expect(snapshot.trainingGroups).toHaveLength(1);
    expect(snapshot.athletes[0]?.firstName).toBe('Anna');
    expect(snapshot.trainers[0]?.email).toBe('max@example.test');
    expect(snapshot.athleteGroupMemberships[0]?.startedOn).toBe('2026-09-01');
    expect(snapshot.trainerGroupMemberships).toHaveLength(1);
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.query).toContain('WHERE organization_id = $1');
      expect(call.parameters).toEqual(['verein-1']);
    }
  });

  it('rejects an invalid organization before issuing SQL', async () => {
    let calls = 0;
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        calls += 1;
        return [];
      },
    });

    await expect(repository.readOrganizationSnapshot(' verein-1 ')).rejects.toThrow(
      /Organization id is invalid/,
    );
    expect(calls).toBe(0);
  });

  it('fails closed on malformed database rows', async () => {
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        return [
          {
            id: 'group-1',
            organization_id: 'verein-1',
            name: 'U14',
            short_name: null,
            description: null,
            is_active: 'yes',
            sort_order: 10,
          },
        ];
      },
    });

    await expect(repository.readOrganizationSnapshot('verein-1')).rejects.toThrow(
      /invalid shape/,
    );
  });
});
