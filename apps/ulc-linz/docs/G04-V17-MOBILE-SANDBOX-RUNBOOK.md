# G-04.6 – isolierte Kalender-Testpreview für den Handytest

**Stand 08.11.2026:** Neon-Sandbox mit v17 erstellt und überprüft. **Ein öffentlich erreichbarer Test-Worker wurde noch nicht deployed.** Der bestehende Preview-Worker und Produktion bleiben unberührt.

## 1. Vom Betreiber autorisierter isolierter Zustand

Der Betreiber hat G-04.6 nach dem G-04.5-Merge ausdrücklich zum Start freigegeben. Die v17-Kandidatenmigration wurde **ausschließlich** auf dem neu angelegten Nicht-Default-Neon-Branch angewandt. Dafür wurden der Branch, dessen eigener Endpoint und der vollständige v16-Quellstand vor dem transaktionalen DDL-Lauf überprüft.

| Identität | Bestehende Preview (unverändert) | Kalender-Test-Sandbox |
| --- | --- | --- |
| Neon-Projekt | `cool-unit-46141580` | dasselbe Projekt, anderer Branch |
| Branch-ID | `br-delicate-surf-b1eu6ikn` | `br-falling-hat-b1lmifga` |
| Default / Primary | **ja** | **nein** |
| Direkter Endpoint | `ep-green-resonance-b19c78rm` | `ep-empty-frog-b187iuwz` |
| DB-Name | `appbasis_ulc_linz_preview` | geklonte DB mit gleichem Namen, aber eigener Branch-Origin |
| Öffentliche Tabellen | **60** | **62** |
| Kalenderregel / -Ausnahme | nicht installiert | beide installiert |
| Kalender-Trigger und Guard | nicht installiert | aktiv |
| Öffentliches EXECUTE auf Guard | nein | **nein** |
| Testgruppen / Sessions / Anmeldungen | 4 / 14 / 9 | 4 / 14 / 9 |

Der SQL-Lauf bestand aus genau den fünf kontrollierten Statements der unveränderten Kandidatenmigration `0016_ulc_linz_registration_calendar.sql`, in **einer einzigen Transaktion**, ohne `DROP`, `DELETE` oder bestehende Registrierungsdaten zu verändern. Anschließend wurden Quelle und Sandbox getrennt lesend geprüft.

**Wichtig:** Dieser Neon-Branch entstand durch Kopie der vorhandenen Preview mit **vorhandenen Testkonten und Testdaten**. Er ist nicht leer und nicht automatisch anonymisiert; es wurde kein Echtdaten-freier Benutzerbestand bewiesen. Deshalb **vor einer externen Freigabe erst Testkonto-/Account-Isolation und Zugriffskonzept verifizieren**. Das Ergebnis ist kein Nachweis eines unabhängigen `pg_dump`/Restore für die Hauptpreview.

## 2. Sandbox-Rollen – sicherer Vorbereitungszustand

Im **Sandbox-Branch allein** wurden zwei eigene Rollen angelegt, zunächst **NOLOGIN**, ohne Superuser-, CREATEROLE-, CREATEDB- oder BYPASSRLS-Rechte:

- `appbasis_ulc_g046_application`: erbt nur die bisherigen Anwendungsrechte; auf beiden neuen Kalendertabellen **SELECT/INSERT/UPDATE**, kein eigenständiges Kalender-DELETE und kein SELECT auf dem Sicherheitslog.
- `appbasis_ulc_g046_security_log`: erbt nur die bisherigen Sicherheitslog-Rechte; **keinerlei Kalender-Tabellenrechte**.

Die vorhandene Preview-Anwendungsrolle bekam die notwendigen drei DML-Berechtigungen auf den beiden neuen Tabellen **ausschließlich in der separaten Sandbox**; davon erbt die neue isolierte App-Rolle. Bei der Überprüfung waren beide neuen Logins deaktiviert und die jeweiligen Privilegien korrekt.

**Operator noch erforderlich:** Die beiden NOLOGIN-Rollen **nur auf dem Sandbox-Branch** mit separat generierten, geheim gehaltenen Passwörtern zur Anmeldung freigeben und vorher die Rollenzuordnungen nochmals prüfen. **Niemals** die vorhandenen Preview-Passwörter zurücksetzen, eine produktive Rollenänderung durchführen oder Credentials in PR/Logs/Chat eintragen. Der Sandbox-Zugriff muss im Secret Store dokumentiert und später widerrufbar sein.

## 3. Separater Cloudflare-Test-Worker

Neuer Worker-Name (nicht der aktive ULC-Preview-Worker): **`appbasis-ulc-linz-g04-sandbox`**.

Vorgesehene Testadresse nach tatsächlichem Deployment: `https://appbasis-ulc-linz-g04-sandbox.<cloudflare-subdomain>.workers.dev`. Die Subdomain wird vom Operator erst beim erfolgreichen Deploy ermittelt; **diese URL ist derzeit kein funktionierender Testlink**.

Der separate G04.6-Entrypoint `worker/preview-g04-sandbox.ts` liefert bei fehlender Sandbox-Konfiguration **503** statt auf andere Datenbanken oder Worker zurückzufallen. Für die aktive v17-Funktion verlangt er explizit die Sandbox-Branch-ID, die richtige Worker-Origin, beide Hyperdrive-Bindings, einen eigenen Auth-Secret-Key und die bestehenden zweistufigen Kalender-Feature-Flags.

