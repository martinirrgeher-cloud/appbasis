# M6 – ULC Linz Production Package Preflight

Stand: 2026-08-18

## Zweck

Dieses Dokument bereitet das reale Produktionspaket für `ulc-linz` vollständig vor, ohne eine Providerressource anzulegen, zu verändern, zu deployen oder Produktion freizugeben.

Es ist eine **Vorbereitungs- und Freigabecheckliste**, keine Production-Ready-Evidence. Fehlende reale Provider-Evidence bleibt fail-closed offen.

Verbindliche Grundlagen:

- `createAppSkeleton()` bleibt der kanonische Generator-/Publikationspfad; dieser Preflight baut keinen zweiten Generator oder Provisionierer.
- ULC v0.1 verwendet Standard Cloudflare Workers mit kontrollierter globaler Transient-Verarbeitung und wird ausdrücklich **nicht als EU-only** bezeichnet.
- Persistente personenbezogene Primärdaten gehören in eine eigene Neon-Produktionsdatenbank in **EU / Frankfurt**.
- Die reale App benötigt eine eigene Produktionsdatenbank, einen eigenen Worker-/Deployment-Lifecycle, eine eigene Domain sowie eigene Benutzer/Rollen/Berechtigungen.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte bleiben außerhalb normaler App-Manifeste und der normalen Factory-UI.
- Preview und Produktion bleiben getrennte Lebenszyklen.
- Jede produktive/externe Aktion benötigt eine neue ausdrückliche Nutzerfreigabe.

## Legende

- **JETZT** – kann read-only bzw. dokumentarisch vorbereitet werden.
- **MANUELL** – muss der Betreiber/Nutzer später ausdrücklich festlegen oder bestätigen.
- **WRITE-FREIGABE** – erzeugt/verändert Providerzustand und darf erst nach ausdrücklicher Freigabe erfolgen.
- **EVIDENCE** – wird erst nach Existenz der realen Ressourcen read-only erhoben.
- **SOL-ENTSCHEIDUNG** – Architektur-/Security-Entscheidung, die vor einem Provider-Write bewusst bestätigt werden muss.

---

## 1. Produktionsressourcen – Sollinventar

### 1.1 Neon / PostgreSQL

Erforderlich für die erste reale ULC-Produktion:

- [ ] **MANUELL:** Produktionspaket/Plan auswählen; Kosten und enthaltene Recovery-Funktionen unmittelbar vor Bestellung erneut prüfen.
- [ ] **WRITE-FREIGABE:** eigenes Neon-Projekt ausschließlich für `ulc-linz` Produktion anlegen.
- [ ] **WRITE-FREIGABE:** Region autoritativ auf AWS Europe (Frankfurt), `aws-eu-central-1`, festlegen.
- [ ] **WRITE-FREIGABE:** eindeutigen Produktionsbranch und die maßgebliche Produktionsdatenbank festlegen.
- [ ] **WRITE-FREIGABE:** dedizierte DB-Rolle/Credentials für den Produktionszugriff erzeugen; Werte niemals in Chat, Repository oder App-Manifest dokumentieren.
- [ ] **EVIDENCE:** Neon Project-/Branch-/Database-Binding über Provider-API eindeutig `application=ulc-linz`, `environment=production` zuordnen.
- [ ] **EVIDENCE:** Region aus autoritativer Provider-Metadatenquelle verifizieren; Namen/Hoststrings reichen nicht.
- [ ] **EVIDENCE:** TLS-Verbindung und Verschlüsselung at rest nachweisen.
- [ ] **EVIDENCE:** automatische Backups/Recovery aktiviert und Retention definiert.
- [ ] **EVIDENCE:** kontrollierter Restore in ein isoliertes, vom Source-DB-Binding verschiedenes Ziel durchgeführt und dokumentiert.

Nicht zulässig:

- Preview-, Reference- oder frühere Restore-Projekte als ULC-Produktion wiederverwenden.
- verschiedene eigenständige Apps in derselben Produktionsdatenbank betreiben.
- Neon Project-/Branch-/Database-IDs in `appbasis.app.json` oder `appbasis.database.json` aufnehmen.

### 1.2 Cloudflare

Erforderlich für die erste reale ULC-Produktion:

