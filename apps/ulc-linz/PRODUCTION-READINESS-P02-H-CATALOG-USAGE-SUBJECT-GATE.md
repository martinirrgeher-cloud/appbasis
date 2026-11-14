# P02-H – personenbezogene Katalognutzung: explizite Subjektzuordnung und atomare Löschsperre

**14.11.2026 · Status: DRAFT / isolierte PostgreSQL-Abnahme – nicht in die ULC-Laufzeit verdrahtet.**

Ausgangslage: Der Standard-Übungskatalog speichert `usage.source_ref` und `usage.note` als freie Texte. Ein `source_ref` kann einen Trainingsplan, einen Termin oder eine Person bezeichnen; sein Text ist **keine verlässliche Identitätszuordnung**. Die vorhandenen P02-D-Negativtests zeigen, dass personenbezogene Notizen nach einer Löschung mit dem bisherigen Repository erneut geschrieben werden können.

## P02-H – echte neue Repository-Methoden (opt-in)

In `modules/exercise-catalog/src/postgres-repository.ts` (fortgesetzter Entwurf aus P02-G):

- Opt-in `usageWriteMode: "require-explicit-subject"` ist **nur zusammen** mit `favoriteFenceMode: "require-catalog-erasure-marker"` konstruierbar. Der bisherige Modus `legacy-unprotected` bleibt zum Schutz bereits abgenommener App-Benutzer unverändert. Die ULC-App aktiviert den neuen Modus **nicht**.
- Im Opt-in verweigert `recordUsage(event)` sämtliche freien, potenziell personenbezogenen Usage-Writes. Nur `recordUsageForVerifiedSubject(event, context)` ist dann zulässig. Die Struktur des Kontexts muss **exakt zur Organisation und Usage-ID** passen und eine ausdrückliche Principal-ID sowie die Behauptung `verifiedBy: "identity" | "athletes"` enthalten. **Wichtig:** Diese Angabe ist nur ein vom aufrufenden Code behaupteter Kontext, **kein kryptografischer Beweis und keine selbstständige Prüfung** beim Identity-/Athleten-Owner. Ein späterer freigegebener Adapter muss die tatsächliche Berechtigung und fachliche Zuordnung vor Aufruf nachweisen.
- Der opt-in Writer nimmt den **gleichen transaktionalen Pair-Lock** `(organizationId, principalId)` wie P02-G-Favoriten und zugehörige Löschung, prüft den vorhandenen 35-Tage-Marker und schreibt **beides atomar**: den regulären Usage-Datensatz samt Notiz und eine exakte `(organization_id, usage_id, principal_id)`-Verknüpfung. Ein Fremdschlüssel mit `ON DELETE CASCADE` sorgt dafür, dass ein gelöschter Eintrag keine verwaiste Zuordnung hinterlässt. Scheitert die Verknüpfung, rollt PostgreSQL den Usage-Datensatz zurück.
- `markPrincipalDeletedAndDeletePersonalCatalogData` verlangt **beide Schutzmodi** und führt unter dem gemeinsamen Pair-Lock **in einer DB-Transaktion** Löschmarker, Favoritenlöschung und Löschung ausdrücklich zugeordneter Usage-Ereignisse mit deren `note/source_ref` aus. Ein wiederholter Aufruf kann die bestehende 35-Tage-Frist **nicht** verlängern. Der ältere `markPrincipalDeletedAndDeleteFavorites`-Teilaufruf wird bei aktivem Usage-Schutz abgewiesen, um unvollständige Owner-Löschung nicht als Erfolg zu deklarieren.
- Der opt-in Weg **scheitert geschlossen** bei fehlender Markertabelle und erfindet keinen Fallback auf den Legacy-Writer.
- Persönliche Usage-Daten ohne nachgewiesene Ownership aus früheren Versionen werden **nicht** durch bloßen Textvergleich mit `source_ref` oder `note` gelöscht. Das ist eine **offene** rechtliche/technische Löschlücke, kein Zeichen für eine erfolgreiche vollständige Löschung.

## Ausschließlich isolierte Test-Datenbank

**Keine zusätzliche Modul- oder App-Migration.** Die bisherigen Katalog-Modulmigrationen `0000`–`0003`, App-Basis-Schema **v4**, Produktionsvertrag und Preview-Parity bleiben unverändert.

