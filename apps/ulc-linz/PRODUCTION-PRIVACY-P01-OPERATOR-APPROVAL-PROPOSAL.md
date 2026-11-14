# P01 – Konkreter Entscheidungsvorschlag für die Vereinsfreigabe

**Datum:** 14.11.2026 · **Status: VORSCHLAG / NICHT GENEHMIGT / KEINE RUNTIME-WIRKUNG**

Zweck: Ein einziges, vollständig prüfbares Entscheidungsgespräch mit dem zuständigen Vereinsverantwortlichen, bevor produktive Aufbewahrungs-, Lösch-, Rollen- oder Wiederherstellungsfunktionen aktiviert werden.

**Basis:** [P01-Bestandsentwurf](./PRODUCTION-PRIVACY-DECISIONS-P01-DRAFT.md), [P01-Entscheidungsblatt](./PRODUCTION-PRIVACY-P01-DECISION-PACK.md), [v16 Schema-Inventar](./PRODUCTION-READINESS-P01-SCHEMA-COVERAGE.md), [P04-A-Gates](./PRODUCTION-READINESS-P04-A-GATES.md). Ein Schema-genauer Entwurf der **13 Gruppen für alle 64 Tabellen** liegt unter `privacy/p01-operator-retention-candidate.json` und wird mit `test/p01-operator-retention-candidate.test.ts` überprüft. Die JSON-Datei wird von keiner Runtime importiert und setzt keine Frist in Kraft.

## 1. Empfehlung: Datennutzung und Aufbewahrung – ausdrücklich zweckabhängig

