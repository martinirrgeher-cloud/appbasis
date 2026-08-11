import { useEffect, useState } from 'react';

import { isHealthResponse, type HealthResponse } from '../shared/health';

type ApiState =
  | { status: 'loading' }
  | { status: 'ready'; health: HealthResponse }
  | { status: 'error'; message: string };

const statusLabels = {
  loading: 'Verbindung wird geprüft …',
  ready: 'API erreichbar',
  error: 'API nicht erreichbar',
} as const;

export function App() {
  const [apiState, setApiState] = useState<ApiState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const health: unknown = await response.json();

        if (!isHealthResponse(health)) {
          throw new Error('Unerwartete API-Antwort');
        }

        setApiState({ status: 'ready', health });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setApiState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
      }
    }

    void loadHealth();

    return () => controller.abort();
  }, []);

  return (
    <main className="page-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Technische Referenz-App</p>
        <h1 id="page-title">AppBasis</h1>
        <p className="summary">
          Dieser erste Vertical Slice verbindet eine mobile-first React-Oberfläche mit einer Hono-API im Cloudflare Worker.
        </p>

        <div className={`status-card status-card--${apiState.status}`} aria-live="polite">
          <span className="status-indicator" aria-hidden="true" />
          <div>
            <h2>{statusLabels[apiState.status]}</h2>
            {apiState.status === 'loading' && <p>Der Health-Endpunkt wird aufgerufen.</p>}
            {apiState.status === 'ready' && (
              <p>
                {apiState.health.service} · API-Version {apiState.health.apiVersion}
              </p>
            )}
            {apiState.status === 'error' && <p>{apiState.message}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
