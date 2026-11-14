# P02-D – Übungskatalog: Post-Löschung, persönliche Usage und private Medien

**Stand:** 14.11.2026 · **Status:** Isolierte NEGATIVTESTS; KEINE Live-Security-, Provider- oder Datenschutzfreigabe.

## Absicht

Für den vollständigen Echtbetrieb des ULC Linz sind Übungskatalog, Trainingsblöcke und Anwesenheits-/Doku-Daten gleichermaßen nötig. `exercise-catalog` bleibt im Production-Contract ausdrücklich `blocked` (Lifecycle). Ein grüner Test, der eine **bestehende unsichere Möglichkeit** nachweist, ist **kein** positives Sicherheits-Abnahmekriterium.

**P02-D** ergänzt `test/p02-catalog-retention-negative.postgres.e2e.test.ts` zu `apps/ulc-linz/package.json` `test:postgres` und führt in einer flüchtigen realen PostgreSQL-Datenbank alle vier aktuellen Katalogmigrationen aus.

| Szenario | Isolierte Beobachtung | Offene echte Sicherheitsarbeit |
| --- | --- | --- |
| **A – Favoriten** | `setFavorite` kann nach direkter Löschung einer Principal-Präferenz denselben Eintrag erneut anlegen; andere Org mit gleichem Principal bleibt separat | Atomarer Org-/Principal-Scoped Tombstone, Identitäts-Lifecycle, Legacy-/Restore-Guard |
| **B – Usage/Freitext** | `recordUsage` kann nach Entfernen eines Ziel-`source_ref`-Datensatzes eine neue gleich personenbezogen wirkende Note speichern | Belegbarer Owner statt `source_ref`-Raten, personenbezogene 12-Monats-Zielfrist und autorisierter Writer/Restore-Guard |
| **C – Private Medien** | `completePrivateMediaDeletion` setzt **nur** DB-Metadaten nach angefordertem Delete auf abgeschlossen, ohne Providerparameter; ein simuliertes externes Objekt bleibt existent | Objektlösch-Proof/Provider-AVV/Region, Retry und Idempotenz inklusive Storage-Key, erst danach SQL-Metadaten-Abschluss |
| **D – Org-Isolation** | Ausführliche Delete-Anfrage für `org-a` bewahrt dieselbe Media-ID in `org-b` | Zusätzlich Zugriffsbefugnis, Konto-/Actor- und Provider-Grenzen nachweisen |

**Risikowichtige Unterscheidung:** Der Test verwendet einen rein lokalen Set als **Demonstration** einer externen Datei und behauptet weder einen echten R2/S3-Provideraufruf noch einen geprüften AVV. Der negative Favoriten-/Usage-Test führt **keine** kanonische Subject-Löschung aus, sondern zeigt das Fehlen eines für diese Writes wirksamen Post-Erasure-Guards. Aktuelle HTTP-Berechtigungen können zusätzliche Kontrollen enthalten; diese werden durch die Repository-Gap-Tests **nicht** widerlegt.

## Fachliche Zielvorgabe und nächste notwendige Umsetzung

Die ULC-Vereinsvertretung hat am **14.11.2026** in der Unterhaltung die vorgelegten **bedingten** P01-Zielfristen ausdrücklich bestätigt:
- persönliche Favoriten nur während bestehendem Zweck/Konto;
- personenbezogene Usage maximal 12 Monate **bei begründetem Statistikzweck**;
- Medien Minderjähriger ohne Provider-/Rechtsgrundlage-/Löschbeleg für neue Nutzung gesperrt;
- historische unklare `source_ref`/`note`-Daten **nicht** ohne nachvollziehbare Verifikation einer Person zuordnen.

Die konkrete Rechtsgrundlagen-/DPA-/Backup-/Minderjährigen-Prüfung ist noch offen; fachliche Bestätigung ist **keine** technische Wirksamkeit. Sie ist in [P01-Fachvorgabe PR #619](https://github.com/martinirrgeher-cloud/appbasis/pull/619) dokumentiert.

**Anschließende technische Reihenfolge:** (1) minimaler persönlicher Owner-Attribution-Vertrag, (2) im DB-Commit atomarer Deny-Fence für Favorite-/Usage-Writers einschließlich Cross-Org-/Race-Fällen, (3) echte Provider-Delete-Quittung mit ausgelöster SQL-Completion nach Bestätigung, (4) Backup-/Restore-Quarantäne über alle Datenowner, (5) neuer positiver PostgreSQL-Abnahmeblock. Die Schritte (1)–(5) dürfen nicht durch bloßes Ändern des Modulvertrags zu `ready` übersprungen werden.

**Nicht ausgeführt:** keine Änderung an produktiven Schreibpfaden, keine SQL-Migration, keine Rechte- oder Timeränderung, kein Zugriff auf Neon/Cloudflare/Medienprovider, kein echter Delete, kein Deployment. Production-Status `blocked` bleibt bestehen.