| Kategorie | Vorgeschlagene Vereinsentscheidung | Prüfung und Vorbehalt |
| --- | --- | --- |
| Athleten, Elternkontakte, Trainer, Mitgliedschaft, Login und Rechte | Nur während der tatsächlichen Vereins-/Organisationsnutzung; **bis zu 12 Monate nach Austritt/Deaktivierung** nur, soweit ein dokumentierter weiterer Verwaltungszweck besteht. Aktive Sitzungen deutlich kürzer entsprechend Sicherheitsbedarf. | Keine pauschale zwölfmonatige Nachspeicherung. Bei Ende jedes Zwecks und ohne besondere Pflicht früher löschen; bereits bestehende Technik ist kein Rechtsgrund. |
| Anwesenheit, persönliche Anmeldungen, Änderungsverläufe, Trainerpräsenz | **Vorschlag bis zu 24 Monate ab Trainingstag**, um zwei Saisonen Vereinsorganisation und Vergleichsstatistik zu ermöglichen. Danach identifizierbare Zeilen entfernen, echte anonymisierte Zusammenfassungen können bei gültigem Zweck bleiben. | Der Verein muss den Zwei-Saisonen-Bedarf ausdrücklich bestätigen. Kein automatisches Ausschließen eines berechtigten früheren Löschbegehrens. Trainervergütung, Fördermittel oder Buchhaltung bei Bedarf **gesondert** dokumentieren. |
| Persönliche Trainingstermin-/Anmeldenotizen | **Nach 90 Tagen eine Lösch-/Review-Regel**, falls nicht mehr notwendig; ausdrücklich auch die historischen, append-only Änderungsnotizen und JSON-/Trainingsinhaltstitel. Keine Gesundheits-/Diagnoseangaben oder sensiblen persönlichen Details ohne eigenen geprüften Zweck. | Physisch sichere Redaktion auch aller älteren Revisionen nötig, bloßes Leeren aktueller Felder genügt nicht. Freitext darf andere Personen nicht unbemerkt enthalten. |
| Persönliche Plan-/Block-/Dokudaten und Revisionsketten | Personenbezüge **vorgeschlagen bis 24 Monate ab zugeordnetem Trainingsdatum**; fachliche nicht-personenbezogene Vorlagen nach ihrem eigenständigen Zweck, ohne künstliche Personenzuordnung. | Historische Fremdteilnehmer und Trainer-/Actor-Verweise müssen geprüft/redigiert werden, ohne Daten unbeteiligter Athleten blind zu löschen. |
| Übungs-/Blockfavoriten und persönliche Usage | Favoriten entfernen, wenn Konto/Zweck endet oder berechtigtes Löschbegehren vorliegt. Usage **vorgeschlagen höchstens 12 Monate** für konkret begründeten Statistikzweck. | Uneindeutige historische `source_ref`/`note`-Texte als potentiell persönlich einstufen, beschränkt zugänglich halten; kein nachträgliches Owner-Raten. |
| Sicherheits-, Rechte- und Trainer-Audit | Bestehenden technischen **12-Monats-Rahmen nur bei dokumentierter Notwendigkeit** übernehmen; Rechte zur Einsicht auf zuständige Funktion beschränken. | Auditdaten nicht als pauschal unbegrenzte Trainingshistorie weiterführen. |
| Allgemeine Gruppen-/Übungs-/Katalogkategorien | Keine pauschale personenbezogene Löschfrist, soweit nachweislich personenneutrale Fachvorlagen. | Labels, Videolinks, JSON-/Freitext und Ändereridentitäten können trotzdem persönlich sein; prüfen. |
| Private Medien, besonders Minderjährige | **Bis Provider-/AVV-/Rechtsgrundlage-/Zugriffs-/Löschbeleg vorliegt: keine neuen erkennbar personenbezogenen privaten Medien im Echtbetrieb.** | Alle tatsächlich vorhandenen Dateien physisch beim Storageanbieter löschen; erst nach Providerbestätigung SQL-Status abschließen. |
| Löschentscheidungs-/Reconciliation-Marker | **Unverändert 35 Tage, danach kein Retry**; keine automatische Verlängerung oder neue dauerhafte personenbezogene Tabelle. | Variante A nur mit belegter rechtzeitiger vollständiger Owner-Bearbeitung und maximalem Backup-/Export-Horizont; ansonsten Variante B **nur** als eigener minimierter, genehmigter neuer Entwurf. |
| Backups/Restores | Quarantäne und Write-Freeze, vollständigerer neuerer Löschbeleg aller **8 Owner**, Re-Deletion, Restdatenkontrolle und ausdrückliche Betreiberfreigabe vor Wiederanbindung. | Neon-6h-History ist **kein** Gesamt-Backup-Nachweis; tatsächliche Snapshots, externe Exporte und Verarbeiter prüfen. |

**Keine rechtlich vorgeschriebenen Pauschalfristen:** Die österreichische Datenschutzbehörde erläutert, dass ein Verein – sofern keine spezifische Aufbewahrungspflicht gilt – die notwendige Speicherfrist zweckbezogen selbst bestimmt. Auch bereits vorliegende zwölfmonatige Implementierungen sind daher zu begründen. Für Rechnungs-, Steuer-, Förder- und konkrete Rechtsnachweise können separate Aufbewahrungsregeln gelten; **nicht** alle Trainingsdaten deswegen länger speichern.

