# ULC Linz – P02/P03: aktueller produktiver Cutover-Befund

**Stand:** 21.11.2026 · **Status:** read-only Istbefund plus technische Kandidaten, **keine** Datensatzänderung, SQL-Rollenreparatur oder Produktivfreigabe.

## P02: Alte Trainingsblock-Nutzung – ist in Produktion noch nicht entstanden

Direkt auf dem tatsächlichen Neon-Projekt `appbasis-ulc-linz-production`, Branch `production`, Datenbank `neondb` **nur aggregiert und lesend** geprüft:

| SQL-Zähler | Wert |
| --- | ---: |
| `appbasis_training_block_usage` – alle Nutzungen | 0 |
| `appbasis_training_block_usage_subject` – zugeordnete Nutzungen | 0 |
| Nicht zugeordnete historische Nutzungen | 0 |
| Nutzungseinträge mit Freitext | 0 |
| Auf Trainingspläne zurückgehende Nutzungen | 0 |
| `appbasis_training_block_usage_subject_deletion` – Löschmarker | 0 |
| `appbasis_training_documentation` – Dokumente | 0 |
| `appbasis_training_documentation_revision` – Revisionen | 0 |

**Folgerung:** Es gibt derzeit keine Produktions-Altbestände für diesen P02/P03-Datenbestand, deren Zuordnung wir erraten oder löschen müssten. Das ist ein Zeitpunktbefund, keine Garantie über weitere Writes und kein allgemeiner Privacy-Nachweis.

**Noch offener echter SQL-Rollenbefund:** `ulc_linz_application` hat auf der alten `appbasis_training_block_usage`-Tabelle `SELECT, INSERT, UPDATE, DELETE` (kein `TRUNCATE`). Die Preview-App-Rolle hat dieselben vier Rechte. Für die normale verifizierte Nutzungsbuchung werden `SELECT/INSERT`, nicht `UPDATE`, benötigt. Die privilegierte, vom App-User zu trennende Subjekt-Löschung nutzt hingegen `DELETE`, deshalb darf **nicht blind** `REVOKE DELETE` ausgeführt werden, ohne den separaten Lösch-Owner und seine Restore-Proben verbindlich zu testen.

**Nächster fachlicher P02-Cutover:** Exakten normalen App-Writer vs. privilegierten Erasure-Owner trennen; dann minimale Rechte `SELECT/INSERT` für gewöhnliche App-Rolle einrichten, streng überprüften SQL-Revoke mit rollbackfähigem Preflight ausführen und DML-/Restore-E2E gegen echte getrennte Rollen. Die bereits in #705 implementierten Negativprivilegien für personenbezogene Usage-Marker bleiben erhalten. Keine Veränderung des SQL-Rechtes durch diesen PR.

## P03: Trainingsdokumentations-Actor atomar statt nur am HTTP-Eingang

Die vorangestellte HTTP-Prüfung bleibt vorhanden. Im aktuellen Draft-PR #706 erhält die modulare Dokumentationsrepository eine **optionale** atomare Write-Guard-Callback, die im privaten `protected-production`-Modus aktiviert wird.

Beim tatsächlichen `create` und `appendRevision` wird derselbe in der signierten HTTP-Sitzung aufgelöste `actorPrincipalId` über die bereits vorhandene Service-Schichtenführung mitgegeben. Unter derselben PostgreSQL-Transaktion wie der WRITE gilt: richtige Organisation, aktive Mitgliedschaft, nicht beendete Rolle, genau eine kanonische aktive SQL-Rolle, bekanntes Edit-Recht, Revoke vor Grant/Rollenrecht, Athlet nur mit `self`-Relation zum betroffenen Subjekt. Die SQL-Freigabezeilen erhalten `FOR SHARE` gegen gleichzeitige kanonische Grants-/Revokes. Fehlende Actor-ID blockiert vor dem INSERT. Für den normalen Preview-/InMemory-Pfad bleibt das Callback **aus**.

**Bekannte Grenzen:** Ein direkter privilegierter SQL-Zugriff ohne diesen Repo-Pfad, unkoordinierte SQL-Rollenmutation ohne kanonische Parent-Lock-Konvention und der globale Offline-Restore liegen außerhalb des Guards. Vollständige Freitext-/Trainer-Audit-/Cross-Owner-Löschung, AVV und K2-Restore-Evidenz bleiben P01/P03-Sperren. Kein öffentliches Ingress und keine automatische Produktivdeklaration.

## Abnahmeentscheidung

- **P02 Altbestände:** 0, daraus kein historischer Reconcile-Aufwand für den aktuellen Zeitpunkt.
- **P02 SQL-Direktrechte:** FAIL / offen.
- **P03 atomare Doku-Edits:** Implementierungskandidat mit isoliertem PostgreSQL-E2E und Unit-Negativtests, vor finalem CI- und Security-Review **nicht freigegeben**.
- **P01 Datenschutz, 8 Owner/Restore:** weiterhin BLOCKED.

**Reihenfolge:** #705 geprüft zuerst fachlich reviewen; #706 nach grüner CI, Review und gezieltem privaten Login-/Revoke-Test; erst danach Betreiber-/Providerfreigaben und `production-contract --require-ready` erneut auswerten. Ein weiterer `composition_gate` ohne diese Nachweise würde wieder blockiert.
