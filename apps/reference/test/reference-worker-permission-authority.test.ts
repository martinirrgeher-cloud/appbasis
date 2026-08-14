import { describe, expect, it } from 'vitest';

import {
  DEMO_CAPABILITIES,
  PostgresPermissionStore,
  can,
  principalId,
  type PermissionPostgresClient,
} from '@appbasis/permissions';
import { createReferencePermissionStore } from '../worker/index';

describe('Reference Worker permission authority', () => {
  it('constructs the normal runtime permission authority from PostgreSQL', async () => {
    const queries: string[] = [];
    const client: PermissionPostgresClient = {
      async unsafe(query) {
        queries.push(query);
        return [{ allowed: true }];
      },
    };

    const permissions = createReferencePermissionStore(client);

    expect(permissions).toBeInstanceOf(PostgresPermissionStore);
    await expect(
      can(permissions, {
        principalId: principalId('reference-persisted-user'),
        capability: DEMO_CAPABILITIES.appUse,
      }),
    ).resolves.toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('appbasis_permission_principal_role');
    expect(queries[0]).toContain("role.state = 'active'");
  });
});