- [ ] **WRITE-FREIGABE:** eigener Produktions-Worker / Service für `ulc-linz`.
- [ ] **WRITE-FREIGABE:** eigene Produktions-Domain bzw. eigener freigegebener Produktionshostname.
- [ ] **WRITE-FREIGABE:** Runtime-DB-Binding über einen dedizierten `HYPERDRIVE`-Bindingvertrag auf die freigegebene ULC-Produktionsdatenbank.
- [ ] **WRITE-FREIGABE:** Runtime-Konfiguration `APPBASIS_BASE_URL` auf exakt den freigegebenen HTTPS-Origin setzen.
- [ ] **WRITE-FREIGABE:** Runtime-Secret `BETTER_AUTH_SECRET` sicher setzen; Secretwert nicht dokumentieren.
- [ ] **WRITE-FREIGABE:** Production-Observability/Logging-Ausleitung auf den später gewählten Security-Log-Sink konfigurieren.
- [ ] **EVIDENCE:** Account-, Runtime-, Hostname-, DB-Binding- und vollständiges Binding-Inventar read-only erfassen.
- [ ] **EVIDENCE:** vollständiges Telemetry-/Observability-Inventar read-only erfassen.
- [ ] **EVIDENCE:** keine unerwartete personenbezogene Persistenz über KV, D1, R2, Durable Objects oder andere Cloudflare-Persistenzdienste.
- [ ] **EVIDENCE:** Runtime- und Production-Bindings müssen exakt zum aktuellen freigegebenen ULC-Runtime-Vertrag passen.

### 1.3 Noch bewusst nicht festgelegte Cloudflare-Details

Folgende Werte werden **nicht** in diesem Vorbereitungsstrang erfunden:

- finaler Worker-/Service-Name,
- Provider-ID,
- Hyperdrive-ID,
- finaler Produktionshostname,
- Deployment-Credential-Namen eines noch nicht finalisierten M6-Workflows.

**SOL-ENTSCHEIDUNG vor Domain-Write:** Die Produktion soll genau den bewusst freigegebenen öffentlichen Origin besitzen. Ob `workers.dev` für den öffentlichen ULC-Worker deaktiviert wird, muss der konkrete M6-Produktionsvertrag explizit festlegen; ein unbeabsichtigter zweiter öffentlicher Origin ist nicht zulässig.

---

## 2. Runtime-Bindings und Secret-Namen

Der aktuelle deploybare ULC-Runtime-Vertrag erwartet exakt:

| Name | Typ | Wert dokumentieren? | Zweck |
|---|---|---:|---|
| `HYPERDRIVE` | Cloudflare Binding | nein | liefert die geschützte PostgreSQL-Verbindung an die Runtime |
| `APPBASIS_BASE_URL` | Konfiguration | nur Origin, kein Secret | kanonischer HTTPS-Origin der Produktions-App |
| `BETTER_AUTH_SECRET` | Secret | **niemals** | Better-Auth-/Session-Secret; Runtime verlangt mindestens 32 Zeichen |

Der aktuelle Runtime-Pfad benötigt **kein zusätzlich erfundenes `DATABASE_URL`-Worker-Secret**; die DB-Verbindung kommt über `HYPERDRIVE.connectionString`.

Zusätzliche Deployment-/Logging-Credentials werden erst benannt, wenn der konkrete M6-Workflow bzw. der konkrete Logging-Sink gewählt ist. Keine vorsorglichen Secret-Namen oder Secretwerte anlegen.

### Manuelle Vorbereitung

- [ ] **MANUELL:** festlegen, wer `BETTER_AUTH_SECRET` außerhalb von Chat/Repository erzeugt und in Cloudflare setzt.
- [ ] **MANUELL:** festlegen, welche Person(en) Provider- und Production-Secrets sehen/ändern dürfen.
- [ ] **MANUELL:** bestätigen, dass Secretwerte nicht in Tickets, Screenshots, PR-Beschreibungen oder Evidence-Snapshots erscheinen dürfen.

---

## 3. Produktions-Domain

Pflichtanforderung:

- eigene Internetadresse / eigener Produktionshostname für ULC,
- HTTPS-only,
- `APPBASIS_BASE_URL` muss exakt diesem freigegebenen Origin entsprechen,
- Domain/Route muss eindeutig auf den dedizierten ULC-Produktions-Worker zeigen,
- keine Preview-/Test-Domain darf als Produktion wiederverwendet werden,
- Factory/UI zeigt später die benutzerverständliche Domain, nicht Provider-IDs.

### Spätere Nutzerentscheidung

