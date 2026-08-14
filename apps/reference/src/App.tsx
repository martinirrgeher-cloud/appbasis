import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import {
  ReferenceApiError,
  referenceApi,
  type ApiTask,
  type ReferenceSession,
} from './api';
import { ReferenceBrand } from './shell/ReferenceBrand';

const taskBrandClasses = {
  root: 'brand',
  mark: 'brand-mark',
} as const;

type AppPhase =
  | 'loading'
  | 'login'
  | 'password-change'
  | 'app'
  | 'forbidden'
  | 'unavailable'
  | 'error';

export function App() {
  const [phase, setPhase] = useState<AppPhase>('loading');
  const [session, setSession] = useState<ReferenceSession | null>(null);
  const [tasks, setTasks] = useState<readonly ApiTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [systemMessage, setSystemMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [titleError, setTitleError] = useState('');

  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const restoreGenerationRef = useRef(0);

  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId)
    : undefined;
  const openCount = tasks.filter((task) => task.status === 'open').length;

  useEffect(() => {
    const generation = ++restoreGenerationRef.current;
    void restoreSession(generation);
    return () => {
      if (restoreGenerationRef.current === generation) {
        restoreGenerationRef.current += 1;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedTaskId || phase !== 'app') return;

    const dialog = dialogRef.current;
    const opener = openerRef.current;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelectedTaskId(undefined);
        requestAnimationFrame(() => opener?.focus());
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [phase, selectedTaskId]);

  async function restoreSession(requestGeneration?: number) {
    const generation = requestGeneration ?? ++restoreGenerationRef.current;
    setPhase('loading');
    setSystemMessage('');
    setActionError('');
    try {
      const restored = await referenceApi.getSession();
      if (generation !== restoreGenerationRef.current) return;
      await enterSession(restored);
    } catch (error) {
      if (generation !== restoreGenerationRef.current) return;
      if (error instanceof ReferenceApiError && error.status === 401) {
        resetToLogin();
        return;
      }
      applyGlobalError(error);
    }
  }

  async function enterSession(nextSession: ReferenceSession) {
    setSession(nextSession);
    setSystemMessage('');
    setActionError('');
    setSelectedTaskId(undefined);

    if (nextSession.access === 'password-change-required') {
      setTasks([]);
      setPhase('password-change');
      return;
    }

    setPhase('loading');
    try {
      const nextTasks = await referenceApi.listTasks();
      setTasks(nextTasks);
      setPhase('app');
    } catch (error) {
      applyGlobalError(error);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    restoreGenerationRef.current += 1;
    setBusy(true);
    setSystemMessage('');
    try {
      const signedIn = await referenceApi.signIn(username, loginPassword);
      setLoginPassword('');
      await enterSession(signedIn);
    } catch (error) {
      if (error instanceof ReferenceApiError && error.status === 401) {
        setPhase('login');
        setSystemMessage('Benutzername oder Passwort ist nicht korrekt.');
      } else {
        applyGlobalError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSystemMessage('');

    if (newPassword !== confirmPassword) {
      setSystemMessage('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    if (currentPassword.length === 0 || newPassword.length === 0) {
      setSystemMessage('Bitte alle Passwortfelder ausfüllen.');
      return;
    }

    setBusy(true);
    try {
      const changed = await referenceApi.changeRequiredPassword({
        currentPassword,
        newPassword,
        idempotencyKey: crypto.randomUUID(),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await enterSession(changed);
    } catch (error) {
      if (error instanceof ReferenceApiError && error.status === 400) {
        setSystemMessage('Das Passwort konnte nicht geändert werden. Bitte Eingaben prüfen.');
      } else {
        applyGlobalError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length === 0) {
      setTitleError('Bitte einen Titel eingeben.');
      return;
    }

    setBusy(true);
    setActionError('');
    try {
      const task = await referenceApi.createTask({ title, description });
      setTasks((current) => [...current, task]);
      setTitle('');
      setDescription('');
      setTitleError('');
      setSelectedTaskId(task.id);
      openerRef.current = null;
    } catch (error) {
      handleActionError(error, 'Die Aufgabe konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: string) {
    setBusy(true);
    setActionError('');
    try {
      const updated = await referenceApi.toggleTask(id);
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
    } catch (error) {
      handleActionError(error, 'Der Aufgabenstatus konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  }

  function handleActionError(error: unknown, fallback: string) {
    if (
      error instanceof ReferenceApiError &&
      (error.status === 401 || error.status === 403 || error.status === 503)
    ) {
      applyGlobalError(error);
      return;
    }
    setActionError(errorMessage(error, fallback));
  }

  function applyGlobalError(error: unknown) {
    if (error instanceof ReferenceApiError) {
      if (error.status === 401) {
        resetToLogin('Deine Sitzung ist abgelaufen. Bitte erneut anmelden.');
        return;
      }
      if (error.status === 403) {
        setPhase('forbidden');
        setSystemMessage('Für diesen Bereich fehlt die erforderliche Berechtigung.');
        return;
      }
      if (error.status === 503) {
        setPhase('unavailable');
        setSystemMessage('Das Demo-Backend ist noch nicht vollständig konfiguriert.');
        return;
      }
    }
    setPhase('error');
    setSystemMessage(errorMessage(error, 'Beim Laden der App ist ein Fehler aufgetreten.'));
  }

  function resetToLogin(message = '') {
    setSession(null);
    setTasks([]);
    setSelectedTaskId(undefined);
    setPhase('login');
    setSystemMessage(message);
    setActionError('');
  }

  function closeDetail() {
    const opener = openerRef.current;
    setSelectedTaskId(undefined);
    requestAnimationFrame(() => opener?.focus());
  }

  if (phase === 'loading') {
    return (
      <GateLayout>
        <p className="eyebrow">AppBasis</p>
        <h1>Demo wird geladen.</h1>
        <p className="summary" role="status">Sitzung, Zugriff und Aufgaben werden geprüft …</p>
      </GateLayout>
    );
  }

  if (phase === 'login') {
    return (
      <GateLayout>
        <p className="eyebrow">Anmeldung</p>
        <h1>Willkommen bei AppBasis.</h1>
        <p className="summary">Melde dich mit deinem Benutzernamen an.</p>
        <form className="access-form" onSubmit={(event) => void handleLogin(event)}>
          <label>
            Benutzername
            <input
              className="ab-input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Passwort
            <input
              className="ab-input"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
          </label>
          {systemMessage && <p className="access-message" role="alert">{systemMessage}</p>}
          <button className="ab-button ab-button--primary" type="submit" disabled={busy}>
            {busy ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>
      </GateLayout>
    );
  }

  if (phase === 'password-change' && session) {
    return (
      <GateLayout>
        <p className="eyebrow">Passwortwechsel erforderlich</p>
        <h1>Einmal noch das Passwort ändern.</h1>
        <p className="summary">
          Angemeldet als <strong>{session.identity.displayName}</strong>. Bevor die App verwendet werden kann,
          muss das temporäre Passwort ersetzt werden.
        </p>
        <form className="access-form" onSubmit={(event) => void handlePasswordChange(event)}>
          <label>
            Aktuelles Passwort
            <input
              className="ab-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Neues Passwort
            <input
              className="ab-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Neues Passwort wiederholen
            <input
              className="ab-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {systemMessage && <p className="access-message" role="alert">{systemMessage}</p>}
          <button className="ab-button ab-button--primary" type="submit" disabled={busy}>
            {busy ? 'Passwort wird geändert …' : 'Passwort ändern'}
          </button>
        </form>
      </GateLayout>
    );
  }

  if (phase === 'forbidden') {
    return (
      <GateLayout>
        <p className="eyebrow">Kein Zugriff</p>
        <h1>Berechtigung fehlt.</h1>
        <p className="summary" role="alert">{systemMessage}</p>
        <button className="ab-button ab-button--primary" type="button" onClick={() => void restoreSession()}>
          Zugriff erneut prüfen
        </button>
      </GateLayout>
    );
  }

  if (phase === 'unavailable') {
    return (
      <GateLayout>
        <p className="eyebrow">Demo-Backend</p>
        <h1>Noch nicht konfiguriert.</h1>
        <p className="summary" role="status">{systemMessage}</p>
        <button className="ab-button ab-button--primary" type="button" onClick={() => void restoreSession()}>
          Erneut versuchen
        </button>
      </GateLayout>
    );
  }

  if (phase === 'error' || !session) {
    return (
      <GateLayout>
        <p className="eyebrow">Verbindungsfehler</p>
        <h1>Die App konnte nicht geladen werden.</h1>
        <p className="summary" role="alert">{systemMessage}</p>
        <button className="ab-button ab-button--primary" type="button" onClick={() => void restoreSession()}>
          Erneut versuchen
        </button>
      </GateLayout>
    );
  }

  return (
    <div className="app-shell">
      <ReferenceHeader />

      <div className="shell-body">
        <nav className="navigation" aria-label="Hauptnavigation">
          <a className="nav-link nav-link--active" href="#dashboard">Übersicht</a>
          <a className="nav-link" href="#tasks">Aufgaben</a>
        </nav>

        <main className="content" id="dashboard">
          <section className="hero">
            <p className="eyebrow">Guten Tag, {session.identity.displayName}</p>
            <h1>Alles Wichtige im Blick.</h1>
            <p className="summary">Die Demo verwendet jetzt die serverseitige AppBasis-API.</p>
          </section>

          <section className="metrics" aria-label="Aufgabenübersicht">
            <article className="ab-surface metric-card"><span>Offen</span><strong>{openCount}</strong></article>
            <article className="ab-surface metric-card"><span>Erledigt</span><strong>{tasks.length - openCount}</strong></article>
          </section>

          <section className="ab-surface task-panel" id="tasks" aria-labelledby="tasks-title">
            <div className="section-heading">
              <div><p className="eyebrow">Aufgaben</p><h2 id="tasks-title">Nächste Schritte</h2></div>
              <span>{tasks.length} gesamt</span>
            </div>

            <form className="task-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                Titel
                <input
                  className="ab-input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (event.target.value.trim().length > 0) setTitleError('');
                  }}
                  placeholder="Neue Aufgabe"
                  required
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? 'task-title-error' : undefined}
                  disabled={busy}
                />
                {titleError && <small className="field-error" id="task-title-error" role="alert">{titleError}</small>}
              </label>
              <label>
                Beschreibung <span>(optional)</span>
                <textarea
                  className="ab-textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Kurze Notiz"
                  rows={2}
                  disabled={busy}
                />
              </label>
              <button className="ab-button ab-button--primary" type="submit" disabled={busy}>Aufgabe anlegen</button>
            </form>

            {actionError && <p className="action-error" role="alert">{actionError}</p>}
            {tasks.length === 0 ? (
              <p className="empty-state">Noch keine Aufgaben vorhanden.</p>
            ) : (
              <ul className="task-list">
                {tasks.map((task) => (
                  <li className="task-row" key={task.id}>
                    <button
                      className={`status-toggle status-toggle--${task.status}`}
                      type="button"
                      disabled={busy}
                      aria-label={`${task.title} als ${task.status === 'open' ? 'erledigt' : 'offen'} markieren`}
                      onClick={() => void handleToggle(task.id)}
                    >
                      <span aria-hidden="true">{task.status === 'completed' ? '✓' : ''}</span>
                    </button>
                    <button
                      className="task-link"
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        openerRef.current = event.currentTarget;
                        setSelectedTaskId(task.id);
                      }}
                    >
                      <strong>{task.title}</strong><span>{task.status === 'open' ? 'Offen' : 'Erledigt'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>

      {selectedTask && (
        <div className="detail-backdrop" role="presentation" onMouseDown={closeDetail}>
          <aside
            className="detail-card"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              className="ab-icon-button ab-icon-button--ghost close-button"
              type="button"
              onClick={closeDetail}
              aria-label="Detailansicht schließen"
            >×</button>
            <p className="eyebrow">Aufgabendetail</p>
            <h2 id="detail-title">{selectedTask.title}</h2>
            <span className={`status-label status-label--${selectedTask.status}`}>
              {selectedTask.status === 'open' ? 'Offen' : 'Erledigt'}
            </span>
            <p>{selectedTask.description || 'Keine Beschreibung vorhanden.'}</p>
            <button
              className="ab-button ab-button--primary"
              type="button"
              disabled={busy}
              onClick={() => void handleToggle(selectedTask.id)}
            >
              Als {selectedTask.status === 'open' ? 'erledigt' : 'offen'} markieren
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function ReferenceHeader() {
  return (
    <header className="topbar">
      <ReferenceBrand classes={taskBrandClasses} />
      <span className="ab-badge ab-badge--info">Demo v0.1</span>
    </header>
  );
}

function GateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <ReferenceHeader />
      <main className="gate-content">
        <section className="ab-surface gate-card">{children}</section>
      </main>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ReferenceApiError && error.status === 0) {
    return 'Das Backend ist derzeit nicht erreichbar. Bitte erneut versuchen.';
  }
  return fallback;
}