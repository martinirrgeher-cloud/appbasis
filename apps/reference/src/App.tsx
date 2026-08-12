import { useMemo, useState, type FormEvent } from 'react';

import { InMemoryTaskRepository, type Task } from '../../../modules/tasks/src';

const demoTasks: readonly Task[] = [
  {
    id: 'welcome',
    title: 'Demo erkunden',
    description: 'Öffne eine Aufgabe und probiere den Statuswechsel aus.',
    status: 'open',
  },
  {
    id: 'ready',
    title: 'App-Shell eingerichtet',
    description: 'Die mobile Referenz-App ist bereit.',
    status: 'completed',
  },
];

export function App() {
  const repository = useMemo(() => new InMemoryTaskRepository(demoTasks), []);
  const [tasks, setTasks] = useState<readonly Task[]>(() => repository.list());
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const selectedTask = selectedTaskId ? repository.findById(selectedTaskId) : undefined;
  const openCount = tasks.filter((task) => task.status === 'open').length;

  function refreshTasks() {
    setTasks(repository.list());
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = repository.create({ title, description });
    setTitle('');
    setDescription('');
    setSelectedTaskId(task.id);
    refreshTasks();
  }

  function handleToggle(id: string) {
    repository.toggleStatus(id);
    refreshTasks();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#dashboard" aria-label="AppBasis Startseite">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AppBasis</span>
        </a>
        <span className="demo-badge">Demo v0.1</span>
      </header>

      <div className="shell-body">
        <nav className="navigation" aria-label="Hauptnavigation">
          <a className="nav-link nav-link--active" href="#dashboard">Übersicht</a>
          <a className="nav-link" href="#tasks">Aufgaben</a>
        </nav>

        <main className="content" id="dashboard">
          <section className="hero">
            <p className="eyebrow">Guten Tag</p>
            <h1>Alles Wichtige im Blick.</h1>
            <p className="summary">Eine kleine fachneutrale Demo für die ersten Schritte mit AppBasis.</p>
          </section>

          <section className="metrics" aria-label="Aufgabenübersicht">
            <article className="metric-card"><span>Offen</span><strong>{openCount}</strong></article>
            <article className="metric-card"><span>Erledigt</span><strong>{tasks.length - openCount}</strong></article>
          </section>

          <section className="task-panel" id="tasks" aria-labelledby="tasks-title">
            <div className="section-heading">
              <div><p className="eyebrow">Aufgaben</p><h2 id="tasks-title">Nächste Schritte</h2></div>
              <span>{tasks.length} gesamt</span>
            </div>

            <form className="task-form" onSubmit={handleCreate}>
              <label>Titel<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Neue Aufgabe" required /></label>
              <label>Beschreibung <span>(optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Kurze Notiz" rows={2} /></label>
              <button className="primary-button" type="submit">Aufgabe anlegen</button>
            </form>

            <ul className="task-list">
              {tasks.map((task) => (
                <li className="task-row" key={task.id}>
                  <button className={`status-toggle status-toggle--${task.status}`} type="button" aria-label={`${task.title} als ${task.status === 'open' ? 'erledigt' : 'offen'} markieren`} onClick={() => handleToggle(task.id)}>
                    <span aria-hidden="true">{task.status === 'completed' ? '✓' : ''}</span>
                  </button>
                  <button className="task-link" type="button" onClick={() => setSelectedTaskId(task.id)}>
                    <strong>{task.title}</strong><span>{task.status === 'open' ? 'Offen' : 'Erledigt'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>

      {selectedTask && (
        <div className="detail-backdrop" role="presentation" onMouseDown={() => setSelectedTaskId(undefined)}>
          <aside className="detail-card" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close-button" type="button" onClick={() => setSelectedTaskId(undefined)} aria-label="Detailansicht schließen">×</button>
            <p className="eyebrow">Aufgabendetail</p>
            <h2 id="detail-title">{selectedTask.title}</h2>
            <span className={`status-label status-label--${selectedTask.status}`}>{selectedTask.status === 'open' ? 'Offen' : 'Erledigt'}</span>
            <p>{selectedTask.description || 'Keine Beschreibung vorhanden.'}</p>
            <button className="primary-button" type="button" onClick={() => handleToggle(selectedTask.id)}>Als {selectedTask.status === 'open' ? 'erledigt' : 'offen'} markieren</button>
          </aside>
        </div>
      )}
    </div>
  );
}
