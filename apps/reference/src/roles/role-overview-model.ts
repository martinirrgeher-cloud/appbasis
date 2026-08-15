import type { RoleBundle, RoleDetails } from '@appbasis/permissions';

export interface RoleOverviewItem {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly string[];
  readonly description?: string | null;
  readonly state?: RoleDetails['state'];
  readonly kind?: RoleDetails['kind'];
  readonly assignedPrincipalCount?: number;
}

export function roleLabel(roleId: string): string {
  const technicalName = roleId.split(':').at(-1) ?? roleId;
  return technicalName
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function toRoleOverviewItems(roleBundles: readonly RoleBundle[]): readonly RoleOverviewItem[] {
  return roleBundles
    .map((bundle) => {
      const details = isRoleDetails(bundle) ? bundle : null;
      return {
        id: String(bundle.roleId),
        label: details?.displayName ?? roleLabel(String(bundle.roleId)),
        capabilities: bundle.capabilities.map(String),
        ...(details === null
          ? {}
          : {
              description: details.description,
              state: details.state,
              kind: details.kind,
              assignedPrincipalCount: details.assignedPrincipalCount,
            }),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'de'));
}

export function filterRoleOverviewItems(
  roles: readonly RoleOverviewItem[],
  query: string,
): readonly RoleOverviewItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('de');
  if (normalizedQuery.length === 0) return roles;

  return roles.filter((role) => {
    const haystack = [role.id, role.label, role.description ?? '', ...role.capabilities]
      .join(' ')
      .toLocaleLowerCase('de');
    return haystack.includes(normalizedQuery);
  });
}

function isRoleDetails(bundle: RoleBundle): bundle is RoleDetails {
  return (
    'displayName' in bundle &&
    typeof bundle.displayName === 'string' &&
    'state' in bundle &&
    (bundle.state === 'active' || bundle.state === 'inactive') &&
    'kind' in bundle &&
    (bundle.kind === 'system' || bundle.kind === 'managed') &&
    'assignedPrincipalCount' in bundle &&
    typeof bundle.assignedPrincipalCount === 'number'
  );
}
