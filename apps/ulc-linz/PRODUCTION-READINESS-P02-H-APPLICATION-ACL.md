# P02-H – Exakte SQL-Rollenrechte für die 69-Tabellen-Testkopie

**20.11.2026 | DRAFT | Keine Production-/Preview-Rechteänderung, kein Deployment, kein Merge.**

## Grundlage

Der freigegebene reale Neon-Test auf einer isolierten Branch `br-calm-breeze-b18nlqw0` (Projekt `bold-dew-01343606`) hat die originalen 51 Tabellen auf 69 erweitert. Der Datenabgleich der 51 bestehenden Tabellen ergab **141/141 identische Datensätze**. Die normale SQL-Rolle `ulc_linz_application` hat zwar bereits Berechtigungen für 50/51 alte Tabellen, aber **auf keiner** der 18 neuen Tabellen Rechte. Diese Lücke wird hier gezielt auf SQL-Operationsebene vorbereitet.

Das Kandidaten-SQL steht ausschließlich unter `apps/ulc-linz/test/fixtures/p02-h-application-privileges.candidate.sql` (nicht unter `migrations/`) und ist **nicht** Teil des Datenbankschemas im Manifest. Der eingeschränkte Prüfer `tooling/ulc-linz-p02-h-application-acl.test.mjs` fixiert alle 17 positiven Tabellen- und Operationszuordnungen. Der bereits verpflichtende PostgreSQL-18-In-Place-Test `tooling/ulc-linz-p02-g-synthetic-upgrade.postgres.test.mjs` erstellt nun auch eine synthetische NOLOGIN-Anwendungsrolle, erteilt dort die isolierten Kandidaten-Grants und verifiziert für **alle 18** Tabellen jede der fünf Operationen `SELECT/INSERT/UPDATE/DELETE/TRUNCATE`. Direkte SQL-Denial-Transaktionen müssen zusätzlich sechs hochsensible Löschmarker vor DELETE schützen.

## Berechtigungsmatrix – normale App-Rolle

| Objekt | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|:---:|:---:|
| Athleten-Kontaktdaten | ✓ | ✓ | ✓ | ✓ |
| Katalog-Favoriten-Löschmarker | ✓ | – | – | – |
| Katalog-Nutzungszuordnung | ✓ | ✓ | – | – |
| Block-Favoriten-Löschmarker | ✓ | – | – | – |
| Block-Nutzungszuordnung | ✓ | ✓ | – | – |
| Block-Nutzungs-Löschmarker | ✓ | – | – | – |
| Trainingsdokumentation (Root) | ✓ | ✓ | ✓ | – |
| Trainingsdokumentation (Revisionen) | ✓ | ✓ | – | – |
| Dokumentations-Löschmarker | ✓ | – | – | – |
| Trainingsplan-Löschmarker | ✓ | – | – | – |
| Kalender-Ausnahmen | ✓ | ✓ | ✓ | – |
| Kalender-Regeln | ✓ | ✓ | ✓ | – |
| Anmeldungen | ✓ | ✓ | ✓ | – |
| Anmeldungs-Historie | ✓ | ✓ | – | – |
| **App-eigener Trainings-Löschmarker** | **–** | **–** | **–** | **–** |
| Traineranwesenheit | ✓ | ✓ | ✓ | ✓ |
| Kindertraining-Kategorien | ✓ | ✓ | ✓ | – |
| Gruppenkategorien | ✓ | ✓ | ✓ | – |

**Bei allen 18 Tabellen bleibt `TRUNCATE` für die normale App-Rolle verboten.** Keine `GRANT ALL`, keine Grants an `PUBLIC`, keine globalen Standardrechte oder Migrationsrechte. Die Privilegien für Lösch-/Restore-Coordinatoren sind **separat** zu authorisieren und werden durch dieses Paket nicht erteilt.

## Einschränkungen und Folgearbeiten

1. Die normale App- und Admin-Authentifizierung erfolgt weiter über die bestehenden Identity-/Permission-/Membership-Schichten. SQL-Grants sind technische Mindestvoraussetzungen und **ersetzen nicht** die Prüfung von Organisation, Rolle und Athleten-Scope. Keine neuen Berechtigungsendpunkte.
2. Die aktuellen geschützten Runtime-Preflights prüfen ausdrücklich die **Preview-Identität und 66 beziehungsweise 68 Tabellen**; sie können daher trotz positiver ACL auf der neuen **69-Tabellen-Testkopie** nicht als Laufzeit-PASS interpretiert werden. Ein späterer Integrations-/Cutover-PR muss diese Vertragsversionen kontrolliert anpassen, ohne den bestehenden Preview-Opt-in oder getestete Module zu überschreiben.
3. Migrationen v17, Katalog-v5 und P03-D sind weiterhin **nicht** registriert; die SQL-Kandidaten sind keine Produktivversion. Ein positiver Rollentest ist **kein** P01-/D2-/Medien-/Backups-/All-Owner-Lösch- oder Berechtigungs-Freigabebeleg.
4. Die reale Kopie ist vom Production-Traffic isoliert und enthält die originalen 141 Bestandszeilen. Positive Rollentests werden nur dort und/oder in einer lokalen CI-Wegwerf-DB ausgeführt. Production und Preview bleiben unverändert. Vor produktiven SQL-Grants ausdrücklich getrennte Betreiberentscheidung, verifizierte Zielrolle und dokumentierter Revoke-/Rollbackpfad.

**Ergebnisentscheidung:** Kandidat kann bei erfolgreichem exaktem Head-CI zur strukturierten Integration in die Draft-Stack-Kette übernommen werden. Kein Merge/Deploy ohne explizite Freigabe.
