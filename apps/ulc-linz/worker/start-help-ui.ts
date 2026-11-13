/**
 * Static guidance for the existing ULC Linz workflows.
 * HTML is deliberately free of actions, API calls and personal data.
 */
export const ULC_START_HELP_HTML = `
            <section class="card ulc-help ab-surface" id="ulc-quick-help" aria-labelledby="ulc-quick-help-title">
              <header class="ulc-help__header">
                <span class="ulc-help__symbol" aria-hidden="true">?</span>
                <div class="ulc-help__heading">
                  <p class="eyebrow">So funktioniert die App</p>
                  <h2 id="ulc-quick-help-title">Hilfe &amp; Kurzanleitung</h2>
                  <p class="settings-note">Die wichtigsten Abläufe Schritt für Schritt. Wähle einen Bereich, um die Anleitung aufzuklappen.</p>
                </div>
              </header>
              <div class="ulc-help__topics">
                <details class="ulc-help__topic">
                  <summary class="ulc-help__summary ab-disclosure"><span class="ulc-help__topic-icon" aria-hidden="true">✓</span><span class="ulc-help__topic-label"><strong>Anmeldung</strong><small>Für Training zu- oder absagen</small></span></summary>
                  <div class="ulc-help__body">
                    <ol>
                      <li>Öffne unter <strong>Mehr → Anmeldung</strong> deine Trainingsanmeldung.</li>
                      <li>Wähle die berechtigte Trainingsgruppe und navigiere mit den Wochenpfeilen zum gewünschten Termin.</li>
                      <li>Wähle am Trainingstag <strong>Ich komme</strong>, <strong>Vielleicht</strong> oder <strong>Ich komme nicht</strong>, soweit diese Möglichkeiten für deine Gruppe freigeschaltet sind.</li>
                      <li>Prüfe den angezeigten Status und gegebenenfalls die Anmeldefrist. Eine spätere Änderung kann durch den Meldeschluss gesperrt sein.</li>
                    </ol>
                    <p class="ulc-help__tip"><strong>Gut zu wissen:</strong> Falls du einen Trainingstag nicht findest, prüfe die ausgewählte Woche und die für deine Gruppe festgelegten Trainingstage.</p>
                  </div>
                </details>
                <details class="ulc-help__topic">
                  <summary class="ulc-help__summary ab-disclosure"><span class="ulc-help__topic-icon" aria-hidden="true">☑</span><span class="ulc-help__topic-label"><strong>Anwesenheit</strong><small>U12, U14 und Kindertraining erfassen</small></span></summary>
                  <div class="ulc-help__body">
                    <ol>
                      <li>Tippe auf <strong>Anwesenheit</strong> und wähle im aufgeklappten Menü die passende Gruppe.</li>
                      <li>Stelle den Trainingstag über Datum oder Pfeile ein. Über <strong>Heute</strong> kommst du rasch zum aktuellen Tag zurück.</li>
                      <li>Markiere die anwesenden Kinder in der Liste. Die Übersicht zeigt dir die aktuelle Anzahl und den Speicherstatus.</li>
                      <li>Unter <strong>Trainingsinhalte</strong> kannst du bis zu fünf Inhalte erfassen. Über <strong>Inhalte zuordnen</strong> setzt du Häkchen pro Kind oder für alle.</li>
                      <li>Klappe <strong>Trainer</strong> auf, um anwesende Trainer zu markieren; ergänze bei Bedarf eine Trainingsnotiz.</li>
                      <li>Nutze <strong>Statistik</strong> für die Auswertung. Prüfe vor dem Datumswechsel, ob Änderungen gespeichert wurden.</li>
                    </ol>
                    <p class="ulc-help__tip"><strong>Bei Speicherfehlern:</strong> Die Meldung beachten und gegebenenfalls „Erneut versuchen“ verwenden, statt dieselbe Eingabe mehrfach anzustoßen.</p>
                  </div>
                </details>
                <details class="ulc-help__topic">
                  <summary class="ulc-help__summary ab-disclosure"><span class="ulc-help__topic-icon" aria-hidden="true">▦</span><span class="ulc-help__topic-label"><strong>Trainingsplanung</strong><small>Gruppen- und Athletenpläne erstellen</small></span></summary>
                  <div class="ulc-help__body">
                    <ol>
                      <li>Öffne <strong>Mehr → Planung</strong> und wähle oben <strong>Gruppe</strong> oder <strong>Athlet</strong>.</li>
                      <li>Stelle die Woche über die Pfeile oder <strong>Diese Woche</strong> ein. Wähle Gruppe beziehungsweise Athlet und den Trainingstag.</li>
                      <li>Öffne den Tagesplan, um über <strong>+ Übung</strong> oder <strong>+ Block</strong> Inhalte hinzuzufügen. Bei Bedarf eine Notiz zum Training ergänzen.</li>
                      <li>Die Planung speichert Änderungen <strong>automatisch</strong>. Achte im Editor auf „Gespeichert“ beziehungsweise Fehler- oder Konflikthinweise.</li>
                      <li>Mit <strong>Verteilen</strong> kannst du eine entsprechende Planfunktion öffnen; über <strong>Dokumentieren</strong> gelangst du zur tatsächlichen Durchführung.</li>
                    </ol>
                    <p class="ulc-help__tip"><strong>Wichtig:</strong> Bei einem Bearbeitungskonflikt den aktuellen Stand prüfen und fremde Änderungen nicht ungeprüft überschreiben.</p>
                  </div>
                </details>
                <details class="ulc-help__topic">
                  <summary class="ulc-help__summary ab-disclosure"><span class="ulc-help__topic-icon" aria-hidden="true">✎</span><span class="ulc-help__topic-label"><strong>Trainingsdokumentation</strong><small>Durchführung und Abweichungen festhalten</small></span></summary>
                  <div class="ulc-help__body">
                    <ol>
                      <li>Öffne unten <strong>Doku</strong>, wähle <strong>Athlet</strong> und <strong>Trainingstag</strong> und tippe auf <strong>Training laden</strong>.</li>
                      <li>Mit <strong>Dokumentation starten</strong> beginnst du die Erfassung. Falls angeboten, kannst du die Anwesenheit übernehmen.</li>
                      <li>Ergänze die tatsächlich durchgeführten Übungen, Blöcke und Abweichungen sowie eine Notiz zum Training.</li>
                      <li>Tippe auf <strong>Speichern</strong>. Anders als in der Trainingsplanung ist hier ein bewusster Speicherschritt vorgesehen.</li>
                      <li>Wenn alles vollständig ist, wähle <strong>Abschließen</strong>. Bei notwendiger Nachbearbeitung steht – mit entsprechender Berechtigung – <strong>Wieder öffnen</strong> zur Verfügung.</li>
                    </ol>
                    <p class="ulc-help__tip"><strong>Vor dem Verlassen:</strong> Bei offenen Änderungen den Speichern-Dialog beachten, damit keine Eingaben verloren gehen.</p>
                  </div>
                </details>
                <details class="ulc-help__topic">
                  <summary class="ulc-help__summary ab-disclosure"><span class="ulc-help__topic-icon" aria-hidden="true">♙</span><span class="ulc-help__topic-label"><strong>Stammdaten &amp; Benutzer</strong><small>Personen, Gruppen und Rechte verwalten</small></span></summary>
                  <div class="ulc-help__body">
                    <ol>
                      <li>Öffne unter <strong>Mehr → Verwaltung</strong> den Punkt <strong>Stammdaten</strong> oder <strong>Benutzer</strong>, sofern du dafür berechtigt bist.</li>
                      <li>In <strong>Stammdaten</strong> wechselst du zwischen <strong>Athleten</strong>, <strong>Trainer</strong> und <strong>Gruppen</strong>. Antippen öffnet Details und Zuordnungen als Fenster.</li>
                      <li>Neue Athleten lassen sich über <strong>+ Athlet</strong> anlegen; Kontakte und Gruppenzugehörigkeit können gleich ergänzt werden. Inaktive Athleten kannst du gesondert einblenden.</li>
                      <li>In <strong>Benutzer</strong> legst du mit <strong>+</strong> ein Konto an und ordnest es einer vorhandenen Person zu. Verwende bei Bedarf ein Berechtigungsprofil und passe Modulrechte an.</li>
                      <li>Neue Konten bekommen ein temporäres Passwort. Beim ersten Login ist ein Passwortwechsel erforderlich.</li>
                    </ol>
                    <p class="ulc-help__tip"><strong>Hinweis:</strong> Nicht sichtbare oder gesperrte Funktionen können an deiner Rolle oder fehlenden Modulrechten liegen.</p>
                  </div>
                </details>
              </div>
              <p class="ulc-help__footer"><strong>Verbindung unterbrochen?</strong> Speicherstatus prüfen, Verbindung wiederherstellen und die angebotene Wiederholung nutzen. Keine mehrfachen unkontrollierten Speicherversuche.</p>
            </section>
`;

