# T10 – Training Documentation: Lifecycle-Nachweis für den begrenzten ULC-Pilot

**Umfang:** berechtigte aktuelle Trainingsdokumentation samt Revisionen und Teilnehmerbezügen; geschütztes Schreiben nur mit gegen aktuelle Rollen-/Trainingszuordnung erneut geprüftem Akteur. Nicht erfasst: automatische personenbezogene Freitextsuche und Live-Promotion alter Restore-Kopien. Ein vollständiger produktiver erster Doku-201/GET ist **T11** und darf hier nicht simuliert werden.

## Tatsächlich geprüfte Beweiskette
- `src/postgres-repository.ts` und `migrations/0001_appbasis_training_documentation_subject_deletion.sql`: versionierte Revisionen, SQL-Schreibsperre, privilegierte Erasure, Attribution gelöschter Personen in Fremdrevisionen.
- `test/postgres-repository.postgres.e2e.ts`: echte isolierte PostgreSQL-Revisionen, alt-/fremde Teilnehmer-Bereinigung, gleiche Mandanten-/Rollenrechte, Guard-/Function-ACL, Verweigerung gewöhnlicher unerlaubter UPDATEs.
- `test/subject-restore-reconciliation.test.ts`: deterministischer neuer Löschentscheid über altes Offline-Abbild, Redaktionszählung, falsche/ungültige Quelle und Retry.
- `apps/ulc-linz/test/training-documentation-postgres-write-guard.test.ts` und `production-auth-evidence-20261123.md`: HTTP-Actor muss eine autorisierte Live-Rolle/Gruppe haben; ein veralteter Actor kommt nicht an SQL-Revisionen.
- `apps/ulc-linz/test/t07-exact-owner-text-redaction.postgres.e2e.test.ts`: manuell autorisierte Entfernung **einer** historischen Notiz/Revision samt SHA256-Scope und kontrolliertem Readback; fremde Notiz unverändert.
- `apps/ulc-linz/worker/production-protected.ts`, `apps/ulc-linz/test/production-protected.test.ts`: M6 erzwingt `trainingDocumentationRuntimeMode=protected-production`, Runtime verweigert Start bei falscher DB-Rolle/Guard-ACL.
- PRODUKTIONS-Postgres **nur lesend am 28.11.2026**: 69 Tabellen; App-Rolle hat Doku/Revision-SELECT+INSERT sowie Root-UPDATE, aber kein direktes Revisions-UPDATE/DELETE und **kein Löschmarker-Schreibrecht**; 2 Doku-Guard-Trigger aktiv.

## Verbindliche Betriebsgrenzen
Kein T06/T08-Zirkelschluss: erster legitimer berechtigter POST/GET und reale Persistenzkontrolle ausschließlich beim kontrollierten **T11**-Start. Freitext-/Audit-/Trainer-Sonderfälle: separate private T07-Prüfung oder STOP; kein selbständiger Purge. Alte Restore-Kopie weiter quarantänisiert, kein Live-Writer. Das Modul erlaubt keine eigenen Datenschutz-/Provider-/Deployment-Freigaben.
