# ULC Linz – echter Erstbestand vor Go-live: eine gebündelte Lesekontrolle

**21.11.2026 · kein Production-Write, kein Deploy, kein Login-/Rollen-Reset.**

## Tatsächlich beobachteter Stand

Die untenstehenden **aggregierten Zählwerte** wurden ausschließlich über
read-only SQL am Neon-Produktionsprojekt `appbasis-ulc-linz-production`,
Default-Branch `production`, logische Datenbank `neondb` ermittelt:

| Voraussetzung | Aktuell |
|---|---:|
| Tabellen | 69 |
| aktive Trainings-Subject-Schutztrigger | 3 |
| aktive Dokumentations-Schutztrigger | 2 |
| technischer Admin-Account `ulc.production.admin` (nicht gesperrt) | **1** |
| ULC-aktive Admin-Mitgliedschaften (eigene ULC-Rolle) | 0 |
| aktive Gruppen | 0 |
| aktive Trainer | 0 |
| aktive Athleten | 0 |
| Trainer-Gruppen-Zuordnungen | 0 |
| ULC-aktive Trainer-Logins | 1 |
| mögliche aktuelle Trainer-Schreibzugänge (zusammengefasste Vorbedingungen) | 0 |
| Trainingseinheiten | 0 |
| Übungen | 0 |
| Trainingsblöcke | 0 |
| private Übungsvideo-Metadaten | 0 |

**Wichtig:** Der technische Admin existiert bereits – **M5 Admin Bootstrap nicht
nochmals starten**. Der getrennte ULC-`admin`-Mitgliedschaftszähler sagt
nichts über die Existenz des technischen Admin-Accounts aus. Der bestehende
Trainer-Login verfügt aktuell nicht über die notwendigen aktiven
Trainer-/Gruppen-/Schreibrechte; vorhandene explizite Revokes dürfen nicht
stillschweigend entfernt werden.

## Das neue Ein-Klick-Instrument

`.github/workflows/ulc-linz-production-onboarding-preflight.yml`

- Manuell auf `main`, GitHub Environment `ulc-linz-k2-backup`.
- Nutzt **bestehendes** R2-K2-Backup-Environment, aber nur das
  `APPBASIS_ULC_SOURCE_DATABASE_URL`-Secret und den erwarteten DB-Namen
  `neondb`; kein neuer Schlüssel notwendig.
- Der bestehende `ulc-linz-k2-backup-plan.mjs source`-Validator prüft
  den zulässigen Neon-Quell-DB-Namen und TLS.
- PostgreSQL Session erzwingt `default_transaction_read_only=on`;
  zehnsekündiges Statement-Limit, zweisekündiges Lock-Limit.
- Genau ein festes `SELECT jsonb_build_object(...)` liest ausschließlich
  Zählwerte, Trigger und begrenzte Existenzbedingungen. Keine Namen, Mails,
  IDs, Notizen oder private Inhalte werden in GitHub-Logs ausgegeben.
- Auswertung meldet `ONBOARDING_BLOCKED` und die **konkreten fehlenden
  Voraussetzungen**, alternativ
  `ONBOARDING_BASELINE_PRESENT_REVIEW_REQUIRED`, niemals eigenständig GO.
- Ein grüner Workflow bedeutet nur *lesende Prüfung ausgeführt*, **nicht**
  `productionReady`. Der Report enthält nie Logindaten oder Secretwerte.
- Reine Unit-/Contract-Tests im normalen CI. Keine nächtlichen zusätzlichen
  Provider- oder wiederholten CI-Aufrufe.

## Feste Freigabegrenzen

- Ausreichende Stamm-/Rollendaten sind nur Vorbedingungen. Die technischen
  Administratoren, ULC-Quellmitgliedschaften und Trainerrollen sind getrennt.
- Ein positiver Trainer-Kandidat garantiert noch keinen wirklichen
  U12-/U14-/Kindertraining-Smoke; die aktuelle transaktionale Berechtigung
  muss am echten privaten Worker mit berechtigtem Testzugang geprüft werden.
- Keine Übernahme von Preview-Testdaten ohne dokumentierten fachlichen
  Entscheid. Keine automatischen Rollen-Grants oder Revoke-Entfernung.
- Private Medien: derzeit 0 Metadaten, aber **kein** live bestätigtes
  R2-Objektinventar. Video-Upload/Medienfreigabe bleibt separat; der
  private Produktions-Worker hat aktuell `exerciseCatalogMediaStore:null`.
- Offene unabhängige Nachweise: P2–P4 Security-Draft #692,
  produktionsspezifische Datenschutz-/Löschfreigaben, Media-R2,
  echte Rollen-/App-Smokes sowie Recovery-/Worker-Isolation.
- **Dieser PR** führt weder DML, Datenimport, Cloudflare-Änderung,
  Autorisierungs-/Migrations-Update, Secret-Schreibzugriff,
  öffentliches Ingress noch produktives Deployment aus.

## Operativer nächster sinnvoller Schritt

1. Technischen Admin-Account **wiederverwenden**, keine Duplikatanlage.
2. Im regulären, autorisierten Stammdatenpfad gewünschte **echten**
   Trainingsgruppen, Trainer, Athleten und Gruppenzuordnungen entscheiden und
   anlegen; nie Testdaten ungefragt kopieren.
3. Tatsächlich benötigte Edit-Capabilities der Trainer-Rolle und individuelle
   Revokes **gezielt durch befugte Administration** überprüfen; keine
   pauschalen Grants.
4. Erneut einmal den obigen Leseworkflow ausführen, dann je ein
   Berechtigungs-/Speicher-Smoke für Kindertraining, U12, U14.
5. Erst nach Backup-, Lösch-, Medien-, M5-/M6-Gates den Echtbetrieb separat
   freigeben.

Der Report strukturiert die **fachlich noch fehlenden Daten**, ersetzt
keine rechtliche Entscheidung oder reale Betriebsfreigabe.
