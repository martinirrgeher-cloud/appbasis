# P03-E – Ein testbarer Schreibschutz, noch kein Runtime-Eingriff

**Stand 18.11.2026 · Security-DRAFT · Keine Migration oder Freigabe aktiviert.**

## Was wurde konkret umgesetzt?

Die bisher nur im E2E eingebetteten drei SQL-Trigger aus P03-D liegen jetzt als **separate, prüfbare SQL-Kandidatenvorlage** unter `proposals/p03e-subject-write-fence.sql`. Der bestehende echte PostgreSQL-Test installiert **diese Datei** in eine ephemere Testdatenbank. Damit werden nicht nur Tests einer anderen Handimplementierung, sondern die später tatsächlich zu prüfenden SQL-Statements ausgeführt.

Die Vorlage schützt `ulc_linz_training_attendance`, `ulc_linz_training_registration` und `ulc_linz_training_registration_change` auf Datenbankebene. Ein `INSERT` oder `UPDATE` für eine gesperrte `organization_id / athlete_id` wird mit `ULC_P03E_SUBJECT_WRITE_BLOCKED` abgewiesen, unabhängig davon, ob ein alter Client den HTTP-Berechtigungscheck umgeht. Zwei Quellen werden berücksichtigt:

1. **P03-E-Kandidatenmarker** mit Org-/Athleten-Scope, angelegt ausschließlich im isolierten Test. Es gibt bewusst noch keine genehmigte Frist/Live-Insert-Route.
2. **Bereits vorhandene Athleten-Owner-Löschmarker** in `appbasis_athletes_deletion`; keine Änderung an deren bestehender 35-Tage-Frist.

Der Kandidat verwendet denselben transaktionslokalen Advisory Lock wie der isolierte P03-D-Löschversuch. Die Testfälle S1/S2/S5/S6 sowie die bestehenden Proxy-/Rollen-/Freitext-Gegenbeispiele laufen weiter. Neu werden direkte `UPDATE`s in **allen drei** privaten Tabellen sowie die separate echte Athleten-Source-Marker-Sperre einschließlich Cross-Org-Gegenprobe abgedeckt.

## Separat erhobener realer Preview-Schema-Gap (nur Metadatenabfrage)

Am 18.11.2026 meldet Neon für das bestehende Preview-Projekt `appbasis-ulc-linz-preview`, Branch `main`, Datenbank `appbasis_ulc_linz_preview` **62 öffentliche Tabellen**. Im Vergleich zur bestätigten Repo-Inventur fehlen in der Preview weiterhin diese vier vertraglich deklarierten Lifecycle-Tabellen:

- `appbasis_training_block_usage_subject`
- `appbasis_training_block_usage_subject_deletion`
- `appbasis_training_block_favorite_deletion`
- `appbasis_training_documentation_subject_deletion`

Die beiden später hinzugekommenen Kalender-Tabellen sind dagegen vorhanden. Darum kann der **erfolgreiche Preview-Handytest nicht als Beweis der kompletten produktiven Lifecycle-/Restore-Migration gelten**. Vor einem Produktionsdeployment die spezifischen bestehenden Owner-Migrationen gemäß kanonischem Manifest vorbereiten, in getrenntem Staging/isolierter DB testen und erst nach Freigabe anwenden. Diese PR führt sie **nicht** aus.

## Stoppbedingungen vor einer echten Aktivierung

- **Nicht im Manifest**: Die vorgeschlagene SQL-Datei darf weder vom Migrationsrunner noch vom Worker automatisch geladen werden; der Test überprüft diese Negativbedingung.
- **Frist/Grundlage**: Der neue Kandidatenmarker wäre selbst personenbezogen. Die im P01-Dokument bereits fachlich bestätigten Zielregeln reichen nicht für eine unbefristete neue Erasure-Autorität. Es gilt weiter: 35 Tage und danach deny, solange keine andere Vereinbarung rechts-/technisch freigegeben ist.
- **Race**: Eine reale Löschentscheidung muss **dieselbe** Lock-Grenze wie der SQL-Writer halten. Der vorhandene Athleten-Owner-Workflow ist durch diesen Kandidat allein nicht auf diesem Lock serialisiert.
- **Identität/Rechte**: DB-Owner und zugriffsarme Runtime-Rollen, Admin-Berechtigungen, Proxy-/Trainer-Audit und SQL-SECURITY-DEFINER-Fragen separat prüfen.
- **Scope-Erweiterung**: Trainerpräsenzen, Actor-Identitäten, Freitext, Katalog/Block/Plan/Doc-Owner und Backup/Restore bleiben eigenständige Bereiche. Kein Ersatz für die Gesamtkomposition S1–S8.
- **Keine Migration, kein R2/Neon-/Cloudflare-Write, kein Änderung von Vertragsstatus, keine Preview- oder Produktionsschaltung**.

## Abnahme dieses technischen Entwurfs

1. CI: `Quality gate` + `Identity PostgreSQL E2E` auf **derselben exakten HEAD-SHA** PASS; die bestehende P03-D-Testdatei muss im realen PostgreSQL-Lauf erscheinen.
2. SQL-Draft in Review, aber **nicht** in `appbasis.database.json`.
3. Nächster Umsetzungsschritt nach einem einzigen Betreiber- und Datenschutz-Gate: freizugebende echte Migration samt genehmigter Markerautorität, atomar verdrahtetem Löschkoordinator und isoliertem, auch über alte Writer geführten PostgreSQL-Race-Nachweis. Keine Einzelschalter für P03-E ohne zusammenhängende Abnahme.

**Übergeordnet:** [Produktiv-Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [P01-Datenschutz-Zielvorgaben #619](https://github.com/martinirrgeher-cloud/appbasis/pull/619), [P03-B Writer-Audit](../PRODUCTION-READINESS-P03-B-WRITER-AUDIT.md).
