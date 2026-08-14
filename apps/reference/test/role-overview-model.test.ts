import { describe, expect, it } from 'vitest';

import { capabilityId, roleId, type RoleBundle } from '@appbasis/permissions';

import {
  filterRoleOverviewItems,
  roleLabel,
  toRoleOverviewItems,
} from '../src/roles/role-overview-model';

describe('Rollenübersicht', () => {
  const bundles: readonly RoleBundle[] = [
    {
      roleId: roleId('demo:team-admin'),
      capabilities: [capabilityId('users:manage'), capabilityId('tasks:manage')],
    },
    {
      roleId: roleId('demo:member'),
      capabilities: [capabilityId('app:use')],
    },
  ];

  it('leitet nur eine UI-Bezeichnung aus der vorhandenen technischen Role-ID ab', () => {
    expect(roleLabel('demo:team-admin')).toBe('Team Admin');
  });

  it('übernimmt Role-IDs und Capabilities unverändert aus dem Permission-Vertrag', () => {
    expect(toRoleOverviewItems(bundles)).toEqual([
      {
        id: 'demo:member',
        label: 'Member',
        capabilities: ['app:use'],
      },
      {
        id: 'demo:team-admin',
        label: 'Team Admin',
        capabilities: ['users:manage', 'tasks:manage'],
      },
    ]);
  });

  it('sucht sowohl nach Rolle als auch Capability ohne neue Permission-Logik', () => {
    const items = toRoleOverviewItems(bundles);
    expect(filterRoleOverviewItems(items, 'users:manage')).toHaveLength(1);
    expect(filterRoleOverviewItems(items, 'member')).toEqual([items[0]]);
    expect(filterRoleOverviewItems(items, 'nicht-vorhanden')).toEqual([]);
  });
});
