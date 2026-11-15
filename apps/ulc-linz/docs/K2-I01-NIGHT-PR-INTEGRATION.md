# K2-I01 – Gemeinsame Offline-Regression der Draft-PRs (15.11.2026)

**Review-Vorbereitung. KEIN Merge, Deploy, Backup-/Restore-Run, Provider-Write, Lifecycle-Update, Datenlöschung oder Produktiv-Go.**

## Tatsächlicher Scope

PRs #633–#638 wurden einzeln gegen `main` vorbereitet; der bisherige Offline-Check erkannte nur manuell übertragene PR-Metadaten. Er prüfte weder einen **gemeinsamen** Codezustand noch eine **veraltete CI auf geändertem HEAD**. Diese Revision löst beide Mängel getrennt:

1. `tooling/ulc-linz-k2-pr-integration.mjs` lehnt jede unbekannte SHA, abweichende `main`-Basis, ungenaue Dateiliste, fehlende Mergefähigkeit oder nicht exakt zum HEAD passende CI ab. Die Quelle bleibt ein **manuell geprüfter** GitHub-Export. Eigene JSON-Angaben sind nicht beweiskräftig.
2. `.github/workflows/ulc-linz-k2-combined-offline-regression.yml` holt im automatischen PR-CI-Kontext **nur die sechs geprüften Draft-HEADs**. Es kontrolliert SHA-Gleichheit, kopiert ausschließlich die 19 geprüften Dateipfade per `git show` in ein temporäres CI-Arbeitsverzeichnis und führt die sieben einzelnen Node-Testsuiten **plus echte modulübergreifende Tests** aus. **Keine Git-Merges und keine Commits**. Der Check nutzt nur GitHub-Lesezugriff; vor der Testausführung wird die temporäre Checkout-Git-Berechtigung aus der lokalen Konfiguration entfernt. Keine Provider-Secrets, Datenbankzugriffe oder echte Medien.

### Gepinnte Snapshot-Versionen

| PR | Paket | Erwartete HEAD-SHA |
| --- | --- | --- |
| #633 | R2-Retention-Entwurf | `4622f97ae335a12de815bb4e960512d7dbcb9c97` |
| #634 | Medieninventar | `e08f9619a37ef2b9d418a70e0fcbbc4483db7286` |
| #635 | Quarantänegrenzen | `363cdc28768e9292d0ed83d979dbb09c5bb691f3` |
| #636 | Restore-Evidenz | `8c773866fb4a1308dccf0b461ee7b9f6c807467f` |
| #637 | Betreiberfreigaben | `662f44093d8dd8b8872f41486ac407c627aa560b` |
| #638 | Korrigierte RPO/RTO-Berechnung | `4a3304a4248100a2d7558566d85eea943c40cb87` |

Gemeinsame überprüfte `main`-Basis: `d1b8de78eb536698fce8f4374f2543f499dd86c5`. Ändert sich eine HEAD-SHA oder `main`, stoppt das Gate, bis eine neue gemeinsame Prüfung und erneute Dokumentation stattfinden. Gepinnte Hashes sind keine automatische inhaltliche Freigabe.

## Testausführung

- Die PR-Workflowdatei wird bei Änderungen an diesem PR automatisch ausgeführt; sie führt keinerlei manuelle Provider-Workflows aus.
- Der kombinierte Test importiert die **tatsächlichen sechs Quellmodule** in einer gemeinsamen temporären Arbeitskopie: Aufbewahrung bleibt nicht löschberechtigt; Medieninventargleichheit bedeutet **keinen Medien-Restore**; Restore-Evidenz verlangt Rolle/RLS, Datenschutz und Medien; K2-RPO/RTO zählt Ausfallbeginn bis vollständige App-Abnahme, nicht bloß `pg_restore`.
- Lokaler Metadaten-Test: `node --test tooling/ulc-linz-k2-pr-integration.test.mjs`.
- Nach Staging der geprüften 19 Dateien im selben Arbeitsverzeichnis: `node --test tooling/ulc-linz-k2-*-test.mjs` ist **nicht** die definierte Aufrufsyntax; verwende die exakten acht Testdateien aus dem CI-Workflow. Für eine lokale Wiederholung darf das Staging nur in einer Wegwerfkopie erfolgen. Keine Provider-Kontakte.
- CI-Ergebnis ist nur dann **PASS**, wenn Workflow und sämtliche Tests auf dem aktuellsten PR-HEAD erfolgreich abgeschlossen sind. Ein grüner generischer Qualitätscheck allein reicht **nicht**.

## Verbleibende harte Stop-Gates

- Ungeklärte R2-Lifecycle-/Legal-Hold-/Aufbewahrungsentscheidung. Die vorgeschlagenen 21 Tage sind **keine** freigegebene TTL oder Löschregel.
- Kein unabhängiger **echter Medien-Restore** mit überprüften Inhaltsdigests und Anwendungstest.
- Keine Login-/Rollen-/RLS-/Cross-Org-Negativtests in einer isoliert verkabelten Restore-App.
- Kein tatsächliches E2E-RPO/RTO-Messprotokoll; keine vorher genehmigten Zahlen.
- Fehlende Freigabe für Datenschutz, Re-Deletion, Backup-Automatik und Produktivnahme.
- Die kombinierte Regression ist **synthetisch und offline**, kein integrierter PostgreSQL-, R2-, UI- oder Browser-E2E und keine Freigabe für Produktion.

## Technische Freigabereihenfolge

1. #638 auf neuer SHA vollständig CI PASS und fachliche Zeitsemantik prüfen.
2. #639 kombinierte Regression auf aktueller SHA vollständig CI PASS; HEAD-SHAs erneut direkt mit GitHub vergleichen.
3. #633–#639 einzeln Code-reviewen; nur mit separater ausdrücklicher Betreiberfreigabe später übernehmen.
4. Bei einer danach genehmigten sequentiellen Übernahme nach **jeder** Änderung alle Haupt- und ULC-CI-Prüfungen kontrollieren; die isolierten Provider- und Anwendungs-E2E-Belege bleiben zusätzliche, getrennte Entscheidungen.

Die beiden bereits erfolgreichen K2-Läufe [Backup #43645974462](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43645974462) und [Restore #43647364218](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43647364218) bestätigen lediglich die vorausgegangene PostgreSQL-Pilotstrecke. 
