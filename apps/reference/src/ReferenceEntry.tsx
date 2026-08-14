import { useEffect, useState } from 'react';

import { App } from './App';
import { RoleOverview } from './roles/RoleOverview';

type ReferenceView = 'app' | 'roles';

function currentReferenceView(): ReferenceView {
  return window.location.hash === '#roles' ? 'roles' : 'app';
}

export function ReferenceEntry() {
  const [view, setView] = useState<ReferenceView>(() => currentReferenceView());

  useEffect(() => {
    const handleHashChange = () => setView(currentReferenceView());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return view === 'roles' ? <RoleOverview /> : <App />;
}
