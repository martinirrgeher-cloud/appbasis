# T07 – Manuelle Löschpraxis und Nachkontrolle (Betriebsanweisung, Entwurf)

**Stand 27.11.2026 | Technisch/fachlich vorbereitete Arbeitsanweisung, noch keine produktive Löschfreigabe.** Gilt nur für die private ULC-Linz-Mitglieder-App. **Keine automatische Retention, keine SQL-Ausführung, kein Restore-GO.** Zentrale Aufgabenliste: [#716](https://github.com/martinirrgeher-cloud/appbasis/issues/716). Rechts-/Fristgrundlage ist die am 14.11. bestätigte **fachliche Zielvorgabe** in [p01-operator-retention-candidate.json](./p01-operator-retention-candidate.json), deren `legalApproval=false` und `runtimeActive=false` ausdrücklich unverändert bleiben.

## 1. Verantwortung, Eingang und Entscheidung

**Verfahrensverantwortung:** von der Vereinsbetreiberperson beauftragte Vereinsadministration; Datenschutzkontakt der App: `martin.irrgeher@gmail.com`. Vor tatsächlicher Nutzung eine **nichtöffentliche Vereinsakte** mit verantwortlicher Funktion/Vertretungsbefugnis und den tatsächlich berechtigten Operatoren führen. Ein Chat-/Repository-Eintrag ersetzt diesen Beleg nicht.

1. Anfrage vertraulich entgegennehmen. In der privaten Akte nur Vorgangskennung, Eingangsdatum, Anfragetyp, zuständige Funktion und Frist führen; keine Namen, Subject-IDs, E-Mail-Adressen oder individuellen Marker in einem öffentlichen GitHub-Issue oder Actions-Input.
2. Befugnis der anfragenden Person beziehungsweise Vertretung (insbesondere bei Minderjährigen) angemessen und datensparsam prüfen. Gegenstand und alle betroffenen Datenbereiche anhand der **autoritativen** aktuellen Vereins-/App-Quelle bestimmen; Personen nicht aus Freitext, unklaren Alt-IDs oder ähnlich klingenden Namen erraten.
3. Rechtsgrundlage, Zweckende, notwendige Einschränkung, mögliche rechtliche Aufbewahrungspflichten oder andere überwiegende Gründe **für jeden betroffenen Datentyp** durch die verantwortliche Stelle prüfen. Keine pauschale Löschung von Belegen bei dokumentierter Pflicht; deren Zugang einschränken, Umfang minimieren und Wiedervorlage datieren.
4. Entscheidung `freigeben / eingeschränkt / ablehnen / unklar – STOP` mit Begründung, Datum und Operator in der **privaten** Akte festhalten. Jede technische Ausführung braucht ihren eigenen konkreten autorisierten Vorgang und die derzeit gesperrten Betriebsgates dürfen nicht umgangen werden.
5. Nachkontrolle und Betroffenenantwort ebenfalls nur privat dokumentieren; keine `vollständig`-Mitteilung bei unklaren Restkopien, Altverweisen, Medienobjekten oder Teilfehlern.

**Fristen für Betroffenenanfragen:** Die verantwortliche Stelle wahrt die jeweils gesetzlich geltende DSGVO-Antwortfrist und dokumentiert etwaige zulässige Verlängerung/Begründung separat. Die untenstehenden **Aufbewahrungsziele** sind nicht mit der Antwortfrist gleichzusetzen.

## 2. Fachliche Aufbewahrungs- und Reviewmatrix – bereits entschiedene Ziele

| Kategorie / Daten | Ziel / Trigger | Pflichtprüfung und Ausnahme |
| --- | --- | --- |
| Athleten-, Benutzer-, Trainer-, Rollen-, Kontakt-/Elternbezüge | Während eines belegten Zwecks; nach Austritt/Deaktivierung höchstens **12 Monate**, wenn erforderlich | Rechtsgrundlage und Zweck der jeweiligen Kontaktperson; Identitäts-/Session-/Permission-Reste getrennt |
| Anmeldung, Anwesenheit, Trainingshistorie und personenbezogene Plan-/Doku-Bezüge | **Bis zu 24 Monate** ab Training bei dokumentiert benötigtem Zwei-Saisonen-Vergleich | Frühere berechtigte Löschanfrage, unabhängige Förder-/Finanzbelege und Fremdpersonenbezüge getrennt |
| Personenbezogene Freitexte, Notizen, JSON und Revisionen | **Spätestens 90 Tage** nach zugrunde liegendem Training prüfen, Zweckentfall redigieren/entfernen | Kein automatisches Blind-Purge; Ausnahme nur mit konkretem Zweck, Grund, Bearbeiter und neuem Prüfdatum |
| Personenbezogene Usage-/Statistikereignisse | Höchstens **12 Monate**, sofern der konkrete Statistikzweck begründet ist | Unklare Alt-Zuordnung nicht als anonym behandeln |
| Security-, Permissions-, Trainer-, Actor- und Lifecycle-Audits | Höchstens **12 Monate** soweit notwendiger Sicherheits-/Nachweiszweck belegt | Pflichtbeleg und Zugang gesondert bewerten; Audit darf nicht unbefristete Schatten-Trainingshistorie werden |
| Persönliche Favoriten | Löschung bei Zweckende bzw. berechtigtem Personenlöschvorgang | Katalog/Block/App-Owner sowie Re-Insert-Schutz getrennt nachprüfen |
| Private Medien / externe Objekte | Neue erkennbare Minderjährigenmedien weiterhin **gesperrt**; bestehende Objekt-/Metadatenbezüge bei Vorgang prüfen | SQL-Metadatenlöschung ist kein Nachweis für Objektlöschung beim Provider |
| Quell-Löschmarker | **35 Tage**, danach `postExpiryRetry=deny` | Nicht still verlängern oder aus anderen Kopien rekonstruieren; offene Backup-Horizontfrage ausdrücklich als Risiko/STOP führen |

Die Tabelle ist **kein** Beleg aktiver technischer Fristenlöschung. Keine gesetzlichen Mindest-/Höchstfristen ohne die jeweils dokumentierte Rechtsgrundlage fingieren.

## 3. Freitext- und historische Revisionen: praktischer 90-Tage-Prozess

**Geplanter manueller Wiedervorlagelauf**, nicht automatisch in der App implementiert: anhand Trainingstag/letztem legitimen Inhalt prüfen. Bei aktuellen und historischen Daten den gesamten jeweiligen Zeitraum und die organisatorische Einheit betrachten, insbesondere:

- `ulc_linz_training_session`: `note`, `training_content_titles`, `training_content_items` einschließlich verschachtelter JSON-Inhalte;
- `ulc_linz_training_registration` und `ulc_linz_training_registration_change`: aktuelle und append-only historische `note`-Einträge;
- `appbasis_training_documentation` und `appbasis_training_documentation_revision`: Notizen, JSON-Revisionsinhalte und fremde Teilnahmen;
- `appbasis_training_plan` / `appbasis_training_plan_revision`, `appbasis_training_block` / `appbasis_training_block_revision` sowie Usage `source_ref/note`: Freitext, Revisions-/Actorbezug, möglicherweise personenbezogene Parameter;
- `ulc_linz_training_trainer_attendance`, `ulc_linz_trainer_identity_audit`, `appbasis_permission_administration_audit`, `ulc_linz_security_event_log`, `ulc_linz_lifecycle_audit`: Trainer-/Actor-/Principal-Referenzen, erforderliche Sicherheitszwecke und Zugriffsfrist.

**Je Kandidat:** Bezug/Alter/Purpose privat prüfen; unnötige Personendetails durch den zuständigen Owner regelkonform entfernen/redigieren, ohne eine gemeinsame Session für andere Athleten blind zu zerstören. Historische Revisionen sind **eigenständige Restdaten**, nicht allein durch Änderung des aktuellen Felds bereinigt. Eine Ausnahme braucht Zweck, Rechtsgrundlage, erneutes Prüfdatum und Zugangsbeschränkung. Keine Regex-/Namensheuristik als verbindliche Personenidentifizierung; anonyme Aggregatzähler sind nur Suchhinweise.

**Technische Lücke:** Die vorhandenen read-only Zähler und isolierten PostgreSQL-Tests belegen Kandidaten- und Schutzpfade, **keinen** aktuell zugelassenen pauschalen Live-Freitext-/Audit-Redaktionsdienst. Wo eine sichere Besitzer-/Datensatzänderung noch fehlt: `STOP`, Einzelfall privat vormerken, gezielt ein enges Review-/Implementierungspaket autorisieren; keinesfalls direkt die App-Rolle per `DELETE` umgehen.

## 4. Personenlöschung über acht Owner

Die einzige derzeit zulässige technische Grundlage für einen späteren berechtigten Einzelfall ist der **nachweislich originale, noch gültige, konkret autorisierte Athleten-Quelllöschmarker** (35 Tage). Siehe [P05-ACHT-OWNER-UND-PROVIDER-FAKTEN](./P05-ACHT-OWNER-UND-PROVIDER-FAKTEN-20261122.md), GitHub-PRs #724, #726–#731 und [CURRENT-GATE](../../../CURRENT-GATE.md).

**Vorher:** exakte Verein-/Subject-/Markerzuordnung, kanonisch berechtigter Admin und aktueller SHA, aktueller SQL-Guard und erforderliche Rollen/Trigger, Fenced Writes und identische Quellenzeit geprüft. Kein gültiger Marker oder abgelaufene/unauflösbare Identität → `STOP`. Die vorhandene Operator-Umgebung und ihre Aktivierung sind **keine** stillschweigende Freigabe.

**Acht Owner getrennt abarbeiten und nachprüfen:**
1. `identity` – Principal, Login, Sessions, Rollen-/Identitätsverweise.
2. `permissions` – aktuelle Grants/Revoke und historische Administrationsaudits.
3. `athletes` – Athletenquelle, Kontakte, Gruppen und Löschmarker.
4. `exercise-catalog` – personengebundene Favoriten, Usage, Medienmetadaten/Provider.
5. `training-blocks` – Favoriten, Usage, Revisionen/indirekte Referenzen.
6. `training-documentation` – Doku, historische Revisionen, Fremdteilnahmen/Notizen.
7. `training-plans` – Pläne, Items/Revisionen, Personen- und Actorbezüge.
8. `ulc-linz-lifecycle` – Session, An-/Abmeldungen, Änderungshistorie, Trainerpräsenz, Audit/Notizen.

Die **vorhandene technische Vier-Owner-Operation** und die separaten geschützten weiteren Pfade sind kein atomarer Gesamt-Live-Vollzug. Unveränderte Nichtbetroffene, Nachbarvereine, gemeinsame Trainings und gesetzlich notwendige Auditbelege müssen geschützt bleiben.

**Nachher:** acht individuelle Owner-Nachkontrollen, aktuelle + historische Freitext-/Actor-/Auditreste, externe Medienobjekte und Kopien/Exporte separat beurteilen. Ergebnis `vollständig` nur bei vollständig belegtem Scope; andernfalls `partiell / STOP` mit Restaufträgen. Bei derzeit **0 Athleten** keine künstliche Produktivlöschung; erster echter berechtigter Fall ist eine neue individuelle Betriebskontrolle, kein rückwirkender T07-PASS.

## 5. Sicherungen / Restore / Löschrisiko

Das separate [T07-Sicherungsregister](./T07-SICHERUNGEN-EXPORTE-RESTORE-20261127.md) ist vor einem Vollabschluss abzugleichen. Aktiver EU-R2-Tagesbackup-Pfad mit 30 Tagen (T09 PASS) **deckt weder** alte Neon-Branches/Snapshots noch Downloads/Exporte oder interne Providerkopien ab. Ein Rest-Backup ist nicht gleich produktiv erreichbar, kann aber personenbezogene gelöschte Daten wiederherstellen.

**Absolute Sperre:** **KEINE Promotion eines älteren Restore-Kandidaten in produktive Writer/Ingress.** Allenfalls separat genehmigte writer-isolierte Quarantäne, neuerer unabhängiger autoritativer Löschbeleg, vollständiger Re-Deletion-/Fences-/ACL-/achtfacher Restnachweis und erneute Betreiberfreigabe. Bei Quellmarkerablauf ohne anderweitig genehmigte Autorität bleibt `STOP`, nicht `PASS`.

## 6. Private Nachweisvorlage für jeden berechtigten Fall (NICHT nach GitHub kopieren)

```text
Interne Fall-ID:                       [privat]
Anfrageeingang / Identitätsprüfung:    [privat]
Verantwortliche Funktion:              [privat]
Betroffener Zweck / Rechtsgrundlage:   [privat]
Fachliche Entscheidung + Ausnahmen:   [privat]
Originalmarker gültig bis:             [privat]
Freitext-/Actor-/Audit-Prüfung:        [privat]
Owner identity / permissions:          PASS / PARTIAL / STOP
Owner athletes / exercise-catalog:     PASS / PARTIAL / STOP
Owner training-blocks / documentation: PASS / PARTIAL / STOP
Owner training-plans / ulc-linz:       PASS / PARTIAL / STOP
Medien / Export / Backup-Horizont:     PASS / PARTIAL / STOP
Restkontrolle, Datum, verantwortliche Person:
Antwort an betroffene Person + Datum: [privat]
```

**Gate:** Verfahren als **Dokument-Entwurf PASS**, tatsächliche personenbezogene Betriebsausführung und rechtliche Zustimmung **OFFEN**. Kein Umschalten von `privacy`, `applicationLifecycle`, Modul-Lifecycles oder `legalApproval` durch diese Datei.
