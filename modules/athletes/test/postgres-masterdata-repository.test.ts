import { describe, expect, it } from 'vitest';

import { PostgresAthleteMasterdataRepository } from '../src/postgres-masterdata-repository';

describe('PostgresAthleteMasterdataRepository', () => {
  it('reads every Stammdaten collection through the same organization boundary', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
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


  it('creates athletes with a server-generated id and server-provided organization', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository(
      {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          return [
            {
              id: 'athlete-server-1',
              organization_id: 'verein-1',
              first_name: 'Anna',
              last_name: 'Muster',
              birth_year: 2012,
              notes: null,
              is_active: true,
            },
          ];
        },
      },
      () => 'athlete-server-1',
    );

    const athlete = await repository.createAthlete('verein-1', {
      firstName: ' Anna ',
      lastName: ' Muster ',
      birthYear: 2012,
    });

    expect(athlete).toEqual({
      id: 'athlete-server-1',
      organizationId: 'verein-1',
      firstName: 'Anna',
      lastName: 'Muster',
      birthYear: 2012,
      notes: null,
      isActive: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.parameters?.slice(0, 2)).toEqual([
      'athlete-server-1',
      'verein-1',
    ]);
  });

  it('updates athletes only when id, organization and active lifecycle all match', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            id: 'athlete-1',
            organization_id: 'verein-1',
            first_name: 'Anna',
            last_name: 'Beispiel',
            birth_year: null,
            notes: 'neu',
            is_active: true,
          },
        ];
      },
    });

    await expect(
      repository.updateAthlete('verein-1', 'athlete-1', {
        firstName: ' Anna ',
        lastName: ' Beispiel ',
        birthYear: null,
        notes: ' neu ',
      }),
    ).resolves.toEqual({
      id: 'athlete-1',
      organizationId: 'verein-1',
      firstName: 'Anna',
      lastName: 'Beispiel',
      birthYear: null,
      notes: 'neu',
      isActive: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain('WHERE id = $1');
    expect(calls[0]?.query).toContain('organization_id = $2');
    expect(calls[0]?.query).toContain('is_active = true');
    expect(calls[0]?.parameters).toEqual([
      'athlete-1',
      'verein-1',
      'Anna',
      'Beispiel',
      null,
      'neu',
    ]);
  });

  it('updates an athlete only when the previewed scalar state still matches atomically', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            id: 'athlete-1',
            organization_id: 'verein-1',
            first_name: 'Anna',
            last_name: 'Muster',
            birth_year: 2012,
            notes: 'neu',
            is_active: true,
          },
        ];
      },
    });

    await expect(
      repository.updateAthleteIfUnchanged(
        'verein-1',
        'athlete-1',
        {
          firstName: 'Anna',
          lastName: 'Muster',
          birthYear: 2012,
          notes: null,
        },
        {
          firstName: 'Anna',
          lastName: 'Muster',
          birthYear: 2012,
          notes: 'neu',
        },
      ),
    ).resolves.toEqual({
      id: 'athlete-1',
      organizationId: 'verein-1',
      firstName: 'Anna',
      lastName: 'Muster',
      birthYear: 2012,
      notes: 'neu',
      isActive: true,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain('AND first_name = $7');
    expect(calls[0]?.query).toContain('AND last_name = $8');
    expect(calls[0]?.query).toContain(
      'AND birth_year IS NOT DISTINCT FROM $9',
    );
    expect(calls[0]?.query).toContain(
      'AND notes IS NOT DISTINCT FROM $10',
    );
    expect(calls[0]?.parameters).toEqual([
      'athlete-1',
      'verein-1',
      'Anna',
      'Muster',
      2012,
      'neu',
      'Anna',
      'Muster',
      2012,
      null,
    ]);
  });

  it('returns null from compare-and-update when the athlete changed after preview', async () => {
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        return [];
      },
    });

    await expect(
      repository.updateAthleteIfUnchanged(
        'verein-1',
        'athlete-1',
        {
          firstName: 'Anna',
          lastName: 'Muster',
          birthYear: 2012,
          notes: null,
        },
        {
          firstName: 'Anna',
          lastName: 'Muster',
          birthYear: 2012,
          notes: 'neu',
        },
      ),
    ).resolves.toBeNull();
  });

  it('returns null instead of mutating when an update target is absent, inactive or outside the organization', async () => {
    let calls = 0;
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        calls += 1;
        return [];
      },
    });

    await expect(
      repository.updateTrainer('verein-1', 'trainer-1', {
        firstName: 'Max',
        lastName: 'Trainer',
        phone: null,
        email: null,
        notes: null,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.updateTrainingGroup('verein-1', 'group-1', {
        name: 'U14',
        shortName: 'U14',
        description: null,
        sortOrder: 10,
      }),
    ).resolves.toBeNull();
    expect(calls).toBe(2);
  });

  it('creates group memberships only through same-organization active references', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            organization_id: 'verein-1',
            athlete_id: 'athlete-1',
            group_id: 'group-1',
            started_on: '2026-09-01',
            ended_on: null,
          },
        ];
      },
    });

    await repository.createAthleteGroupMembership('verein-1', {
      athleteId: 'athlete-1',
      groupId: 'group-1',
      startedOn: '2026-09-01',
    });

    expect(calls[0]?.query).toContain('g.organization_id = $1');
    expect(calls[0]?.query).toContain('a.organization_id = $1');
    expect(calls[0]?.query).toContain('g.is_active = true');
    expect(calls[0]?.query).toContain('a.is_active = true');
    expect(calls[0]?.parameters).toEqual([
      'verein-1',
      'athlete-1',
      'group-1',
      '2026-09-01',
      null,
    ]);
  });

  it('re-reads an existing trainer-group membership after a duplicate insert loses a concurrent race', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        if (calls.length === 1) return [];
        return [
          {
            organization_id: 'verein-1',
            trainer_id: 'trainer-1',
            group_id: 'group-1',
          },
        ];
      },
    });

    await expect(
      repository.createTrainerGroupMembership('verein-1', {
        trainerId: 'trainer-1',
        groupId: 'group-1',
      }),
    ).resolves.toEqual({
      organizationId: 'verein-1',
      trainerId: 'trainer-1',
      groupId: 'group-1',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.query).toContain('g.organization_id = $1');
    expect(calls[0]?.query).toContain('t.organization_id = $1');
    expect(calls[0]?.query).toContain('g.is_active = true');
    expect(calls[0]?.query).toContain('t.is_active = true');
    expect(calls[0]?.query).toContain(
      'ON CONFLICT (organization_id, trainer_id, group_id) DO NOTHING',
    );
    expect(calls[1]?.query).toContain('FROM appbasis_trainer_group_membership AS membership');
    expect(calls[1]?.query).toContain('trainer.is_active = true');
    expect(calls[1]?.query).toContain('training_group.is_active = true');
    expect(calls[0]?.parameters).toEqual([
      'verein-1',
      'trainer-1',
      'group-1',
    ]);
    expect(calls[1]?.parameters).toEqual(calls[0]?.parameters);
  });


  it('rejects cross-organization rows even if a SQL adapter returns them', async () => {
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        return [
          {
            id: 'group-1',
            organization_id: 'verein-2',
            name: 'U14',
            short_name: null,
            description: null,
            is_active: true,
            sort_order: 10,
          },
        ];
      },
    });

    await expect(repository.readOrganizationSnapshot('verein-1')).rejects.toThrow(
      /invalid shape/,
    );
  });

  it('deactivates personal masterdata only inside the requested organization', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [{ id: 'athlete-1' }];
      },
    });

    await expect(
      repository.deactivateAthlete('verein-1', 'athlete-1'),
    ).resolves.toBe(true);
    expect(calls[0]?.query).toContain('organization_id = $2');
    expect(calls[0]?.query).toContain('is_active = true');
    expect(calls[0]?.query).toContain(
      'GREATEST(CURRENT_DATE, started_on)',
    );
    expect(calls[0]?.parameters).toEqual(['athlete-1', 'verein-1']);
  });

  it('purges only deactivated personal masterdata after the 12-month lifecycle ceiling', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            deleted_athletes: 2,
            deleted_trainers: 1,
            deleted_athlete_group_memberships: 3,
            deleted_trainer_group_memberships: 2,
          },
        ];
      },
    });

    const result = await repository.purgeDeactivatedPersonalData(
      new Date('2027-09-27T10:00:00.000Z'),
    );

    expect(result).toEqual({
      deletedAthletes: 2,
      deletedTrainers: 1,
      deletedAthleteGroupMemberships: 3,
      deletedTrainerGroupMemberships: 2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain('is_active = false');
    expect(calls[0]?.query).toContain("updated_at + interval '12 months'");
    expect(calls[0]?.query).toContain('INSERT INTO appbasis_athletes_deletion');
    expect(calls[0]?.query).toContain("interval '35 days'");
    expect(calls[0]?.query).toContain('DELETE FROM appbasis_athlete_group_membership');
    expect(calls[0]?.query).toContain('DELETE FROM appbasis_trainer_group_membership');
    expect(calls[0]?.parameters).toEqual(['2027-09-27T10:00:00.000Z']);
  });

  it('keeps the server organization authoritative even for decorated internal membership input', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            organization_id: 'verein-1',
            athlete_id: 'athlete-1',
            group_id: 'group-1',
            started_on: '2026-09-01',
            ended_on: null,
          },
        ];
      },
    });

    await repository.createAthleteGroupMembership(
      'verein-1',
      {
        organizationId: 'verein-2',
        athleteId: 'athlete-1',
        groupId: 'group-1',
        startedOn: '2026-09-01',
      } as unknown as Parameters<
        PostgresAthleteMasterdataRepository['createAthleteGroupMembership']
      >[1],
    );

    expect(calls[0]?.parameters?.[0]).toBe('verein-1');
  });


  it('reads only current exact 35-day deletion markers', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const completedAt = new Date('2026-09-01T10:00:00.000Z');
    const purgeAfter = new Date('2026-10-06T10:00:00.000Z');
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            entity_type: 'athlete',
            entity_id: 'athlete-1',
            organization_id: 'verein-1',
            completed_at: completedAt,
            purge_after: purgeAfter,
            completed_not_future: true,
            retention_window_valid: true,
          },
        ];
      },
    });

    await expect(
      repository.listCurrentDeletionMarkers(
        new Date('2026-09-27T10:00:00.000Z'),
      ),
    ).resolves.toEqual([
      {
        entityType: 'athlete',
        entityId: 'athlete-1',
        organizationId: 'verein-1',
        completedAt,
        purgeAfter,
      },
    ]);
    expect(calls[0]?.query).toContain('WHERE purge_after >= $1::timestamptz');
    expect(calls[0]?.query).toContain(
      "purge_after = completed_at + interval '35 days'",
    );
  });

  it('fails closed when a deletion marker does not prove the exact retention window', async () => {
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        return [
          {
            entity_type: 'trainer',
            entity_id: 'trainer-1',
            organization_id: 'verein-1',
            completed_at: new Date('2026-09-01T10:00:00.000Z'),
            purge_after: new Date('2026-10-05T10:00:00.000Z'),
            completed_not_future: true,
            retention_window_valid: false,
          },
        ];
      },
    });

    await expect(
      repository.listCurrentDeletionMarkers(
        new Date('2026-09-27T10:00:00.000Z'),
      ),
    ).rejects.toThrow(/invalid shape/);
  });

  it('replays a same-organization deletion marker atomically', async () => {
    const calls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe(query, parameters) {
        calls.push({ query, parameters });
        return [
          {
            existing_marker_count: 0,
            live_entity_count: 1,
            existing_marker_org_matches: true,
            live_entity_org_matches: true,
            existing_marker_time_matches: true,
            inserted_marker_count: 1,
            replay_marker_count: 1,
            deleted_entity_count: 1,
            deleted_group_membership_count: 2,
          },
        ];
      },
    });

    await expect(
      repository.reconcileDeletionMarker({
        entityType: 'athlete',
        entityId: 'athlete-1',
        organizationId: 'verein-1',
        completedAt: new Date('2026-09-01T10:00:00.000Z'),
        purgeAfter: new Date('2026-10-06T10:00:00.000Z'),
      }),
    ).resolves.toEqual({
      markerInserted: true,
      deletedEntity: true,
      deletedGroupMemberships: 2,
    });
    expect(calls[0]?.query).toContain('live_entity_org_matches');
    expect(calls[0]?.query).toContain('DELETE FROM appbasis_athlete');
    expect(calls[0]?.query).toContain('DELETE FROM appbasis_trainer');
    expect(calls[0]?.parameters?.slice(0, 3)).toEqual([
      'athlete',
      'athlete-1',
      'verein-1',
    ]);
  });

  it('fails closed without mutating through a cross-organization restore marker', async () => {
    const repository = new PostgresAthleteMasterdataRepository({
      async unsafe() {
        return [
          {
            existing_marker_count: 0,
            live_entity_count: 1,
            existing_marker_org_matches: true,
            live_entity_org_matches: false,
            existing_marker_time_matches: true,
            inserted_marker_count: 0,
            replay_marker_count: 0,
            deleted_entity_count: 0,
            deleted_group_membership_count: 0,
          },
        ];
      },
    });

    await expect(
      repository.reconcileDeletionMarker({
        entityType: 'trainer',
        entityId: 'trainer-1',
        organizationId: 'verein-1',
        completedAt: new Date('2026-09-01T10:00:00.000Z'),
        purgeAfter: new Date('2026-10-06T10:00:00.000Z'),
      }),
    ).rejects.toThrow(/invalid shape/);
  });

});
