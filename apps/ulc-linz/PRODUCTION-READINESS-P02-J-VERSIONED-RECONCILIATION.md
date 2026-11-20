# P02-J – Release-Manifeste und 66/69-Bestandsabgleich

**Stand 20.11.2026 – DRAFT, keine Änderung am aktuellen Betrieb.**

## Ergebnis und konkreter Release-Gewinn

Die Preview-Datenbank `appbasis_ulc_linz_preview` wurde mit gesonderter Betreiberfreigabe bereits auf **69 Tabellen** erweitert und die reale Preview-App-Rolle gezielt berechtigt. **Der reguläre AppBasis-Migrations-Executor unterstützt jedoch ausschließlich die Initialinstallation in ein leeres `public`-Schema.** Ein neues Manifest mit nachträglichem, blindem Ausführen von `CREATE TABLE` auf der vorhandenen Preview wäre nicht korrekt.

Dieses Paket stellt deshalb die nächste Freigabe *ohne* einen solchen Blind-Apply her:

1. **Vollständiger vorgeschlagener Versionsstand:** `release/p02-j-appbasis.database.v18.candidate.json` enthält die acht bisherigen Owner und **44** (statt 41) Migrationsdateien: Kalender `0016`, app-owned Training-Löschschutz `0017`, Katalog-eigene `0004`. Lifecycle v16→**v18**, Übungskatalog v4→**v5**. `release/p02-j-exercise-catalog.v5.candidate.json` enthält genau denselben Katalog-Ownerstand für das Modul.
2. **Kein stilles Publizieren:** `apps/ulc-linz/appbasis.database.json`, `modules/exercise-catalog/appbasis.module.json`, `tooling/generated-database-manifest.mjs` und `tooling/ulc-linz-database-contract.mjs` bleiben **unverändert**. Die vorgeschlagenen neuen Migrationen `modules/exercise-catalog/migrations/0004...` und `apps/ulc-linz/migrations/0017...` stehen als bereits geprüfte SQL-Kandidaten unter `test/fixtures`, nicht als ungeprüfte, aktive SQL-Dateien im `migrations`-Ordner. Die Kalender-Originaldatei `0016` liegt bereits vor.
3. **Schreibgeschützter Abgleich:** `tooling/ulc-linz-p02-j-manifest-reconciliation.mjs` kontrolliert exakt 66→69 einschließlich Kalender-Relationen, zwei Katalogrelationen mit Index, P03-D-Marker, Schutzfunktion, **drei installierten UND drei aktiven** BEFORE-INSERT/UPDATE-Zeilentriggern und **keinen** Rechten der gewöhnlichen App-Rolle auf den Trainings-Löschmarker. Bei teilweiser Installation, verändertem Funktionsbezug, deaktiviertem Trigger, unerwarteter Tabellenzahl oder Marker-Rechten: **BLOCKED**. Es gibt **keinen** SQL-Apply- oder Berechtigungsmechanismus.
4. **Echte PostgreSQL-18-E2E:** Die vorgeschlagenen 44 Migrationen werden aus Originaldateien plus exakt den zwei bereits geprüften SQL-Kandidaten **in kanonischer Owner-Reihenfolge** auf einer lokalen leeren Wegwerf-Datenbank ausgeführt. Ein absichtlicher SQL-Transaktionsabbruch muss alle bisherigen DDL-Writes zurückrollen; danach muss die Neuinstallation exakt **69 Tabellen** und die erforderlichen Schutzfunktionen ergeben. Der vorhandene 51→69-In-Place-Test ist um Klassifizierung bei 66 und bei 69 unter synthetischer App-Rolle samt Negativprobe mit deaktiviertem Trigger erweitert.
5. **Reale Nur-Lese-Prüfung:** Exakt die neue SQL-Inventurabfrage wurde auf der aktuellen Neon-Preview mit der gewöhnlichen Rolle `appbasis_ulc_linz_preview_application` und auf Production `neondb` mit `ulc_linz_application` ausgeführt:
   - Preview: **69**, beide Kalender-Tabellen, beide Katalog-Guards und Katalogindex vorhanden, Trainingsmarker und Schutzfunktion vorhanden, **3/3** installierte/aktive Trainings-Fences, keine Markerprivilegien der normalen Rolle: **Schema-Bestandsabgleich PASS**.
   - Production: **51**, keine Kalender-/Katalog-/Trainingsguard-Erweiterungen: **nicht kompatibel**, ausdrücklich keine automatische Ausführung.

## Noch notwendiger Release-Vorgang

Die nächste *separat freizugebende* Registrierung muss alle Abhängigkeiten zusammen ändern:

- Katalog-SQL `0004` und App-eigene Löschschutz-SQL `0017` mit freigegebenen Originalstatements als endgültige Owner-Migrationen ablegen, die Kalenderdatei `0016` einschließen.
- Beide aktiven Manifeste, den AppBasis-Manifestgenerator und den ULC-Datenbankvertrag **konsistent** auf den neuen Stand heben; historische P01-/M5-Inventare, Export-Zuordnung, v17-G04-Staging-Tests und bisherige 41-Migrations-Audits kontrolliert auf historischen Beleg versus aktuelle Version trennen. Eine stillschweigende Umdeutung von Datenschutz-Entscheidungen als genehmigt ist untersagt.
- Einen **expliziten Reconcile-Modus für bereits migrierte Preview** verwenden: auf PASS-Bestandsabgleich keine bestehende SQL-Datei nochmals ausführen; kein Standard-`applyRepositoryMigrationPlan` auf nichtleeres `public` anwenden. Bei Drift keine Aktualisierung oder Deployment.
- Den geschützten Worker-Opt-in und alle sechs Module nach GitHub-Merge und gezieltem Preview-Deployment auf dem Handy abnehmen. Kein Merge/Deploy ohne gesonderte Betreiberfreigabe.

**Wichtige Abgrenzung:** Erfolgreicher SQL- und Versionsabgleich bedeutet nicht freigegebene Echtdaten-Löschung, Restore-No-Resurrection für alle Owner, R2-Medien oder rechtliche P01/D2-Entscheidung. Production-Echtbetrieb bleibt unabhängig blockiert.

**Betrieb während dieses Pakets:** Preview 69, Production 51. Keine laufende DB geändert, keine Berechtigung gewährt, keine Resource gelöscht, keine Releases verteilt. Bezug #530, #607, Drafts #659–#667.
