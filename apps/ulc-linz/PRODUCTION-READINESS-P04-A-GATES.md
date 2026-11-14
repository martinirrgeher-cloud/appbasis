# P04-A – Geschützter Produktivpilot: Release- und Betriebs-Gates

**Stand:** 14.11.2026 · **Status: READ-ONLY / ENTWURF / NICHT FREIGEGEBEN.**
Basis: `main=da9e61548c33d37a9f234cc5aaf566f9048384cc`. [Sprint #607](https://github.com/martinirrgeher-cloud/appbasis/issues/607), [Übergabe #530](https://github.com/martinirrgeher-cloud/appbasis/issues/530), [P00](./PRODUCTION-READINESS-P00.md). Diese Datei löst **keinen** Workflow aus, aktiviert keine Berechtigung und ersetzt kein Datenschutz- oder Sicherheitsgutachten.

## 1. Umfang und unveränderte Ausgangslage

Das bestehende `apps/ulc-linz/appbasis.production.json` bindet genau **sechs Standardmodule**:

| Owner / Modul | Production-Contract im Repo | Offener Go-live-Nachweis |
| --- | --- | --- |
| Countdown | `ready` | App-/Identitäts-/Release-Integration noch nicht als Gesamtapp abgenommen |
| Athleten/Stammdaten | `ready` | App-weite Abhängigkeiten, Privacy- und Restore-Koordination |
| Trainingsplanung | `ready` | Cross-Owner-Pläne, Usage und Subject-Löschung |
| Übungskatalog | `blocked` | persönliche Favoriten, Usage, externe Mediendateien, Retention |
| Trainingsblöcke | `blocked` | Revisionen, Legacy-Notizen, Favoriten/Usage, Restore |
| Trainingsdokumentation | `blocked` | Autorisierung, Datenbank, Lifecycle-Evidence |

**Zusätzlich, nicht als Siebent-Modul wegdefinieren:** ULC-eigene Selbstanmeldung, U12/U14/Kindertraining, Anwesenheit, Trainerhistorie, Zugriffs- und Security-Audit. Gesamte App `status=blocked`, `applicationLifecycle=blocked`, `privacy=blocked`, `dataExport=verified`. Das ist ein **Repository-Contract-Befund**, kein Nachweis darüber, was heute in einem deployed Worker tatsächlich aktiv ist.

## 2. Konkrete Go-/No-go-Matrix

| Gate | Muss vor geschütztem Echtdatenpilot belegt sein | Iststand / Entscheidung |
| --- | --- | --- |
| **G01 – Fachlicher Datenschutz** | schriftliche P01-Entscheidung zu Zweck/Rechtsgrundlage/Kinderdaten/Fristen, D1–D4, Rollen und Freitext; Freigabedatum, Verantwortlicher | **BLOCKED** – [P01-Draft #616](https://github.com/martinirrgeher-cloud/appbasis/pull/616), keine rechtswirksame Entscheidung |
| **G02 – Schreib- und Löschschutz** | Kein Wiederanlegen gelöschter Subjects in allen ULC-/Standardowner-Writern, auch per alten Clients, Direkt-SQL, Proxy, parallelem Entzug und Restore; wirklich autorisierter Ablauf | **BLOCKED** – P03-C belegt Rebirth, [P03-D/E-Test-Draft #615](https://github.com/martinirrgeher-cloud/appbasis/pull/615) ist nur temporärer Trigger-Prototyp |
| **G03 – Datenschema/Inventar** | 41 kanonische Migrationen, 64 Tabellen, persönliche Freitextfelder und Traineranwesenheit klassifiziert **und** echte Deploymentversionen unabhängig bestätigt | **TEILNACHWEIS** – P01 41/64 Repository-Mapping; Live-Schema-/Providerbindung offen |
| **G04 – Provider/Datenregion** | gebundene Cloudflare-Worker↔Neon-Verbindung und tatsächlich produktive Region; AVV/DPA, Subprozessoren, Verschlüsselung und Rechte frisch verifiziert | **BLOCKED** – Neon-API-Projekt `appbasis-ulc-linz-production` meldet `aws-eu-central-1`, aber nicht die Live-Workerbindung. Providerinventory markiert Appbelege `open` |
| **G05 – Backup/Restore** | max. Restorehorizont inkl. separater Snapshots/Exporte, isolierte Quarantäne, vollständiger newer-than-backup Löschnachweis über alle 8 Owner, Re-Deletion vor Release, dokumentierter Wiederanlauf | **BLOCKED** – Neon-Metadaten 6h `history_retention_seconds`, aber kein Beleg zur Gesamtheit aller Backups; Default-Branch als `archived` / `protected=false` gemeldet |
| **G06 – Security/Betrieb** | geprüfte Rollen, personenbezogene Administratoren, Audit-Zugriff und -Purge, Monitoring/Alarmierung, least privilege, Rollback bei fehlgeschlagenen Writes, mobil relevante Regressionstests | **BLOCKED** – N16/Staff-Guards nur mit gesonderter Freigabe; keine blanket-Freigabe aus früheren UI-PASS |
| **G07 – Release Evidence** | für alle 6 Module + App aktueller `production-contract --require-ready` mit exakt passender SHA, alle dafür vorgesehenen E2E, getesteter Restore und separater Betreiberfreigabe | **BLOCKED** – mehrere Module und App bewusst `blocked`; Checksums und CI ersetzen keine Sicherheitsbeweise |
| **G08 – Pilotbetrieb** | wenige namentlich autorisierte echte Nutzer, getrennte Produktionsdaten und Rechte, Betreiber-/Notfallkontakte, Auskunft/Löschung und Stop-/Rollback-Regeln, finaler mobiler Smoke | **BLOCKED** – erst nach G01–G07 und expliziter Aktivierung |

**G01 und G02 sind hart vorgelagert.** Einen möglichen kurzen technischen Pilot für einzelne Module an G01/G02 vorbei zu starten wäre keine Verbesserung. Ziel bleibt **die ganze bestehende App**.

## 3. Kanonischer M6-Workflow: ein Schritt pro ausdrücklicher Freigabe

Die geöffnete Datei `.github/workflows/m6-ulc-production-refresh-chain.yml` bietet folgende **acht** Dispatch-Schritte in fester Reihenfolge:

1. `runtime_refresh` – Produktionsruntime aktualisieren (**erst nach** G01–G07).
2. `private_deploy` – geschütztes Deployment.
3. `security_smoke` – Sicherheits- und Loggingprobe.
4. `lifecycle_preflight` – privilegierter Lösch-/Retention-Preflight.
5. `composition_gate` – zusammengesetzte Produktionsnachweise.
6. `pilot_ingress` – Freigabe des privaten Pilot-Zugangs.
7. `smoke_principal` – berechtigter Pilotbenutzer.
8. `post_deploy_smoke` – Ende-zu-Ende-Nachkontrolle.

**Schutz laut Workflow:** nur `workflow_dispatch` auf `main`; `approve_step=true` für **jeden neuen Dispatch**; erneute Workflow-Versuche übernehmen eine ältere Freigabe nicht; Head-/Child-Run-Identität, Vorbedingungen und Schrittfolge werden überprüft; Teilfehler führen nicht zu blindem automatischem Weiterschalten. Der gezeigte Workflow **ersetzt** nicht die vorangehenden P01-/Owner-/Backup-Operatorentscheidungen. Aufruf des Workflows **hier ausdrücklich verboten**.

## 4. Was jetzt ohne Betreiberaktion sinnvoll fertig werden kann

| Paket | Konkrete Abschlussartefakte | Grenze |
| --- | --- | --- |
| **P03-E** | weitere echte DB-E2E: Proxy-/Gruppenentzug, Trainer-Rollendrift, historische Notizen/Actor/Trainerverweise, Org-/Neighbor-Isolation | Test-only, getrennte PostgreSQL-DB, keine produktive Authänderung |
| **P03-F** | Security-Design der Cross-Owner-/Restore-/Freitext-Gaps, dokumentierte atomare Herkunft und Checkpoints; ablaufende 35-Tage-Quelle weiterhin **deny** | kein Live-Tombstone, keine ungeprüfte Markerretention |
| **P04-A** | vorliegende Gate-Matrix, automatisierte statische Release-Gate-Prüfung, Issue-Protokoll, CI | rein lesend |
| **P04-B** | tatsächliche App-Worker↔Neon-Bindung, aktuelle Schema- und DB-Verfügbarkeit, Backup-/AVV-Nachweise mit read-only Providerzugriff, soweit verfügbar | keine Aktivierung/Restore/Provideränderung, fehlende Belege ausdrücklich offen |

## 5. Betreiber-Freigabeblock: danach keine acht Mikroentscheidungen auf einmal vortäuschen

Vor einem echten Runtime-/Security-/Migrationseingriff müssen **fachlich** geklärt werden:

- Verantwortliche Vereinsfunktion und Datenschutzprüfung, Auskunft-/Löschkontakt sowie D1–D4 und Fristen je Kategorie.
- Erlaubte personenbezogene Freitext-/Medienfelder, noch existierende ältere Nutzungsnotizen, Provider- und Verträge.
- Angemessene technische Wiederherstellungs- und Löschautorität über die gesamte reale Backup-/Export-Lebensdauer.
- Rollendefinitionen, Sicherheitsadministration und der konkrete kleine Pilotbenutzerkreis.

Eine **gemeinsame fachliche Betreiberentscheidung** kann diese Felder bündeln. **Die acht Produktionsworkflow-Schritte behalten dennoch ihre eigenständige, explizite Freigabe** – ihr Schutz darf nicht durch einen automatischen Agent-Loop entkräftet werden. Kein Merge/Deployment aus diesem Dokument.

**Befund:** P04-A vorbereitet; Gesamtbetrieb noch **NO-GO**.
