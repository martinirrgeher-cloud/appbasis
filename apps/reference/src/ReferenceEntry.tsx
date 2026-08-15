import { useEffect, useState } from 'react';

import { App } from './App';
import { RoleEditor } from './roles/RoleEditor';
import { RoleOverview } from './roles/RoleOverview';
import { roleIdFromEditorHash } from './roles/role-route';

type ReferenceView =
  | { readonly kind: 'app' }
  | { readonly kind: 'roles' }
  | { readonly kind: 'role-editor'; readonly roleId?: string };

function currentReferenceView(): ReferenceView {
  const hash = window.location.hash;
  if (hash === '#roles') return { kind: 'roles' };
  if (hash === '#roles/new') return { kind: 'role-editor' };
  if (hash.startsWith('#roles/view/')) {
    const roleId = roleIdFromEditorHash(hash);
    return roleId === null ? { kind: 'roles' } : { kind: 'role-editor', roleId };
  }
  if (hash.startsWith('#roles/')) {
    return { kind: 'role-editor', roleId: hash.slice('#roles/'.length) };
  }
  return { kind: 'app' };
}

export function ReferenceEntry() {
  const [view, setView] = useState<ReferenceView>(() => currentReferenceView());

  useEffect(() => {
    const handleHashChange = () => setView(currentReferenceView());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (view.kind === 'roles') return <RoleOverview />;
  if (view.kind === 'role-editor') {
    return view.roleId === undefined ? (
      <RoleEditor key="new" />
    ) : (
      <RoleEditor key={view.roleId} roleId={view.roleId} />
    );
  }
  return <App />;
}
