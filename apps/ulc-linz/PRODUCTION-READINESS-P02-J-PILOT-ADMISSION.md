# P02-J – Gebündelte Pilot-Legacy- und Medien-Risikoanalyse

**Stand:** 19.11.2026. **Status:** technischer Diagnose-Draft, keine Policy-/Produktiv-/Deploy-Freigabe.

## Tatsächlicher, aggregierter Neon-Preview-Befund

| Datenquelle | Anzahl | Konsequenz |
| --- | ---: | --- |
| Katalog Items / Favoriten | 5 / 1 | persönliche Favoriten sind getrennt von Stammübungen zu behandeln |
| Katalog Usage / Private-Media-SQL-Metadaten | 0 / 0 | aktuell kein Legacy-Katalog- oder Medien-SQL-Bestand; R2-Objekte sind separat |
| Trainingsblöcke / Usage | 2 / 3 | alte Usage-Events enthalten ggf. persönliche Quellreferenzen oder Notizen |
| explizit nachweisbar zugeordnetes Blocks-Usage | **0 / 3** | keine Zuordnung anhand von Textmustern oder Source-Ref erfinden |
| Trainingsdokumentation / Revisionen | 1 / 1 | Schutz für Drittpersonen und Revisionen weiterhin nötig |
| Anmeldung / Änderungsverlauf | 9 / 92 | alte Freitexte und Trainer-Referenzen gesondert behandeln |
| Preview-Schema | 66 Tabellen | drei Standardmodule und App weiterhin produktionsgesperrt |

Dies sind aggregierte Zahlen vom 19.11.2026, keine aktuelle Produktionsaufnahme und kein vollständiger Betroffenen-/Speicherinventar-Nachweis. Es wurden keine persönlichen Feldinhalte, Identitäten oder privaten Mediendateien gelesen.

## Neues technisches Gate

- Ein rein lesender Pilot-Inspector unter tooling/ulc-linz-p02-pilot-admission.mjs stellt Datenbankidentität, Migrationsrolle und 66 Tabellen fest. Er liest in **einer** REPEATABLE READ, READ ONLY-Transaktion 20 numerische Aggregate der betroffenen Katalog-, Block-, Doku- und Anmeldetabellen.
- Die Auswertung gibt nur Kategorien und Zähler aus, keine Datensatz-IDs, Namen, Texte oder Storage-Keys. Unklare Legacy-Usage wird niemals automatisch einer Person zugeordnet.
- Auch bei 0 personenbezogenen Zeilen ist der Status **blocked**, solange P01-Privacy, Medienanbieter-Nachweise, P02-Writer/Restore und D2-Löschautorität fehlen.
- Unabhängige Node-Regressionsfälle und ein bewusst ausschließlich manueller GitHub-Preview-Inspect-Workflow. Keine Apply-Option, keine Löschung, kein Restore, keine Rollenänderung, kein Deployment.

## Nächste gebündelte P2-Implementierung

1. **Katalog und Blöcke:** bestehende Guard- und Attribution-Methoden tatsächlich mit authentischen Athleten-/Plan-Owner- und transaktionalen Sperren verknüpfen; den weiterhin aktiven Legacy-Block-Usage-Weg erst nach realen Parallel-/Rollen-/Restore-E2E abstellen. Vorhandene real-PG-Tests wiederverwenden.
2. **Mediendateien:** schon bestehende Provider-Delete/GET-Verifikation beibehalten, jedoch den alternativen direkten SQL-Abschluss ohne gesicherte Provider-Abwesenheit schließen; R2-Inventar und Medienbackup getrennt prüfen.
3. **Dokumentation und App-Historien:** neue und alte Personenreferenzen, Drittteilnehmer/Notizen und Revisionsketten in einem isolierten Cross-Owner-E2E abnehmen. Kein stiller Merge von #602/#656.
4. **Produktivstart:** nach P01-Rechts-/AVV-/D2-Entscheidung und echter P2/P3-Verifizierung alle sechs bestehenden Module gemeinsam über Production-Contract und M6 in einen privaten Pilot bringen.

**Pragmatische Alternative für die aktuellen Testdaten:** Die spätere echte Produktionsdatenbank kann, nach ausdrücklicher Freigabe, **ohne Import alter Preview-Test-Usage/Notizen** initialisiert werden. Die drei ungeklärten Block-Events müssen dann nicht mittels unsicherer Heuristiken historischen Personen zugeschrieben werden. Der Vorschlag autorisiert **weder Löschen der Preview noch Überschreiben/Entsorgen bestehender Backups**; sichere künftige Write-/Erasure-/Restore-Prozesse sind trotzdem Pflicht.

**Grenze:** P02-J ist Diagnose/Entwicklungsvorbereitung, keine produktive Freigabe. Alle alten Handy-PASS bleiben unangetastet. Kein neuer Runtime-Flag und keine Aktivierung von Retention- oder Löschjobs.