Zusätzlich zu der bestehenden P02-G-Test-Fixture gibt es ausschließlich für die temporär angelegte Test-PostgreSQL-Datenbank `apps/ulc-linz/test/fixtures/p02-h-catalog-usage-subject.candidate.sql`. Sie enthält die relationale genaue Nutzung-Principal-Zuordnung samt Scope-FK; keine vorhandenen Daten werden nachträglich ungesichert zugeordnet oder kopiert. Die Tests führen die bisherigen Katalogmigrationen und anschließend beide **nur testweise** SQL-Fixtures aus.

**10 echte PostgreSQL-E2E-Fälle** in `p02-catalog-usage-verified-subject.postgres.e2e.test.ts` prüfen:
1. Freie Schreibmethode im Schutzmodus verweigert; exakte, getrennte Identitätszuordnung bei einer neuen Notiz wird gespeichert, ohne `source_ref` als Principal zu missbrauchen.
2. Falsche Organisation, Usage-ID, unzulässige Owner-Angabe und ungültige Principal-ID werden verweigert.
3. Fehlender Favoriten-Fence, ungeschützte Methode und unvollständiger Löschaufruf bleiben gesperrt.
4. Transaktionsrollback bei Verknüpfungsfehler.
5. Atomic Owner-Löschung (Favoriten+Usage) mit Isolation anderer Principals/Mandanten, 35 Tagen und Idempotenz.
6. Zwei Connections: Löschung zuerst → nachfolgende Notiz wird verweigert.
7. Zwei Connections: Writer zuerst → Löschung entfernt seine gerade geschriebene Notiz.
8. Historische `source_ref`-Notiz ohne sichere Principal-Zuordnung bleibt ausdrücklich unerkannt – **Privacy-GAP weiter offen**.
9. Fehlende Löschmarkertabelle führt zu einem Block statt einer Umgehung.
10. (Der letzte Block ist getrennte Gate-/Integritätsabdeckung; die konkrete Gesamtzahl wird von der Vitest-CI ermittelt.)

## Grenzen vor realem Betrieb

- **Reale Authentizität:** Die vom Caller behauptete Personen-Zuordnung ist noch nicht gegen kanonisches Identity/Athleten-Owner-System geprüft. Für den produktiven Zugriff braucht es einen echten autorisierten Serviceaufruf/Scope-Check und weiterhin sämtliche alten, direkten und parallelen SQL-Schreibwege unter derselben Sperre.
- **Historische Daten:** `source_ref` kann weder zuverlässig eine Person noch deren Löschumfang belegen. Ein separater Bericht mit verifizierter Zuordnung und Behandlung nicht eindeutig zuordenbarer Altbestände ist zwingend.
- **Andere Personen in Notizen:** Auch bei sicherer Zuordnung des primären Principals kann `note` Dritte nennen. Geprüfte Datenschutz-/Redaktionsentscheidung weiterhin erforderlich.
- **Unvollständige Lesekontrolle:** Bestehende `listUsageEvents`-Sicht ist nicht subjektgefiltert; Berechtigungs-/Minimierungsprüfung vor Go-live erforderlich.
- **Vollständige Betroffenenlöschung:** Katalog allein genügt nicht; P01-D2-35-Tage-Quelle, Backup-/Restore-Replay aller acht Owner, Rechtsgrundlage und AVV sind offen. P02-E-Medienlöschung beim Cloud-Provider ist nicht nachgewiesen.
- **Kein automatischer Lauf:** Keine SQL-Migration auf Neon, Cloudflare-Worker-Änderung, keine echte Datenabfrage/-löschung, kein Merge, keine produktive Aktivierung oder Google-Drive-Anbindung. `privacy=blocked`, `applicationLifecycle=blocked`, die bisherige 35-Tage-Grenze und `postExpiryRetry=deny` bleiben unverändert.

**Abnahmeziel:** Nur wenn Quality Gate und echte PostgreSQL-E2E auf derselben PR-HEAD-SHA bestehen, gilt **P02-H-Entwurf PASS**. Das ist ausdrücklich **keine** produktive Freigabe.
