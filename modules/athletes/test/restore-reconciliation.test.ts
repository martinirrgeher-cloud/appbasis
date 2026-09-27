import { describe, expect, it } from 'vitest';

import {
  reconcileAthleteMasterdataRestoredDatabase,
  type AthleteMasterdataDeletionMarker,
} from '../src';

const marker: AthleteMasterdataDeletionMarker = Object.freeze({
  entityType: 'athlete',
  entityId: 'athlete-1',
  organizationId: 'verein-1',
  completedAt: new Date('2026-09-01T10:00:00.000Z'),
  purgeAfter: new Date('2026-10-06T10:00:00.000Z'),
});

describe('reconcileAthleteMasterdataRestoredDatabase', () => {
  it('replays every authoritative marker exactly once', async () => {
    const replayed: AthleteMasterdataDeletionMarker[] = [];
    const result = await reconcileAthleteMasterdataRestoredDatabase(
      {
        async listCurrentDeletionMarkers() {
          return [
            marker,
            {
              ...marker,
              entityType: 'trainer',
              entityId: 'trainer-1',
            },
          ];
        },
      },
      {
        async reconcileDeletionMarker(value) {
          replayed.push(value);
          return {
            markerInserted: true,
            deletedEntity: true,
            deletedGroupMemberships: value.entityType === 'athlete' ? 2 : 1,
          };
        },
      },
    );

    expect(replayed.map((value) => value.entityId)).toEqual([
      'athlete-1',
      'trainer-1',
    ]);
    expect(result).toEqual({
      requiredDeletionCount: 2,
      insertedMarkerCount: 2,
      deletedEntityCount: 2,
      deletedGroupMembershipCount: 3,
    });
  });

  it('fails closed on duplicate authoritative markers before replaying twice', async () => {
    let calls = 0;
    await expect(
      reconcileAthleteMasterdataRestoredDatabase(
        {
          async listCurrentDeletionMarkers() {
            return [marker, marker];
          },
        },
        {
          async reconcileDeletionMarker() {
            calls += 1;
            return {
              markerInserted: true,
              deletedEntity: true,
              deletedGroupMemberships: 0,
            };
          },
        },
      ),
    ).rejects.toThrow(/duplicate markers/);
    expect(calls).toBe(1);
  });

  it('fails closed on malformed marker retention metadata', async () => {
    await expect(
      reconcileAthleteMasterdataRestoredDatabase(
        {
          async listCurrentDeletionMarkers() {
            return [
              {
                ...marker,
                purgeAfter: new Date('2026-10-05T10:00:00.000Z'),
              },
            ];
          },
        },
        {
          async reconcileDeletionMarker() {
            throw new Error('must not replay');
          },
        },
      ),
    ).rejects.toThrow(/marker is invalid/);
  });
});