Rechts-/Praxisquellen: [Österreichische Datenschutzbehörde – DSGVO-Leitfaden](https://dsb.gv.at/sites/site0344/media/downloads/dsgvo_leitfaden_2022.pdf), [EU-Kommission – Speicherbegrenzung](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en), [DSGVO Art. 5, 6, 13, 17, 30](https://eur-lex.europa.eu/eli/reg/2016/679/oj). **Kein Ersatz für die Vereins-Datenschutzprüfung.**

## 2. D1–D4 – konkrete empfohlene Betreiberoption

- **D1 – Historische Usage-/Freitextdaten:** **Ja** zu beschränktem Zugriff, manueller Prüfung und Löschung nach nachgewiesener Berechtigung. **Nein** zu ungeprüfter Anonymitätsbehauptung oder automatischer Zuordnung anhand von Textheuristiken. Neue unnötige Personenidentifikatoren in Usage-Notizen vermeiden.
- **D2 – Backup-/Löschbeleg:** Vorläufig **35 Tage / danach deny** beibehalten. Die bestehende Variante A darf nur dann für Live-Erasure/Restore gewählt werden, wenn wirkliche maximale Backup-/Export-Horizonte und sämtliche Owner-Abschlüsse innerhalb der Quellenfrist vollständig nachgewiesen sind. Falls das nicht realistisch ist, **B bevorzugen**, aber nur nach gesonderter Abnahme des minimalen Datenumfangs, Zwecks, der neuen Frist und atomaren Herkunft. **Keine Entscheidung über B-Frist ohne Fakten.**
- **D3 – Private Medien:** **Ja** zum echten Provider-Delete vor Metadatenabschluss; neue erkennbare Medien von Minderjährigen vor Provider-/Rechts- und Löschbeleg **gesperrt**.
- **D4 – Wiederherstellung:** **Ja** zu isoliertem Restore, neueren vollständigen Löschbelegen, Re-Deletion aller Owner und expliziter Betreiber-/Sicherheitsfreigabe; sonst **kein Restore-Promotion**.

## 3. Ein einziger fachlicher Entscheid – aber keine fingierten Belege

**Verantwortung:** Der Nutzer hat am 14.11.2026 erklärt, er könne den Vereinsbeschluss selbst freigeben. **Dies ist ausdrücklich nur eine Zuständigkeitserklärung; keine Genehmigung dieser noch nicht konkret vorgelegten P01-Optionen.** Kein Name, Datum einer Unterschrift oder Vereinsfunktion wird ohne separate Angabe als bestätigt eingetragen.

Die nachfolgenden Daten bleiben bis zur tatsächlich dokumentierten Prüfung **offen**:

- [ ] Verein/zeichnungsberechtigte Funktion und **ausdrückliche** Entscheidung zu Tabelle 1/D1–D4, gegebenenfalls abweichende Fristen;
- [ ] konkrete rechtliche Grundlagen/Zwecke je Datenart (Mitgliedschaft, Nichtmitglieder/Eltern, Kinder, Trainer, Statistik, Audit, Fotos), Betroffeneninformation, Auskunfts-/Löschkontakt;
- [ ] wirtschaftlicher/organisatorischer Bedarf für zwei personenbezogene Trainingsjahre und getrennte rechtlich nötige Förder-/Buchhaltungsbelege;
- [ ] tatsächlich identifizierter Cloudflare-Worker↔Neon-Zugang sowie Cloudflare-/Neon-AVV, Speicherregion, verschlüsselte Backups, Subprozessoren, Zugriffsrechte;
- [ ] maximale Wiederherstellung älterer Snapshots und extern exportierter Kopien; D2 A/B und gegebenenfalls getrennt genehmigte Nachweis-Retention;
- [ ] echte private Medienspeicherung und Objekt-Delete, Kinderbilder, Rollen, getrennte Pilotgruppe und Wiederherstellungs-Verantwortlicher;
- [ ] eigenständige Freigaben später für produktive Guard-Migration, Rechte, Retention, M6-Workflow/Deployment und echten Pilot.

**Zulässiges nächstes Technikpaket ohne diese Inputs:** Aus dieser Matrix einen isolierten, testgetriebenen *Security-Implementierungs-Draft* entwickeln und die Vollständigkeit der Owner-/Freitext-/Restore-Prüfung weiter beweisen; **nicht** auf Live-Worker oder produktive DB/Policies übertragen.

**Status:** `NOT_APPROVED`, `privacy=blocked`, `applicationLifecycle=blocked`. Keine Datenbearbeitung, kein Merge dieses Dokuments automatisch gleichbedeutend mit Vereinsfreigabe.
