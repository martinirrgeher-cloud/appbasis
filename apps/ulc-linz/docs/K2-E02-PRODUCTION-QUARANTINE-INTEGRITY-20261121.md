# K2-E02 – Produktions-Restore: strukturelle Quarantäne-Abnahme

**21.11.2026 · technischer Testkandidat, keine Freigabe für echten Restore / Echtdatenstart.**

## Bisherige Grenze

Der existierende Workflow \`ulc-linz-k2-isolated-restore.yml\` kann mit
\`apply=true\` ein authentifiziertes ULC-Backup auf ein vorher nachweislich
**leeres und separates Neon-Quarantäne-Endpoint** zurückspielen. Bisher
prüfte er anschließend nur acht Ankertabellen – je einen Tabellenbeleg pro
Datenowner. Das beweist weder Vollständigkeit des laufenden 69-Tabellen-Schemas
noch intakte Trainings-/Dokumentations-Schreibschutztrigger.

## Neuer, tatsächlich ausführbarer Guard

Nach einem erfolgreichen \`pg_restore\`, aber vor Cleanup, läuft bei
\`apply=true\` zusätzlich \`restore-integrity-sql\` als ausschließlich
\`pg_catalog\`-basierte SQL-Abfrage im isolierten Ziel. Ein einziges
\`t\`/ \`f\`-Ergebnis wird ausgewertet; Personenwerte werden weder abgefragt
noch ins CI-Protokoll ausgegeben.

Für die konkrete \`neondb\`-Produktionsquelle muss gelten:

- exakt **69** öffentliche Tabellen (Live-Schema vom 21.11.2026),
- die **acht** kanonischen App-Owner-Ankertabellen,
- **drei** aktivierte, auf \`ulc_linz_training_subject_write_fence()\`
  gebundene \`BEFORE INSERT OR UPDATE\`-Trigger für Attendance,
  Registration und Registration-Change,
- **zwei** aktivierte Dokumentations-Trigger mit den vorgesehenen
  Triggerfunktionen für Root- und Revisionstabelle,
- **null** nicht validierte Constraints in \`public\`.

Sonst: **FAIL und keine Abnahme**, keine Promotion. Wenn später eine
freigegebene Schema-Migration neue Tabellen hinzufügt, muss der exakte
69-Tabellen-Baseline-Guard samt Regression **bewusst** aktualisiert werden.
Für historische Preview-Datenbanknamen bleibt die alte minimale
Acht-Owner-Prüfung bestehen. Ein historisches Preview-PASS wird explizit
**nicht** als Produktionsstruktur-PASS ausgegeben.

## Testnachweis

\`tooling/ulc-linz-k2-restore-integrity.postgres.test.mjs\`
installiert die acht Owner mit dem kanonischen
\`apps/ulc-linz/appbasis.database.json\` vollständig neu in einer
zufälligen **lokalen Wegwerf-Datenbank** (PostgreSQL 18).
Der Test verlangt zunächst PASS, deaktiviert anschließend gezielt einen
Trainingstrigger beziehungsweise einen Dokumentationstrigger, legt
eine \`NOT VALID\`-Constraint an und entfernt eine Owner-Ankertabelle
temporär aus dem erwarteten Namensraum. Jeder dieser Fälle muss FAIL
ergeben; nach Rücknahme wieder PASS.

Die normalen \`node --test tooling/ulc-linz-k2-backup-plan.test.mjs\`
und \`tooling/ulc-linz-k2-restore-boundary.test.mjs\` kontrollieren
die read-only SQL-Form, \`apply=true\`-Schranke und Wiederherstellungsreihenfolge.

## Explizit noch nicht bewiesen

- Live-Quarantäne-Restore des neuesten \`neondb\`-Backups und Vergleich der
  **tatsächlichen** Tabelleninhalte/Fingerprints mit dem Backupzeitpunkt.
- Restore von R2-Privatmedien und Exporten; personenbezogene Freitexte
  und verwaiste historische Verweise; ACL/RLS und echte Benutzer-/Rollentests.
- Quarantäne hat keinerlei Worker-/Hyperdrive-/öffentlichen Ingress.
- P1-Retention-/DSGVO-/AVV-Entscheide, 35-Tage-Quellautorität und
  Re-Deletion nach älteren Backupständen.
- Produktions-Contract, Migration, Medienfreigabe oder Produktiv-Deployment.

**Unverändert:** kein automatischer Workflow-Dispatch, kein Provider-
oder Neon-Write durch diesen PR, kein öffentliches Ingress. Der manuelle
Workflow bleibt auf \`main\` und eine ausdrücklich gesetzte
\`apply=true\`-Eingabe begrenzt. Ein positiver reiner
Strukturtest darf nicht als vollständige Datenwiederherstellung oder
Datenschutzfreigabe ausgegeben werden.
