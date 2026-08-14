import type { RoleBundle } from '@appbasis/permissions';

export interface RoleOverviewItem {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly string[];
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
    .map((bundle) => ({
      id: String(bundle.roleId),
      label: roleLabel(String(bundle.roleId)),
      capabilities: bundle.capabilities.map(String),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'de'));
}

export function filterRoleOverviewItems(
  roles: readonly RoleOverviewItem[],
  query: string,
): readonly RoleOverviewItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('de');
  if (normalizedQuery.length === 0) return roles;

  return roles.filter((role) => {
    const haystack = [role.id, role.label, ...role.capabilities]
      .join(' ')
      .toLocaleLowerCase('de');
    return haystack.includes(normalizedQuery);
  });
}
