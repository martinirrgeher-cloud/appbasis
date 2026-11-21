# ULC Linz – P24 Schreibschutz unter gleichzeitigem Löschen

**Status 21.11.2026:** inaktive Security-Kandidaten, keine produktive Migration,
kein Rollout, kein Löschlauf. Fortsetzung des Drafts #692.

## Konkret geprüfte Schwachstelle

Die bisherige Kandidatenfunktion für persönliche Favoriten und der
ULC-Trainingsdaten-Subject-Fence verwenden eine **blockierende**
`pg_advisory_xact_lock`-Anforderung innerhalb eines
`BEFORE UPDATE`-Triggers. PostgreSQL sperrt bei `UPDATE` aber bereits
die bestehende Datenzeile, bevor der Trigger aufgerufen wird. Der
kanonische Löschpfad nimmt umgekehrt erst den entsprechenden Advisory-Lock
und löscht dann die Zeile. Ein Deadlock ist dadurch in bestimmten
Verschachtelungen möglich. Das ist eine **technische Risikoanalyse**,
kein in Produktion beobachteter Deadlock.

Auch `FOR SHARE` auf den kanonischen Athletenstamm kann innerhalb des
Triggers auf die `FOR UPDATE`-Sperre eines parallelen Löschers warten.
Deshalb ist die vorherige Reihenfolge aus #692 alleine kein vollständiger
Beweis für deadlockfreies Verhalten.

## Korrigiertes Verhalten

1. Beide Kandidaten verwenden exakt die vorhandenen Owner-/Subject-Lockkeys,
   jetzt **`pg_try_advisory_xact_lock`**. Ein paralleler Löschzugriff
   führt zu einem unmittelbaren `55P03`-Konflikt mit expliziter Retry-Meldung,
   nicht zu einem unbeschränkt wartenden Trigger.
2. Der Trainings-Trigger prüft den noch aktiven kanonischen Athleten mit
   **`FOR SHARE NOWAIT`**, die passende Sitzung mit `FOR KEY SHARE NOWAIT`.
   Ein Konflikt wird ebenfalls `55P03`. Ein nach der Löschung fehlender
   oder inaktiver Athlet wird weiterhin abgelehnt.
3. Vorhandene Katalog-/Block-Löschmarker und beide Trainings-Löschmarker
   bleiben unverändert. Bereits gelöschte Personen können weder über
   INSERT noch UPDATE neue persönliche Datensätze erhalten.
4. Die bisherige API, der Trainerrollen-Guard, Datenschema,
   Aufbewahrungsfristen, Owner-Methoden und veröffentlichte Migration `0017`
   bleiben unverändert. Ein unmittelbar konkurrierender Schreibversuch kann
   nun **vorübergehend** fehlschlagen: die Anwendung muss diesen Fehler als
   retrybaren Konflikt behandeln, bevor jemals produktiv aktiviert wird.

## PostgreSQL-Nachweis – kein Mock

Die Tests installieren die kanonischen **44 Migrationen und 69 Tabellen**
in jeweils eigens erzeugte, zufällig benannte Wegwerf-Datenbanken auf
`localhost:5432`. Kein Neon-/R2-/Cloudflare-Zugriff:

- Normale Inserts/Updates, vorhandene Löschmarker, fehlender/inaktiver
  Athlet, Mandanten- und Session-Isolation sowie Funktions-ACL.
- Zwei unabhängige PostgreSQL-Verbindungen simulieren tatsächlich:
  Katalog-/Block-Delete-Owner hält den Advisory-Lock, Direkt-`UPDATE`
  auf existierende Favoritenzeile → sofort `55P03`.
- ULC-Subject-Löschpfad hält Advisory-Lock, Direkt-`UPDATE`
  auf existierende Anwesenheit → sofort `55P03`.
- ATHLETES-Löscher hält kanonische Athletenzeile `FOR UPDATE`,
  Direkt-`UPDATE` auf Anwesenheit → `FOR SHARE NOWAIT` scheitert,
  ohne Lock-Zyklus. Nach Löschabschluss bleibt Wiederanlage verboten.
- Umgekehrt: Writer hält zuerst den Tuple-/Advisory-Lock; Löschpfad
  wartet kontrolliert auf Writer-Commit, setzt Marker und löscht danach.
  Kein Tombstone-Resurrection.

## Produktivaktivierung weiterhin gesperrt

Diese Dateien sind **Vorschläge unter `apps/ulc-linz/proposals/`** und
werden **nicht** durch `appbasis.database.json` ausgeführt.
Vor einer gesonderten, vorwärtsgerichteten Migration weiterhin offen:
aktueller Rollen-/GRANT-/HTTP-Caller-Nachweis (einschließlich
Drittpersonen-Freitext), Scope-/Markervollständigkeit aller Datenowner,
tatsächliche Restore-Reconciliation, fachliche Zulässigkeit alter
Trainingskorrekturen, abschließender 35-Tage-/P01-D2-/AVV-Beschluss und
Produktiv-Smoketests. Es erfolgt kein Merge des alten Drafts #692;
dieser neue PR ist dessen sichere, ausschließlich offline geprüfte
Ablösung, nicht eine freigegebene Datenbankänderung.