- [ ] **MANUELL:** exakten gewünschten Produktionshostname nennen/bestätigen.
- [ ] **MANUELL:** bestätigen, dass die Domain DNS-seitig kontrolliert werden darf.
- [ ] **MANUELL:** bestätigen, ob der gewünschte Host bereits anderweitig verwendet wird.
- [ ] **SOL-ENTSCHEIDUNG:** finalen Ingress-Vertrag einschließlich `workers.dev`/Custom-Domain-Verhalten festlegen.
- [ ] **WRITE-FREIGABE:** erst danach DNS-/Custom-Domain-/Route-Write ausführen.

---

## 4. Audit-/Security-Logging und 12-Monats-Retention

Der aktuelle M5-F-Vertrag verlangt für Production Security Events reale Evidence für:

1. exakte ULC-Production-Sink-Bindung,
2. providerseitig identifizierbaren Sink,
3. strukturierte Event-Erfassung aktiviert,
4. geschützten operativen Zugriff,
5. vollständiges Sink-Inventar,
6. **exakt 12 Monate Retention**,
7. keine öffentliche Read-API,
8. dieselbe frische Production-Resource-Binding-Evidence wie M5-G/H.

Cloudflare Workers Logs allein erfüllen dieses Gate nicht: Cloudflare dokumentiert aktuell maximal 7 Tage Workers-Log-Retention. Für 12 Monate ist daher ein externer bzw. separat persistent arbeitender Logging-Sink notwendig.

Aktuell dokumentierte Cloudflare-Optionen:

- OpenTelemetry-Export zu einem OTLP-kompatiblen Ziel; Cloudflare empfiehlt diesen Weg für neue Integrationen und unterstützt `persist=false`, wenn Logs/Traces nicht zusätzlich bei Cloudflare gespeichert werden sollen.
- Workers Logpush zu einem unterstützten Ziel als Alternative.

**Keine Anbieterentscheidung in diesem Preflight.** Die Auswahl des Sinks beeinflusst Datenschutz, Subprozessoren, Kosten, Retention und Secrets und ist deshalb eine **SOL-ENTSCHEIDUNG plus MANUELLE Kosten-/Providerfreigabe**.

### Logging-Checkliste

- [ ] **SOL-ENTSCHEIDUNG:** konkreten Security-Log-Sink auswählen.
- [ ] **MANUELL:** Kosten/Plan und 12-Monats-Retention des Sinks akzeptieren.
- [ ] **MANUELL:** DPA/AVV, Datenregion, Subprozessoren und Transfers des zusätzlichen Sink-Providers bewerten, falls ein Drittanbieter gewählt wird.
- [ ] **WRITE-FREIGABE:** Sink und Cloudflare-Ausleitung konfigurieren.
- [ ] **EVIDENCE:** Produktions-Sink-ID aus Provider-API erfassen.
- [ ] **EVIDENCE:** 12 Monate Retention aus Provider-API/Account-Konfiguration belegen.
- [ ] **EVIDENCE:** geschützten operativen Zugriff und fehlende öffentliche Read-API belegen.
- [ ] **EVIDENCE:** Test-Security-Event bis zum Sink nachvollziehen, ohne personenbezogene Testpayloads oder Secrets zu protokollieren.
- [ ] **EVIDENCE:** Delivery-/Destination-Health prüfen.

### Datenminimierung

Unverändert verbindlich:

- keine Passwörter,
- keine Session-Tokens/Cookies,
- keine Request-Bodies,
- keine Credentials/Secrets,
- keine unnötigen personenbezogenen Inhalte,
- Subject-IDs nicht in den aktuellen Security-Eventvertrag übernehmen,
- Organisationskontext nur nach autoritativ bestätigter Same-Organization-Membership.

---

## 5. DPA / AVV / internationale Transfers

### Cloudflare

- [ ] **JETZT:** aktuellen Cloudflare DPA-Stand und dessen Version/Wirksamkeitsdatum dokumentieren.
- [ ] **JETZT:** aktuelle Cloudflare-Subprozessoren und Transferregelungen dokumentieren.
- [ ] **MANUELL:** Betreiber bestätigt, unter welcher juristischen Person / welchem Account ULC betrieben wird und dass der passende Cloudflare-Vertrag/DPA gilt.
- [ ] **EVIDENCE:** DPA-/Account-Bindung zur konkreten Production-Ressource nachvollziehbar dokumentieren.
- [ ] **EVIDENCE:** aktuelle Subprozessorliste/Transfermechanismen mit Abrufdatum erfassen.

### Neon / Databricks-Vertragskette