export const ULC_START_HELP_CSS = `
.ulc-help { padding: 0; overflow: hidden; border: 1px solid var(--border); }
.ulc-help__header { display: flex; align-items: flex-start; gap: 12px; padding: 16px; background: var(--ab-brand-soft); border-bottom: 1px solid var(--border); }
.ulc-help__symbol { display: grid; flex: 0 0 36px; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--accent); color: var(--accent-foreground); font-size: 1.3rem; font-weight: 750; }
.ulc-help__heading { min-width: 0; flex: 1; }
.ulc-help__heading .eyebrow { margin: 0 0 4px; }
.ulc-help__heading h2 { margin: 0 0 5px; font-size: 1.22rem; line-height: 1.22; letter-spacing: -.02em; }
.ulc-help__heading .settings-note { margin: 0; line-height: 1.5; }
.ulc-help__topics { padding: 4px 12px; }
.ulc-help__topic { border-bottom: 1px solid var(--border); }
.ulc-help__topic:last-child { border-bottom: 0; }
.ulc-help__summary { display: flex; min-height: 58px; align-items: center; gap: 11px; padding: 10px 8px; cursor: pointer; border-radius: var(--control-radius); list-style: none; }
.ulc-help__summary::-webkit-details-marker { display: none; }
.ulc-help__summary::marker { content: ""; }
.ulc-help__summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.ulc-help__summary:hover { background: var(--muted); }
.ulc-help__topic[open] > .ulc-help__summary { color: var(--accent); background: var(--ab-brand-soft); }
.ulc-help__topic-icon { display: grid; place-items: center; flex: 0 0 32px; height: 32px; border-radius: 9px; background: var(--muted); color: var(--accent); font-size: 1.05rem; font-weight: 700; }
.ulc-help__topic[open] .ulc-help__topic-icon { background: var(--card); }
.ulc-help__topic-label { display: grid; flex: 1; gap: 3px; min-width: 0; }
.ulc-help__topic-label strong { font-size: .94rem; line-height: 1.3; }
.ulc-help__topic-label small { color: var(--secondary); font-size: .75rem; line-height: 1.3; }
.ulc-help__summary::after { content: "⌄"; margin-left: auto; font-size: 1.15rem; line-height: 1; color: var(--secondary); transition: transform .15s ease; }
.ulc-help__topic[open] > .ulc-help__summary::after { transform: rotate(180deg); }
.ulc-help__body { padding: 2px 10px 16px 45px; color: var(--text); font-size: .87rem; line-height: 1.55; overflow-wrap: anywhere; }
.ulc-help__body ol { margin: 5px 0 0; padding-left: 20px; }
.ulc-help__body li { margin: 0 0 9px; padding-left: 2px; }
.ulc-help__body li::marker { color: var(--accent); font-weight: 700; }
.ulc-help__tip { margin: 12px 0 0; padding: 10px 12px; border-radius: 9px; background: var(--muted); color: var(--text); }
.ulc-help__footer { margin: 0; padding: 12px 16px; border-top: 1px solid var(--border); font-size: .79rem; line-height: 1.45; color: var(--secondary); }
@media (max-width: 400px) {
  .ulc-help__header { padding: 12px; gap: 9px; }
  .ulc-help__topics { padding: 4px 8px; }
  .ulc-help__summary { gap: 8px; padding-inline: 6px; }
  .ulc-help__body { padding: 2px 8px 14px 14px; }
  .ulc-help__body ol { padding-left: 19px; }
}
@media (prefers-reduced-motion: reduce) { .ulc-help__summary::after { transition: none; } }
`;
