const ROLE_EDITOR_HASH_PREFIX = '#roles/view/';

export function roleEditorHash(roleId: string): string {
  return `${ROLE_EDITOR_HASH_PREFIX}${encodeURIComponent(roleId)}`;
}

export function roleIdFromEditorHash(hash: string): string | null {
  if (!hash.startsWith(ROLE_EDITOR_HASH_PREFIX)) return null;

  const encodedRoleId = hash.slice(ROLE_EDITOR_HASH_PREFIX.length);
  if (encodedRoleId.length === 0) return null;

  try {
    const roleId = decodeURIComponent(encodedRoleId);
    return roleId.length === 0 ? null : roleId;
  } catch {
    return null;
  }
}