Der aktuelle Neon Product Specific Schedule verweist für Neon auf den Databricks-Vertragsrahmen und ersetzt die allgemeine Subprocessor-Referenz durch die **Neon-spezifische Subprocessor List**. Für M5-G reicht daher eine allgemeine Databricks-Subprozessorliste allein nicht.

- [ ] **JETZT:** Neon Platform Services Product Specific Schedule dokumentieren.
- [ ] **JETZT:** Neon-spezifische Subprozessorliste mit Stand/Abrufdatum dokumentieren.
- [ ] **MANUELL:** Betreiber bestätigt die für den Neon-Account geltende Vertrags-/DPA-Bindung.
- [ ] **EVIDENCE:** konkrete Neon-Production-Ressource der richtigen Account-/Vertragsbeziehung zuordnen.
- [ ] **EVIDENCE:** Subprozessor-/Transfer-Evidence bei finalem M5-G-Lauf frisch erfassen.

### Änderungsbeobachtung

- [ ] **MANUELL:** E-Mail/RSS-/Provider-Benachrichtigungen für Subprozessoränderungen aktivieren, sofern verfügbar.
- [ ] **MANUELL:** Verantwortliche Person für die spätere Neubewertung von Subprozessor-/Transferänderungen festlegen.

Dieser Preflight ersetzt keine juristische Prüfung; er stellt sicher, dass die technischen Production-Gates die erforderlichen Nachweise nicht übergehen.

---

## 6. Verschlüsselungsnachweis

### Neon

Aktuell dokumentiert Neon:

- SSL/TLS für Client-Verbindungen,
- `verify-full` als strengste PostgreSQL-SSL-Prüfung für unterstützte Organization-Accounts,
- AES-256 für Data-at-rest,
- Schlüsselverwaltung über Cloud-KMS/Key-Vault.

Production-Evidence benötigt jedoch den Nachweis für die **konkret gebundene** ULC-Ressource, nicht nur eine Provider-Marketing-/Baseline-Aussage.

- [ ] **MANUELL / SOL-ENTSCHEIDUNG:** prüfen, ob der gewählte Neon-Account/Plan `verify-full` zulässt und ob der aktuelle Hyperdrive-/Runtime-Pfad dies sauber nutzen kann; keine stille Runtimeänderung.
- [ ] **EVIDENCE:** TLS/SSL-Verbindung der konkreten Production-Bindung belegen.
- [ ] **EVIDENCE:** Encryption-at-rest für die konkrete Neon-Plattform/Region belegen.

### Cloudflare / Domain

- [ ] **EVIDENCE:** HTTPS/TLS am freigegebenen Produktionshostname aktiv und gültig.
- [ ] **EVIDENCE:** Cloudflare→Neon-Verbindung folgt dem freigegebenen TLS-Vertrag.
- [ ] **EVIDENCE:** Logging-Sink-Transport und Speicherung verschlüsselt, sobald ein Sink gewählt wurde.

---

## 7. Backup / Restore / Disaster Recovery

M5-I akzeptiert Backup/Restore für ULC-Produktion nur aus einem **controlled restore run** gegen die reale Production-DB-Bindung.

Pflicht-Evidence:

- `automaticBackupsEnabled=true`,
- Retention definiert,
- Pre-Migration-Backup definiert,
- Restore-Verfahren dokumentiert,
- Restore in ein isoliertes, anderes Ziel erfolgreich,
- Datenintegrität verifiziert,
- Auth verifiziert,
- Permissions verifiziert,
- Application Smoke verifiziert,
- Restore-Reconciliation verifiziert.

### Kritische Lifecycle-Grenze: 35 Tage

Der aktuelle ULC-Lifecycle-Vertrag hält Delete-Marker **35 Tage** vor und beschreibt Restore-Reconciliation ausdrücklich für den bestätigten **35-Tage-Backup-Window**.

Daraus folgt für das erste Produktionspaket:

- [ ] **SOL-ENTSCHEIDUNG:** Recovery-/Snapshot-Retention darf nicht still über den aktuell bewiesenen 35-Tage-Reconciliation-Horizont hinausgehen.
- [ ] Wird eine wiederherstellbare personenbezogene Backup-/Snapshot-Historie von **mehr als 35 Tagen** gewünscht, muss zuerst der Lifecycle-/Deletion-Reconciliation-Vertrag neu bewertet und gegebenenfalls erweitert werden.
- [ ] Eine lange Backup-Retention darf nicht mit der separaten **12-Monats-Retention für Audit/Security-Logs** verwechselt werden.

### Späterer kontrollierter Restore-Test

