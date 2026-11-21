# ULC Linz – P2/P3/P4: Live-Schema und konkrete Writer-Grenze (21.11.2026)

**Status: READ-ONLY-ISTAUFNAHME + isolierter SQL-Kandidat. KEINE Produktionsfreigabe und KEIN Deploy.**

Dieses Paket erweitert die vorhandene Arbeit aus [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607),
P1/P2 [#619](https://github.com/martinirrgeher-cloud/appbasis/pull/619), P3 und dem echten P2-51→69-Cutover.
Alle sechs vereinbarten Module bleiben im Zielumfang; alte Handy-PASS werden nicht wiederholt.
Weder neue Privacy-/Retention-Regeln noch ein neues Daten-Ledger werden eingeführt.

## 1. Unabhängig beobachteter Produktionsstand (nur Metadaten)

Neon-Projekt `appbasis-ulc-linz-production`, Default-Branch `production`,
logische Datenbank `neondb`. Am 21.11.2026 ausschließlich lesend über den verbundenen
Neon-Provider geprüft (keine Row-Values, keine E-Mail-Adressen, keine Keys, keine SQL-Writes):

- Datenregion: `aws-eu-central-1`. Neon-History `history_retention_seconds=21600` (6 Stunden);
  das ist **nicht** der gesamte Wiederherstellungshorizont inklusive Snapshots und EU-R2-Backups.
- Aktive öffentliche Tabellen: **69**. Die seit 20.11. dokumentierte 51→69-Migration ist
  in der *Struktur* sichtbar. Diese Zahl allein bestätigt weder Vollständigkeit
  noch aktuellen Worker-/Hyperdrive-Binding-Head.
- **Drei aktive** `ulc_linz_training_*_subject_fence`-Trigger auf Attendance,
  Registration und Registration-Change. Zusätzlich zwei aktive
  `appbasis_training_documentation_guard_*`-Trigger.
- `ulc_linz_training_subject_write_fence()` ist `SECURITY DEFINER`, keine
  PUBLIC-EXECUTE-Freigabe in der geprüften Funktions-ACL. Ihre tatsächliche Definition
  liest die **ULC-eigene** `ulc_linz_training_subject_deletion`, aber nicht
  `appbasis_athletes_deletion` und nicht die noch aktive Athletenstammdatenzeile.
- Die App-Rolle `ulc_linz_application` besitzt auf den geprüften Markertabellen
  des Katalogs, der Blöcke und der Dokumentation nur `SELECT`. Auf
  `ulc_linz_training_subject_deletion` ist keine App-Rollenerlaubnis aufgelistet.
  Dessen Schutzfunktion läuft als Eigentümerfunktion. Kein breiter neuer GRANT.
- Keine RLS-Tabellen in diesem Schema; daraus allein folgt **weder** ein Rechtefehler
  **noch** Sicherheitsreife: maßgeblich sind die tatsächlichen SQL-GRANTs,
  schreibenden Services und HTTP-/Identity-Grenzen.

## 2. Konkrete, bis heute offene Arbeit

| Schnitt | Bereits vorhanden | Tatsächliches NO-GO |
|---|---|---|
| **P2 Katalog** | Opt-in Favorite-/Usage-Fence, echte PostgreSQL-Tests; persönliche Marker in Production vorhanden | Aktive HTTP-Caller/Identitätszuordnung und Legacy-Writer nicht durchgehend kanonisch belegt; getrennte R2-Media-Restore-Probe fehlt |
| **P2 Blöcke** | Favoriten-/Usage-Owner, Restore-Helfer, Marker/Attribution in Production vorhanden | unzuordenbare Legacy-Notes/Usage, vollständiger Reconciliation- und Schreibschutz über alle Caller offen |
| **P3 Dokumentation** | SQL-Guard-Trigger aktiv, Besitzer-/historische Teilnehmer-Löschung und Testkontrollen vorhanden | tatsächliche produktive HTTP-Rollenprüfung, Freitext-/Drittpersonen- und Restore-Evidenz offen |
| **P3 App-owned Trainingsdaten** | drei aktive DB-Trigger und bestehender ULC-Marker; opt-in transaktionale Trainer-/Gruppen-/Rechte-Tests | 0017-Fence sieht Original-ATHLETES-Löschung nicht, solange der ULC-Marker noch fehlt; reale Actor-/Gruppen-Autorisierung vor Live-Aktivierung prüfen |
| **P4 Betrieb & Privacy** | 69er-Prod-Schema, 30-Tage EU-R2-Daily-Backup nach Freigabe, frühere Backups und isolierte Restore-Vorübungen | keine volle 8-Owner-/Medien-Wiederherstellung nach Löschung, Provider-/AVV- und D2-Fristenbeschluss offen; App- und Modulverträge weiter `blocked` |

## 3. Dieser isolierte technische Beitrag

Die nicht registrierte Datei
`apps/ulc-linz/proposals/p24-source-owner-training-fence.candidate.sql`
ersetzt in einer **wegwerfbaren lokalen Testdatenbank** ausschließlich die bestehende
`0017`-Schutzfunktion. Sie legt keine Tabelle an und führt keine personenbezogene
Löschmaßnahme aus. Erforderlich sind:

1. vorhandener **aktiver** kanonischer Athlet im selben Verein, gesperrt mit
   `FOR SHARE` vor dem ULC-Advisory-Lock (die kanonische Athletenlöschung sperrt
   ihn mit `FOR UPDATE`);
2. tatsächliche Sitzungs-/Organisationszuordnung;
3. **beide** Löschmarkerquellen unabhängig voneinander, danach unveränderte
   drei bestehenden Trigger und unveränderte Scope-/PUBLIC-EXECUTE-Schranken.

Das neue isolierte PostgreSQL-E2E
`tooling/ulc-linz-p2-p4-source-owner-fence.postgres.test.mjs` soll die aktuelle
0017-Quelle-Lücke reproduzieren, dann die Kandidatenfunktion installieren und
Direkt-SQL auf allen drei Owner-Tabellen, Updates, alte Quellenmarker,
ULC-Marker, fremde Sitzung und Nachbarpersonen negativ/positiv prüfen.
Die bestehende CI führt diesen Test gegen die ausschließlich lokale Wegwerf-DB aus.

## 4. Vor einer echten Aktivierung zwingend offen

- Die sichere Lock-Reihenfolge muss gegen **alle** kanonischen und externen
  Athleten-/Identity-Writer sowie Restore-Reconciliation, mögliche INSERT-Phantome
  und berechtigte Nachbearbeitung alter Trainingseinträge geprüft werden.
- Ein separater **neuer** versionierter Vorwärtsmigrationsplan ist erforderlich.
  Die veröffentlichte `0017`-Datei darf nicht rückwirkend geändert werden.
- Die noch offenen P1-Datenschutz-/AVV-Entscheidungen samt D2-Backuphorizont
  bleiben bestehen (35 Tage Quellautorität, danach deny). Kein stilles Verlängern.
- Test- und Produktiv-Runtime, Preview-/Produktions-DB, drei Trigger, App-Rollen,
  Datenschema und Produktiv-Contracts bleiben bis zu einem echten Go/No-go
  **unverändert**.
- Dieser PR ersetzt keinen vollständigen Test aller acht Datenowner.
  Die bestehenden Security-Drafts (insbesondere #656/#602) dürfen **nicht** blind
  zusammen gemergt oder in Produktion angewendet werden.

**Nicht durchgeführt:** kein produktives SQL, kein Cloudflare-/Neon-Write,
keine Löschung, kein Deployment, keine Vertragsfreigabe, kein Echtdatenstart.
