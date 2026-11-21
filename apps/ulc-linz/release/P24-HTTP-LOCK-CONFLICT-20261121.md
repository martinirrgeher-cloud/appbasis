# ULC Linz – P24 HTTP-Behandlung für konkurrierende Löschung und Speicherung

**21.11.2026 · Code- und Unit-Testpaket. Keine Aktivierung der SQL-Kandidaten, kein Runtime-Refresh.**

## Warum dieses Paket nötig ist

Die unter PR #697 geprüften **inaktiven** PostgreSQL-Schutzfunktionen
verweigern einen gleichzeitigen Schreibzugriff mit `SQLSTATE 55P03`
(`pg_try_advisory_xact_lock`, `FOR SHARE NOWAIT`, `FOR KEY SHARE NOWAIT`).
Bisher konnten die betroffenen HTTP-Schreibwege diesen Datenbankfehler als
nicht behandelten Serverfehler weiterwerfen.

## Implementiertes Verhalten

Ein gemeinsamer, rein synchroner HTTP-Helfer
`apps/ulc-linz/worker/write-lock-conflict-http.ts` erkennt nur den
strukturierten SQLSTATE-Code `55P03` (gegebenenfalls über bis zu drei
`cause`-Hüllen), nicht Text aus dem SQL-Fehler.

- HTTP-Status **409 Conflict**, JSON-Fehlercode
  `ULC_WRITE_TEMPORARILY_BUSY`, `Cache-Control: private, no-store`.
- Eine allgemeine Meldung erklärt, dass die **Änderung nicht abgeschlossen werden konnte**.
  Anwender sollen ihre lokale Eingabe behalten, den Serverstand prüfen und
  den Schreibvorgang gegebenenfalls manuell erneut durchführen.
- Keine Query-Texte, SQL-Details, Tabellen, Personenkennungen,
  Objektschlüssel, Secrets oder SQLSTATE in der Antwort.
- **Kein automatischer Retry**, kein Timer, keine Duplikat-Gefahr durch
  unkontrolliertes Wiederholen von POST- oder PUT-Anfragen.
- Abgedeckte bisherige Schreibfamilien: Kindertraining/U12/U14,
  Trainer-/Athleten-Selbstanmeldung, persönliche Katalogfavoriten und
  Katalogbearbeitung, Trainingsblockbearbeitung und Trainingsdokumentation.
  Deren bestehende fachlichen 400/403/404/409-Antworten bleiben unberührt.
- Fremde SQLSTATEs (z. B. Constraints, Invalid-Input, Autorisierung)
  werden weiterhin von den bestehenden Fehlerpfaden verarbeitet und nicht
  fälschlich als transienter Löschkonflikt etikettiert.

## Tests und Grenzen

`apps/ulc-linz/test/write-lock-conflict-http.test.ts` prüft:
direkte und eingepackte PostgreSQL-Fehler, zyklische Cause-Referenzen,
Nicht-55P03-Fehler, keine Ausgabe vertraulicher Fehlerdetails,
HTTP 409 ohne Retry-Automatik und Anbindung an die fünf HTTP-Familien.

PR #697 hat konkurrierende Datenbanktransaktionen mit echten zwei
PostgreSQL-Verbindungen bereits erfolgreich durchlaufen. Dieser PR
ändert **ausschließlich die HTTP-Abbildung**, keine DB-Migration.

## Noch ausdrücklich nicht freigegeben

Die SQL-Kandidaten aus PR #697 sind weiterhin keine registrierte
Vorwärtsmigration und nicht in `neondb` aktiviert. Vor realem Einsatz
müssen die exakten Rollen-/Legacy-Schreibwege, historische
Trainingseinträge, Backup-/Lösch-Reconciliation sowie P01-D2-/AVV
und der fachliche Produktions-Erstbestand abgenommen werden. Der
Produktiv-Worker wurde hier nicht aktualisiert.

Eine spätere gesonderte Produktivabnahme soll am Handy bestätigen,
dass die Oberfläche die 409-Meldung verständlich anzeigt und lokale
ungespeicherte Eingaben nicht verwirft. Das ist kein durch diese
HTTP-Unit-Tests bewiesener UI-PASS.
