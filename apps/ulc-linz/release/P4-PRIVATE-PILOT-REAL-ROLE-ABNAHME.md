# ULC Linz P4 – geschützter privater Technikpilot: echter SQL-Rollencheck

**Stand 20.11.2026.** Kein Deployment, keine Cloudflare-/Neon-Änderung, kein Produktions- oder Datenschutz-GO.

## Hintergrund

- PR #677 ist auf `main` (`47235b1f24792f385b525009eb013ad5a62cb842`). Die CI nach Merge wird unabhängig geprüft.
- Der bestehende private Worker ist vorhanden und muss ausschließlich über den **Refresh**-Pfad aktualisiert werden. Er darf nicht neu angelegt oder öffentlich erreichbar gemacht werden.
- In der echten Neon-Datenbank sind derzeit 69 Tabellen vorhanden; zuletzt 2 Benutzerkonten, aber keine Athleten/Trainer/Trainingsdaten in den überprüften Tabellen. Daraus folgt **keine** Berechtigung, echte Daten neu anzulegen.
- Katalog, Trainingsblöcke und Dokumentation haben zwar separate, mit Fake-SQL-Metadaten getestete Produktions-Rollenprüfungen, bisher aber keinen **gemeinsamen Integrationstest ihrer tatsächlichen SQL-Abfragen unter genau der echten Ziel-Datenbank-/Rollenkombination**.

## Dieses P4-Arbeitspaket

`p4-three-protected-modules-real-role.postgres.e2e.test.ts` ist Teil von `pnpm --filter @appbasis/ulc-linz test:postgres` und läuft nur mit der **lokalen** CI-Verbindung `postgres@localhost:5432/appbasis_identity_e2e`.

1. Verweigert Start bei unbekanntem Host, Username, Port oder vorhandener Ziel-DB/-Rolle; **keine** Verbindung zu einer fremden oder bestehenden Produktionsdatenbank.
2. Erstellt nur im Wegwerf-CI-PostgreSQL eine frische `neondb` und `ulc_linz_application` mit zufälligem Testpasswort. Installiert alle **44 kanonischen Migrationen mit exakt 69 Tabellen**. Legt ausschließlich diejenigen Tabellenrechte an, die die drei geschützten Writer tatsächlich benötigen, ohne Zugriff auf private Löschmarker oder Modul-Guard-Funktionen.
3. Ruft die **wirklichen** Produktions-Readiness-Funktionen für **Übungskatalog**, **Trainingsblöcke** und **Dokumentation** hintereinander mit der gewöhnlichen App-Rolle auf. Keine Stub-/Fake-Antworten für die PostgreSQL-Metadaten.
4. Prüft Negativfälle unter der echten Datenbankverbindung: fehlendes INSERT-Recht auf Übungsfavoriten, fehlender READ-Zugriff auf Plan-Revisions-Items, ausgeschalteter Dokumentationstrigger, unzulässiges SELECT-Recht auf dem vertraulichen Trainings-Löschmarker. Nach Wiederherstellen der zulässigen Konfiguration müssen alle drei Prüfungen wieder PASS ergeben.
5. Prüft, dass keine synthetischen Personen- oder Trainingsdatensätze von dieser Rollenprüfung neu gespeichert wurden; löscht nur die zuvor selbst angelegte CI-Testdatenbank und CI-Testrolle.

## Abnahme / Bedeutung

**PASS dieses Tests bedeutet ausschließlich:** Die opt-in produktionsorientierten Writer-Rollenprüfungen funktionieren zusammen gegen die echte SQL-Engine und den aktuellen Schemaaufbau. Sie sind **weiter deaktiviert**, und alle drei fachlichen Production-Verträge bleiben `blocked`.

Es beweist ausdrücklich **nicht**:
- Cloudflare-Worker ist erreichbar oder produktiv deployed;
- tatsächlicher Neon-Anmelde-/Hyperdrive-/Netzwerkpfad funktioniert;
- Benutzerrollen, echte Trainings oder Medien sind freigegeben;
- vollständige Subject-Deletion, personenbezogene Freitext-Redaktion, rechtliche Aufbewahrung oder Backup-/DPA-Nachweise sind abgeschlossen.

## Nach PASS: großer nächster Schritt

Nur nach Betreiberfreigabe des PR-Merges: einmaligen **read-only** Cloudflare-/Hyperdrive-Preflight auf exaktem neuen `main`-SHA mit dem bestehenden M6-Audit ausführen. Danach, falls die noch blockierten fachlichen Module für einen **rein privaten, isolierten synthetischen Test** sicher ausgeschlossen bzw. ausdrücklich freigegeben werden können, separate Freigabe für den privaten Refresh-Deploy einholen. Keine öffentliche Freischaltung, keine echten Kinder-/Vereinsdaten, kein automatisches `ready`.