- [ ] **WRITE-FREIGABE:** temporäres isoliertes Restore-Ziel erzeugen.
- [ ] Restore aus der konkret gebundenen Production-Backup-/Recovery-Quelle durchführen.
- [ ] Quelle, Restore-Ziel, Recovery Point, Start/Ende/Dauer dokumentieren.
- [ ] Datenintegritäts-Fingerprint/Count-Digest prüfen.
- [ ] Auth-Login/Session-Verhalten prüfen.
- [ ] Rollen/Permissions einschließlich Denial-Fall prüfen.
- [ ] App-Smoke durchführen.
- [ ] aktuelle Delete-Marker aus einer autoritativ neueren Quelle gegen den Restore reconciliieren.
- [ ] nach Reconciliation erneut beweisen, dass gelöschte Identitäten nicht produktiv reaktiviert würden.
- [ ] **MANUELL:** Ergebnis des Restore-Nachweises vor Production Ready akzeptieren.
- [ ] **WRITE-FREIGABE:** temporäres Restore-Ziel erst nach Abschluss/Evidence kontrolliert entfernen, falls Löschung gewünscht ist.

---

## 8. Manuelle Freigabepunkte – Betreiber

Diese Punkte sollen im M6-Durchlauf **vor** dem jeweiligen möglichen Blocker abgefragt werden.

### Gate U0 – Zielidentität

- [ ] **MANUELL:** exakten Produktionshostname bestätigen.
- [ ] **MANUELL:** zuständigen Cloudflare-Account und Neon-Account bestätigen.
- [ ] **MANUELL:** bestätigen, unter welcher juristischen Person / welchem Betreibervertrag ULC läuft.

### Gate U1 – Kosten und Ressourcenerzeugung

Vor jeglichem Provider-Create muss eine konkrete Liste mit Region, Ressourcentypen und erwartbaren Kosten vorgelegt werden.

- [ ] **MANUELL:** Neon-Produktionsprojekt in Frankfurt freigeben.
- [ ] **MANUELL:** Cloudflare Produktions-Worker und Hyperdrive-Konfiguration freigeben.
- [ ] **MANUELL:** Domain-/DNS-Konfiguration freigeben.
- [ ] **MANUELL:** gewählten Logging-Sink samt Plan/Kosten freigeben.

### Gate U2 – Verträge / Privacy

- [ ] **MANUELL:** Cloudflare-DPA/AVV-/Transfer-/Subprozessor-Nachweise akzeptieren bzw. zur juristischen Prüfung eskalieren.
- [ ] **MANUELL:** Neon-/Databricks-Vertragskette und Neon-spezifische Subprozessoren akzeptieren bzw. eskalieren.
- [ ] **MANUELL:** zusätzlichen Logging-Provider analog akzeptieren, falls vorhanden.

### Gate U3 – Secrets

- [ ] **MANUELL:** `BETTER_AUTH_SECRET` außerhalb von Chat/Repository bereitstellen/setzen.
- [ ] **MANUELL:** erforderliche Provider-/Deployment-/Logging-Credentials nur über den finalen Secret-Store/Environment-Pfad setzen.
- [ ] Keine Secret-Rotation allein für Vorbereitung durchführen.

### Gate U4 – Produktionmigration

- [ ] vollständige Exact-Head-CI und finaler Codex auf dem tatsächlichen Release-Head vorhanden.
- [ ] reales Backup unmittelbar vor kritischer Migration nach definiertem Verfahren vorhanden.
- [ ] **MANUELL:** konkrete produktive Migration ausdrücklich freigeben.

### Gate U5 – Deployment / Domain

- [ ] M5 12/12 mit frischer realer Evidence.
- [ ] Backup/Restore-Evidence grün.
- [ ] Production-Worker/Domain/Bindings read-only verifiziert.
- [ ] **MANUELL:** konkretes Produktionsdeployment ausdrücklich freigeben.

### Gate U6 – Produktionsfreigabe

- [ ] Deployment-Smokes einschließlich Health/Auth/Permissions vollständig grün.
- [ ] keine offenen Security-/Privacy-/Review-Blocker.
- [ ] Production Release Gate separat grün; Production Ready allein ist keine Release-Autorisierung.
- [ ] **MANUELL:** Nutzertraffic / echte Produktionsfreigabe ausdrücklich bestätigen.

---

## 9. Evidence-Paket, das unmittelbar vor M5/M6-Freigabe vorliegen muss

Ein gemeinsamer, frischer Production-Snapshot muss mindestens enthalten bzw. eindeutig referenzieren:

