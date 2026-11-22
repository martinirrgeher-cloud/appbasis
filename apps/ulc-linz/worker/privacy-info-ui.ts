/**
 * Statische, ohne Anmeldung erreichbare Datenschutzinformation.
 * Ausschließlich Text, keine Skripte, personenbezogenen Daten oder Telemetrie.
 * Von der ULC-Betreiberperson am 22.11.2026 als Bereitstellungsziel bestimmt.
 * Tatsächliches Deployment/Erstinformation erfolgt erst mit separat
 * freigegebenem Release.
 */
export const ULC_LINZ_PRIVACY_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="color-scheme" content="light" />
    <meta name="theme-color" content="#147a46" />
    <title>Datenschutz – ULC Linz Vereins-App</title>
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="stylesheet" href="/app.css" />
  </head>
  <body>
    <div class="app-shell">
      <header class="app-header">
        <a class="app-brand" href="/" aria-label="Zur ULC Linz App">
          <img class="app-brand__mark" src="/icon-192.png" alt="" aria-hidden="true" width="40" height="40" />
          <span class="app-brand__copy"><strong>ULC Linz</strong><small>Vereins-App</small></span>
        </a>
      </header>
      <main class="content" id="datenschutz">
        <article class="card">
          <p class="eyebrow">Vereins-App</p>
          <h1>Datenschutzinformation</h1>
          <p>Stand: 22. November 2026. Diese Information gilt für die interne Trainings-App des ULC Linz Oberbank und ergänzt die Datenschutzinformation der Vereinswebsite.</p>

          <h2>1. Verantwortlicher und Kontakt</h2>
          <p><strong>ULC Linz Oberbank</strong>, Wieningerstraße 11, 4020 Linz, Österreich, ZVR 284674441.</p>
          <p>Bei Datenschutzfragen zur App: <a href="mailto:martin.irrgeher@gmail.com">martin.irrgeher@gmail.com</a>.</p>

          <h2>2. Nutzerkreis und Zwecke</h2>
          <p>Die Trainings-App ist für Vereinsmitglieder vorgesehen. Schnupperteilnehmer und Nichtmitglieder werden nicht als Athleten in der App geführt. Eltern oder gesetzliche Vertreter können selbst Nichtmitglieder sein.</p>
          <p>Wir verwenden die App zur Verwaltung von Benutzern und Berechtigungen, Vereins- und Trainingsgruppen, Athleten und Trainern, zur Trainingsanmeldung und Anwesenheit, zur Planung, Dokumentation, Verwaltung von Übungen und Trainingsblöcken sowie für begrenzte interne Auswertungen und die Sicherheit des Betriebs.</p>

          <h2>3. Welche Daten werden verarbeitet?</h2>
          <ul>
            <li>Benutzer- und Zugangsdaten, Rollen, Berechtigungen und Gruppenzugehörigkeiten.</li>
            <li>Namen sowie erforderliche Vereins-, Athleten-, Trainer- und gegebenenfalls Kontaktangaben von Erziehungsberechtigten.</li>
            <li>Trainingszeiten, Anmeldungen, Teilnahmen, Traineranwesenheit, Trainingsplanung, Dokumentation und dazugehörige Notizen oder Änderungshistorien.</li>
            <li>Persönliche Favoriten und zweckgebundene Nutzungsereignisse, soweit entsprechende Funktionen verwendet werden.</li>
            <li>Technische Sitzungs-, Zugriffs-, Sicherheits- und Löschprotokolle sowie Datenbank-Sicherungen.</li>
          </ul>
          <p>Private Bilder oder Videos von Athleten sind derzeit nicht freigeschaltet. Diagnosen, Gesundheitsdaten oder Verletzungen gehören nicht in gewöhnliche Notizfelder.</p>

          <h2>4. Rechtsgrundlagen</h2>
          <p>Für Daten, die objektiv zur Organisation und Durchführung der Mitgliedschaft bzw. vereinbarten Trainingsbetreuung erforderlich sind, stützen wir uns auf <strong>Art. 6 Abs. 1 lit. b DSGVO</strong>. Dazu gehören insbesondere notwendige Stammdaten, die Trainingsgruppenzuordnung sowie Anmeldungs- und Teilnahmedaten.</p>
          <p>Für erforderliche technische Sicherheitsmaßnahmen, eine verhältnismäßige Berechtigungs-/Zugriffskontrolle und darüber hinaus erforderliche interne organisatorische Auswertungen kommt <strong>Art. 6 Abs. 1 lit. f DSGVO</strong> (berechtigtes Interesse an sicherem und geordnetem Vereinsbetrieb) in Betracht. Die Interessen der Betroffenen, besonders von Kindern, sind dabei zu berücksichtigen. Für zusätzliche freiwillige Funktionen oder Medien wäre eine eigene Rechtsgrundlage nötig. Eine allgemeine Einwilligung für notwendige Mitgliedschafts- und Trainingsdaten wird nicht vorausgesetzt.</p>
          <p>Gesundheitsdaten und andere besondere Datenkategorien sind nicht Teil der regulär vorgesehenen Erfassung. Sollte ein entsprechender Bedarf entstehen, ist vorab eine eigenständige Rechtsgrundlage und Schutzprüfung notwendig.</p>

          <h2>5. Wer erhält die Daten?</h2>
          <p>Vereinsintern erhalten nur berechtigte Benutzer im Rahmen ihrer Rolle und Gruppenzugehörigkeit Zugriff. Technische Dienstleister sind <strong>Cloudflare</strong> (Betrieb des App-Dienstes, Verbindung und verschlüsselte Sicherungen im EU-R2-Bereich) sowie <strong>Neon/Databricks</strong> (PostgreSQL-Datenbank in Frankfurt). Von der Datenbankregion allein kann nicht auf ausschließlich europäische Support- oder Unterauftragnehmerzugriffe geschlossen werden. Vertrags- und Drittlandtransferbedingungen werden im separaten Anbieter- und Betriebsnachweis geführt.</p>
          <p>Die App veröffentlicht keine Teilnehmer- oder Anwesenheitslisten öffentlich.</p>

          <h2>6. Wie lange speichern wir die Daten?</h2>
          <p>Wir richten die Verarbeitung nach der tatsächlichen Erforderlichkeit aus. Für den Vereinsbetrieb sind folgende zweckbezogene Obergrenzen vorgesehen:</p>
          <ul>
            <li>Erforderliche Vereins-, Benutzer- und Athletenstammdaten: für die benötigte Dauer; nach Austritt/Deaktivierung grundsätzlich höchstens 12 Monate, soweit sachlich erforderlich.</li>
            <li>Personenbezogene Trainings-, Anmeldungs- und Anwesenheitsdaten: bei begründetem Zwei-Saison-Vergleich bis zu 24 Monate ab Training.</li>
            <li>Personenbezogene Freitextnotizen: spätestens nach 90 Tagen auf weitere Notwendigkeit prüfen und nicht mehr benötigte Inhalte entfernen.</li>
            <li>Sicherheits-/Trainerprotokolle und personenbezogene Nutzungsevents: soweit begründet, höchstens 12 Monate.</li>
            <li>Persönliche Favoriten: nur bis zum Zweckende oder einer berechtigten Löschung.</li>
            <li>Verschlüsselte tägliche Datenbanksicherungen im EU-R2-Bereich: aktuelle Löschregel 30 Tage. Gesonderte technische Wiederherstellungskopien werden im Betriebsinventar erfasst.</li>
          </ul>
          <p>Dies sind fachlich beschlossene Speicherziele, nicht die Behauptung eines bereits für alle Datenfelder aktivierten automatischen Löschsystems. Berechtigte Löschanfragen, technische Wiederherstellungskopien und gesetzliche Aufbewahrungspflichten sind im Einzelfall zu berücksichtigen.</p>

          <h2>7. Rechte und Beschwerden</h2>
          <p>Betroffene und ihre gesetzlichen Vertreter können nach den gesetzlichen Voraussetzungen Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch verlangen. Eine etwaige Einwilligung kann mit Wirkung für die Zukunft widerrufen werden. Anfragen bitte an <a href="mailto:martin.irrgeher@gmail.com">martin.irrgeher@gmail.com</a>; dabei möglichst keine Gesundheitsdaten mitsenden.</p>
          <p>Es besteht ein Beschwerderecht bei der <a href="https://dsb.gv.at/">österreichischen Datenschutzbehörde</a>.</p>

          <h2>8. Information für Eltern und Trainer</h2>
          <p>Die App unterstützt ausschließlich die vereinsinterne Betreuung und Organisation. Bei Minderjährigen werden die gesetzlichen Vertreter angemessen informiert. Deren Kontaktdaten können auch dann verarbeitet werden, wenn die Eltern selbst keine Vereinsmitglieder sind. Soweit eine Verarbeitung nicht schon durch die notwendige Vereinsorganisation gedeckt ist, wird sie gesondert geprüft. Die App trifft keine ausschließlich automatisierten Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung.</p>
          <p>Die endgültige Information wird über diese dauerhaft erreichbare Seite und bei Einführung zusätzlich einmalig per E-Mail an Trainer und Eltern minderjähriger Athleten bereitgestellt.</p>

          <p><a href="/">Zurück zur App</a></p>
        </article>
      </main>
    </div>
  </body>
</html>`;