Die Hyperdrive-Konfiguration wird **vor einem Deploy** über die Cloudflare-Provider-API gegen exakt den oben gepinnten direkten Neon-Sandbox-Host sowie die beiden eigenen Rollennamen überprüft. Eigene Hyperdrive-Namen:

- `appbasis-ulc-linz-g046-sandbox-application`
- `appbasis-ulc-linz-g046-sandbox-security-log`

Die ursprünglichen Preview-/Produktions-Hyperdrives dürfen weder überschrieben noch an den Sandbox-Worker gebunden werden. Die Funktion zum Anlegen erzeugt **nur** diese beiden getrennten Provider-Objekte und versöhnt keine bestehenden Objekte mit anderer Zielkonfiguration.

### GitHub: isolierte Umgebung und manuell ausgelöster Workflow

Nach PR-Review/Merge eine eigenständige GitHub-Actions-Umgebung `ulc-g04-6-calendar-sandbox` mit eingeschränkter Operatorfreigabe und den erforderlichen getrennten Secrets einrichten. **Keine** Geheimnisse aus der alten `generated-preview-ulc-linz`-Umgebung wiederverwenden.

| Secret in der eigenen GitHub-Umgebung | Bedeutung |
| --- | --- |
| `APPBASIS_G046_APP_DATABASE_URL` | direkte Neon-Sandbox-URL der neuen App-Rolle |
| `APPBASIS_G046_SECURITY_DATABASE_URL` | direkte Neon-Sandbox-URL der neuen Security-Rolle |
| `APPBASIS_G046_BETTER_AUTH_SECRET` | neu generierter, mindestens 32-stelliger Test-Auth-Secret |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare-Konto, nur für ausdrücklich autorisierte Sandbox-Operationen |
| `CLOUDFLARE_API_TOKEN` | minimal notwendiger Cloudflare-Zugang, getrennt und zeitlich begrenzt |

`.github/workflows/ulc-linz-g04-6-sandbox.yml` ist **ausschließlich `workflow_dispatch`**, ohne automatische Trigger. Erlaubte Operationen:

1. **`inspect`**: Nur Credential- und Sandbox-Schema-/Rollenprüfung, kein Cloudflare-Write.
2. **`provision`**: Die zwei dedizierten Hyperdrives werden nach eindeutiger Operatorfreigabe `apply=true`, Phrase `G04-6-SANDBOX` erstellt oder mit dem exakt erwarteten bestehenden Zustand verglichen. **Kein Worker-Deploy.**
3. **`deploy`**: Erst mit **separater** Operatorfreigabe `apply=true`, `G04-6-SANDBOX`, bereits korrekt konfigurierten Hyperdrives und genau überprüften App-/Security-Datenbankzugängen. Dann eigener Worker, eigener BetterAuth-Secret, exakter Git-SHA-Smoke-Test, anonyme Kalender-API muss abweisen.

**Fail-closed:** Andere Branches als GitHub `main` werden abgelehnt. Der Workflow verweist auf eine eigene GitHub-Umgebung und separate Cloudflare Worker/Hyperdrive-Namen. Fehlen Secrets, Provider-Zuordnung oder Login-Rechte, wird vor dem Deploy abgebrochen. Ein fehlgeschlagener Deploy berechtigt nicht zum Umschalten der bestehenden Preview.

## 4. Handytest nach erfolgreichem separatem Deploy

Testanmeldung nur mit ausdrücklich vorgesehenen **Testaccounts**. Auf dem Handy:

1. **Stammdaten → Gruppen → aktive Gruppe mit Selbstanmeldung → Kalender:** gewünschte Trainingstage auswählen und Vorlauf/Frist anpassen.
2. **Anmeldung → Wochenübersicht:** nur zulässige Trainingswochentage öffnen; abgelaufene Anmeldefristen und erlaubte verspätete Anmeldung prüfen.
3. **Sondertermine:** Zusatztraining, Absage und Zurücksetzen mit Revision prüfen. Im zweiten Browser-Tab eine veraltete Änderung auslösen und die Konfliktmeldung kontrollieren.
4. **Regression:** U12/U14/Kindertraining-Anwesenheit, Training-Dokumentation, Rücknavigation und das Autosave-Verhalten unverändert.

Dabei **keine** aktiven Trainings- oder Personendatensätze der alten Preview ändern. Die getrennte Sandbox bleibt bis zur eindeutigen positiven Abnahme eine Testinstallation.

## 5. Grenzen und Freigaben

- G-04.6 ist **keine** Migration der bisherigen Preview, **keine** Datenverantwortlichenentscheidung und **kein** Produktionsrelease.
- Das weiterhin ausstehende originale `pg_dump`/`pg_restore`-Artefakt für G-04.5 und das v17-Datenschutz-/Export-/Aufbewahrungs-Evidence-Ledger werden **nicht** stillschweigend als erfüllt eingetragen.
- Ohne eigene GitHub-Environment-Secrets, Zwei-Rollen-Login-Freigabe, test-only Zugriffskonzept, separaten Provider-Preflight und Freigabe zum **konkreten Sandbox-Deploy** ist ein Handytest **noch nicht verfügbar**.
- Der Sandbox-Branch enthält geklonte Testkonten und muss vor einer Veröffentlichung gegen unbeabsichtigten Zugriff und gegen die bisherige Preview strikt isoliert sein.