### Resource Binding

- ULC-App-ID + `production`,
- aktuelle Runtime-Vertragsidentität,
- Cloudflare Account-/Worker-/Hostname-/DB-Binding,
- Neon Project-/Branch-/Database-Binding,
- Neon-Region Frankfurt,
- vollständiges Cloudflare Binding- und Telemetry-Inventar,
- keine unerwartete personenbezogene Cloudflare-Persistenz,
- `observedAt` / `validUntilOrReviewAt`.

### M5-F Logging

- konkreter Sink,
- strukturierte Erfassung aktiv,
- geschützter Zugriff,
- vollständiges Sink-Inventar,
- keine öffentliche Read-API,
- Retention exakt 12 Monate.

### M5-G Provider Compliance

- Datenregion,
- DPA/AVV-/Account-Bindung,
- Verschlüsselung,
- aktuelle Subprozessoren/Transfers,
- kanonische reale Datenflüsse,
- Freshness.

### M5-H Control Plane

- aktueller geschützter Cloudflare-Control-Plane-Snapshot,
- vollständiges privilegiertes Komponenten-/Binding-Inventar,
- kein unbeabsichtigter öffentlicher Ingress privilegierter Komponenten.

### M5-I Backup/High Privacy

- controlled restore run,
- Datenintegrität,
- Auth,
- Permissions,
- App-Smoke,
- Restore-Reconciliation,
- kanonische High-Privacy-/Least-Privilege-/Operator-Evidence.

Alle volatilen F/G/H-Evidenzen müssen auf denselben realen Resource-Binding-Snapshot zeigen; gemischte Snapshots bleiben fail-closed.

---

## 10. Provider-Recherche – Stand 2026-08-18

Diese Quellen sind **Planungsgrundlage**, nicht selbst Production-Evidence. Vor einem kostenpflichtigen/produktiven Write werden plan- und accountabhängige Angaben nochmals live geprüft.

### Cloudflare

- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
  - aktuell max. 7 Tage Retention; Paid 7 Tage, Free 3 Tage.
- OpenTelemetry Export: https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/
  - Export an OTLP-kompatible Ziele; `persist=false` möglich.
- Workers Logpush: https://developers.cloudflare.com/workers/observability/logs/logpush/
- Cloudflare DPA v6.4, effective 2026-04-03: https://www.cloudflare.com/cloudflare-customer-dpa/
- Privacy/Trust Hub inkl. Subprocessor-Verweis: https://www.cloudflare.com/trust-hub/privacy-and-data-protection/

### Neon

- Platform Services Product Specific Schedule: https://neon.com/platform-terms
- Neon-spezifische Subprozessoren: https://neon.com/subprocessors
- Security overview: https://neon.com/docs/security/security-overview
- Frankfurt-Region `aws-eu-central-1`: https://neon.com/docs/changelog/2026-02-20
- Backup/Snapshot-Änderungen: https://neon.com/docs/changelog/2025-10-31 und https://neon.com/docs/changelog/2026-02-27

---

## 11. Exit-Kriterien dieses Vorbereitungsstrangs

Der Vorbereitungsstrang gilt dokumentarisch als fertig, wenn:

- [x] benötigte Neon-/Cloudflare-Ressourcenklassen benannt sind, ohne Provider-IDs/Namen vorwegzunehmen,
- [x] aktuelle Runtime-Bindings und Secret-Namen ohne Werte dokumentiert sind,
- [x] Domain-Entscheidungs-/Freigabepunkte definiert sind,
- [x] Logging-/12-Monats-Nachweis definiert ist,
- [x] DPA/AVV-/Subprozessor-/Transfer-Nachweise definiert sind,
- [x] Verschlüsselungsnachweis definiert ist,
- [x] Backup-/Restore-/Reconciliation-Nachweis definiert ist,
- [x] alle produktiven/manuellen Betreiberfreigaben U0–U6 sichtbar sind,
- [x] 35-Tage-Lifecycle-/Backup-Grenze als eigener Architekturblocker markiert ist,
- [ ] konkrete Domain vom Nutzer bestätigt ist,
- [ ] Logging-Sink per Sol-Architekturentscheidung ausgewählt ist,
- [ ] konkrete Providerpläne/Kosten unmittelbar vor Write live geprüft und vom Nutzer freigegeben sind,
- [ ] keine reale Providerressource für diesen Preflight erzeugt oder verändert wurde.

Bis zu diesen späteren Freigaben darf die Factory keine erfolgreiche Produktionsfreigabe anzeigen.