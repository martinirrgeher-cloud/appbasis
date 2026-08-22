# M6 – ULC Production Write Approval Packets

Stand der Vorbereitung: 2026-08-19, 14:59 Europe/Vienna

## Status

**Vorbereitung für spätere Einzel-Freigaben – keine Freigabe und kein Write.**

Dieses Dokument bildet den tatsächlichen 14-Schritte-Vertrag aus `ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN` in operatorlesbare Freigabepakete ab.

Es autorisiert keinen Schritt. Jeder mutierende/externe Schritt wird unmittelbar vor Ausführung erneut live geprüft und dem Nutzer mit konkretem Ziel, Risiko und erwarteter Wirkung zur ausdrücklichen Freigabe vorgelegt.

## 1. Globale Regeln für alle 14 Schritte

Vor jedem mutierenden Schritt:

1. GitHub `main`, alle offenen PRs und finalen Produktions-Head live prüfen.
2. vollständige Exact-Head-CI und erforderliche Merge-/Codex-Gates verifizieren.
3. alle `requires` des konkreten M6-Schritts als real erfüllt belegen.
4. aktuellen Provider-/Ressourcenzustand read-only erneut lesen.
5. Kollisionen/Drift/unerwartete Ressourcen fail-closed behandeln.
6. Secretwerte niemals in Chat, Repository, Screenshots oder normale Logs schreiben.
7. konkrete Nutzerfreigabe genau für den unmittelbar bevorstehenden Write einholen.
8. nach Write Ergebnis read-only verifizieren.
9. bei Abweichung **STOP**, keine automatische Folgeaktion.

### Rollback-Grundsatz

Ein Rollback ist selbst häufig ein Write.

Deshalb:

- keine Providerressource automatisch löschen,
- keine Secretrotation automatisch zurückdrehen,
- keine Migration mit improvisiertem Reverse-SQL zurückrollen,
- keine Production-Daten automatisch überschreiben,
- keine öffentliche Route automatisch umschalten, außer der konkrete Rückweg wurde vor dem ursprünglichen Write ausdrücklich mitfreigegeben.

Im Fehlerfall bevorzugt: Ressource privat/isoliert lassen → Zustand beweissicher lesen → nächsten sicheren Recovery-Schritt separat freigeben.

## 2. Paket 1 – `neon-production-database`

**Klasse:** `provider-write`  
**Ziel:** eigene ULC-Produktionsdatenbank in Neon, Region `aws-eu-central-1` / Frankfurt.

### Vor Freigabe beweisen

- M6 Repository-/Provider-State-Preflight frisch grün,
- keine vorhandene/plausible ULC-Production-Kollision,
- richtige Neon-Organisation/account scope,
- Region Frankfurt auswählbar und explizit gesetzt,
- finaler Plan/Kostenstatus bekannt,
- Preview/Test und Production bleiben getrennt.

### Nutzer sieht vor Zustimmung

- dass eine neue Neon-Produktionsressource erzeugt wird,
- gewählte Region,
- ob dadurch Kosten entstehen,
- keine Secretwerte/Connection Strings.

### Erwartetes Ergebnis

- neue dedizierte Production Project-/Branch-/Database-Identität,
- noch keine Migration,
- noch kein Public Ingress.

### Nachweis danach

- Provider-API bestätigt Resource Class/Region/Identity,
- IDs nur geschützt/transient speichern,
- Production Resource Binding noch nicht vollständig grün, solange Worker/Binding fehlen.

### Fehler/Rollback

- STOP und Ressource isoliert lassen,
- **nicht automatisch löschen**,
- Löschung/Neuaufbau nur als separate explizite Provideraktion.

## 3. Paket 2 – `production-worker`

**Klasse:** `provider-write`  
**Requires:** Production DB.

### Ziel

Dedizierte Cloudflare-Production-Worker-Ressource ohne öffentlichen Ingress.

### Vor Freigabe

- Cloudflare-Account-Scope read-only bestätigt,
- kein Namens-/Runtime-Konflikt,
- Worker wird mit `workers.dev=false`, ohne Custom Domain/Route/öffentlichen Fallback vorbereitet,
- noch kein App-Deploy, der öffentlich erreichbar wäre.

### Erwartetes Ergebnis

- private/dedizierte Worker-Identität,
- kein Public Ingress.

### Nachweis

- Provider-API-Identität,
- `workers.dev=false`, keine Preview-/Custom-Domain-/Route-Exposition.

### Fehler/Rollback

- Worker privat lassen,
- keine automatische Löschung,
- Cleanup separat freigeben.

## 4. Paket 3 – `database-binding`

**Klasse:** `provider-write`  
**Requires:** Neon DB + Production Worker.

### Ziel

Eindeutiges Hyperdrive- oder äquivalentes DB-Binding vom Production Worker zur **Production DB**.

### Vor Freigabe

- beide Zielressourcen autoritativ gelesen,
- keine Preview-/Test-DB versehentlich gebunden,
- Binding-Name entspricht dem Runtimevertrag,
- Secret/Connection String bleibt außerhalb Manifest/UI.

### Erwartetes Ergebnis

- genau die beabsichtigte Worker→Production-DB-Verbindung,
- noch kein öffentlicher Zugriff.

### Nachweis

- Cloudflare-Binding-Inventar vollständig,
- Neon Project/Branch/Database-Korrelation eindeutig,
- Resource-Binding-Evidence noch fail-closed, falls weitere Pflichtteile fehlen.

### Fehler/Rollback

- STOP; Binding nicht produktiv verwenden,
- Entfernen/Umbinden ist separater Providerwrite und wird separat freigegeben.

## 5. Paket 4 – `production-domain-selection`

**Klasse:** `operator-input`  
**Requires:** Production Worker.  
**Providerwrite:** nein.

### Ziel

Operator bestätigt den vorgesehenen Hostnamen `app.ulc-linz.at` bzw. einen ausdrücklich neu gewählten kanonischen Production-Host.

### Vor Bestätigung

- DNS-/Domainkontrolle read-only prüfen,
- keine bestehende fremde Belegung/Kollision,
- Origin/Hostname-Konsistenz prüfen.

### Erwartetes Ergebnis

- ein bestätigter Hostname als Input,
- **noch keine DNS-/Route-Aktivierung**.

### Rücknahme

Solange Schritt 10 nicht erfolgt ist, kann die Auswahl ohne Providerwirkung geändert werden; danach ist eine Änderung ein eigener Public-Ingress-Write.

## 6. Paket 5 – `runtime-configuration`

**Klasse:** `provider-write`  
**Requires:** DB Binding + Production Worker.

### Ziel

Runtime-Konfiguration für den privaten Worker:

- Secret `BETTER_AUTH_SECRET`,
- plain config `APPBASIS_BASE_URL`,
- erforderliches `HYPERDRIVE`-Binding.

### Vor Freigabe

- Secretname, aber **nie Secretwert**, bestätigen,
- `APPBASIS_BASE_URL` entspricht dem bestätigten Production-Origin-Vertrag,
- HYPERDRIVE zeigt auf die gebundene Production DB,
- keine zusätzlichen unbekannten Secrets/Bindings.

### Erwartetes Ergebnis

- private Runtime besitzt exakt die benötigte Konfiguration.

### Nachweis

- Namen/Binding-Typen read-only inventarisieren,
- Secretwerte nicht lesen/ausgeben,
- vollständiges Binding-Inventar.

### Fehler/Rollback

- Worker privat lassen,
- Konfigurationsänderung/Secret-Replacement nur separat freigeben,
- alten Secretwert nicht im Repository/Chat sichern.

## 7. Paket 6 – `production-security-logging-sink`

**Klasse:** `provider-write`  
**Requires:** Production Worker + Runtime Configuration.

### Ziel

Realer M5-F-Security-Logging-Pfad mit strukturierten Events, geschütztem Zugriff und exakt 12 Kalendermonaten Retention.

### Vor Freigabe

- finaler Sink-/Delivery-Entscheid steht fest,
- Kosten/Plan bekannt,
- M5-F Calendar-Retention-Vertrag für den tatsächlich gewählten Modus implementiert und CI-/Codex-geprüft,
- keine breite ungefilterte Worker-Observability als Ersatz,
- keine öffentliche Read-API,
- DPA/Subprozessoren-/Datenfluss-Scope aktualisiert.

**Wichtig:** Der heutige #165-Vertrag nennt noch `retentionMustBeProviderVerified=true`. Falls der spätere M5-F-Calendar-Retention-Slice `controlled-calendar-enforcement` als realen Modus implementiert, muss #165/der dann aktuelle M6-Vertrag vor Ausführung bewusst auf diesen finalen Evidence-Vertrag aktualisiert und vollständig neu geprüft werden. Kein stilles Umdeuten.

### Erwartetes Ergebnis

- konkreter Sink + Delivery-Binding,
- keine Production-Readiness allein durch Ressourcenerstellung.

### Nachweis

- M5-F-Paket aus Punkt 6/7 vollständig,
- Sink-/Retention-/Access-/Inventory-Evidence frisch.

### Fehler/Rollback

- Producer-/Ingress nicht freigeben,
- Sink/Worker isoliert lassen,
- Ressourcencleanup/Planänderung separat genehmigen.

## 8. Paket 7 – `production-migrations`

**Klasse:** `production-data-write`  
**Requires:** Production DB.

### Ziel

Exakt den manifestierten PostgreSQL-Migrationsplan gegen die Production DB anwenden.

### Vor Freigabe

- finaler Migration-Plan-Fingerprint frisch auf finalem Head,
- Ziel-DB exakt gebunden,
- keine unbekannte Schema-Drift,
- Backup-/Recovery-State geprüft,
- vor kritischer Migration ein freigegebener Recovery Point/Snapshot,
- Recovery-/Rollback-Plan dokumentiert,
- keine SQL-Inhalte/Connection Strings im Freigabeoutput.

### Erwartetes Ergebnis

- genau die geplanten Migrationen in Owner-/Manifest-Reihenfolge,
- Schema-Verifikation danach grün.

### Nachweis

- Migrationsergebnis/Versionen/Fingerprint,
- Schema-/Contract-Prüfung,
- keine fachlichen Nutzerdatenmutation außer migrationsnotwendiger deterministischer Änderung.

### Fehler/Rollback

- sofort STOP,
- **kein improvisiertes Reverse-SQL**,
- bevorzugt forward fix oder kontrollierter Restore vom vorab gebundenen Recovery Point,
- Restore/Promotion selbst separat freigeben.

## 9. Paket 8 – `production-worker-deploy`

**Klasse:** `provider-write`  
**Requires:** DB Binding + Runtime Config + Logging Sink + Migrations.

### Ziel

Finale geprüfte ULC-Runtime auf den weiterhin privaten Production Worker deployen.

### Vor Freigabe

- deployter Source-Head = final CI-/Codex-geprüfter Head,
- Runtime Contract Digest stimmt,
- Migrationen grün,
- Logging Delivery vorhanden,
- Worker weiterhin ohne Public Ingress.

### Erwartetes Ergebnis

- Production-Runtime läuft privat,
- noch keine öffentliche Domain-Aktivierung.

### Nachweis

- Deployment/Version autoritativ gelesen,
- Runtime-/Binding-Digest passt,
- interner Health/Operations-Check soweit ohne Public Ingress möglich.

### Fehler/Rollback

- öffentliche Aktivierung bleibt gesperrt,
- ggf. früheren validierten Deploy wiederherstellen nur mit separater Providerwrite-Freigabe.

## 10. Paket 9 – `production-access-bootstrap`

**Klasse:** `application-write`  
**Requires:** Migrationen + Worker Deploy.

### Ziel

Initial genau einen autorisierten Production-Administrator über die kanonischen Identity-/Permissions-Verträge erzeugen/zuweisen.

### Vor Freigabe

- Identity-Set leer oder nachweislich recoverable,
- konkrete Admin-Identity wird erst jetzt sicher festgelegt,
- `createInitialTechnicalAdmin` bleibt kanonischer Bootstrap,
- kanonisches ULC Permission Provisioning,
- explizite Principal Assignments,
- Least Privilege,
- kein zweiter Provisioning-Vertrag.

### Erwartetes Ergebnis

- genau ein initialer Admin,
- keine weiteren Default-Benutzer/-Rollen.

### Nachweis

- Identity vorhanden/aktiv,
- erwartete Rolle/Permissions,
- Last-Admin-/Scope-Grenzen intakt,
- Credential niemals im Evidence-Output.

### Fehler/Rollback

- Public Ingress bleibt gesperrt,
- keine ungeprüfte Hard-Delete-Korrektur,
- Korrektur über kanonischen Identity-/Permissions-/Lifecycle-Pfad separat freigeben.

## 11. Paket 10 – `production-domain-activation`

**Klasse:** `public-exposure-write`  
**Requires:** Domain Selection + Deploy + Access Bootstrap.

### Ziel

Den bestätigten Production-Host öffentlich an die bereits privat geprüfte Runtime binden.

### Vor Freigabe

- Domainkontrolle und Kollisionsfreiheit erneut prüfen,
- TLS/HTTPS-Pfad vorbereitet,
- Worker/DB/Logging/Auth vollständig gebunden,
- mindestens ein gültiger Admin vorhanden,
- kein workers.dev-/Preview-Fallback,
- Public-Ingress-Konfiguration exakt bekannt.

### Erwartetes Ergebnis

- `https://app.ulc-linz.at` bzw. final bestätigter Host erreicht ausschließlich die Production-Runtime.

### Nachweis

- DNS/Route/Custom Domain autoritativ,
- TLS aktiv,
- keine zweite öffentliche Route/Fallback.

### Fehler/Rollback

- STOP,
- Deaktivieren/Entfernen der Public Route ist ein separater Providerwrite; wenn als unmittelbarer Safety-Rollback mitfreigegeben, exakt diesen engen Rückweg nutzen, sonst separate Freigabe.

## 12. Paket 11 – `m5-production-evidence`

**Klasse:** `read-only-evidence`  
**ApprovalRequired im #165-Vertrag:** nein.

### Ziel

Das korrelierte F/G/H/I/J-Production-Evidence-Paket aus Punkt 7 erfassen.

### Vor Ausführung

- Domain und Logging-Pfad real aktiv,
- keine relevante Ressource im Evidence-Fenster verändern,
- geschützte Provider-/DB-Reader verfügbar.

### Erwartetes Ergebnis

- M5-Kriterien aus realer Evidence,
- fail-closed `open`, sobald ein Nachweis fehlt,
- kein Release durch M5 allein.

### Rollback

Nicht erforderlich; read-only. Bei Drift Paket verwerfen und nach stabilisiertem Zustand neu erfassen.

## 13. Paket 12 – `backup-recovery-validation`

**Klasse:** `recovery-validation-write`  
**Requires:** M5 Evidence + Migrationen.

### Ziel

Realen Backup-/Restore-Vertrag der ULC Production DB beweisen.

### Vor Freigabe

- 35-Tage-Recovery-Vertrag und Snapshot-Expiry-Regeln bestätigt,
- Restore-Ziel **isoliert**, nicht Production,
- Recovery Point eindeutig,
- autoritativ neuere Löschmarkerquelle für Reconciliation vorhanden,
- kein direkter Production-Overwrite.

### Erwartetes Ergebnis

- isolierter Restore,
- Datenintegrität grün,
- Auth grün,
- Permissions Allow/Deny grün,
- Application-Smoke grün,
- Restore-Reconciliation beweist keine Reaktivierung gelöschter Subjects.

### Nachweis

- Recovery Point/Restore-Evidence sanitisiert,
- gemessene Restore-Zeit,
- Reconciliation-/Smoke-Ergebnis.

### Fehler/Rollback

- Restore-Ziel nicht promoten,
- isoliert/quarantänisiert lassen,
- Cleanup separat freigeben.

**Eine tatsächliche Production-Restore-Finalisierung ist nicht Teil dieses normalen Validation-Schritts und benötigt eigene ausdrückliche Zustimmung.**

## 14. Paket 13 – `post-deploy-smokes`

**Klasse:** `production-smoke-write`  
**Requires:** M5 Evidence + Backup/Recovery + Public Domain.

### Ziel

Finale kontrollierte Health/Auth/Permissions/Application-Smokes auf Production.

### Vor Freigabe

- dedizierte Smoke-Identitäten vorbereitet,
- keine echten Nutzer-Credentials,
- keine Fachmodul-Datenmutation (`modules: []` im aktuellen Vertrag),
- Allow-/Deny-Fälle exakt gepinnt,
- Smoke-Erfolg autorisiert nicht Release.

### Erwartetes Ergebnis

- HTTPS Health PASS,
- Auth PASS,
- Session PASS,
- Permission Allow PASS,
- Permission Deny PASS,
- kein unerwarteter Write/Scope.

### Nachweis

- nur Status/Timing/Contract-Ergebnis,
- keine Credentials/Session-Tokens/PII.

### Fehler/Rollback

- Release-Gate bleibt gesperrt,
- Smoke-Identitäten über kanonischen Lifecycle kontrolliert bereinigen/deaktivieren – als separater Production-Write, sofern nicht bereits im explizit genehmigten Smoke-Paket enthalten.

## 15. Paket 14 – `release-gate`

**Klasse:** `authorization-gate`  
**Requires:** M5 Evidence + Backup/Recovery + Post-Deploy-Smokes.

### Ziel

Bewusste finale Nutzerentscheidung, ob die bereits technisch bereitgestellte Production-App als freigegeben gilt.

### Vor Freigabe zwingend anzeigen

- finaler Repository-/Runtime-Head,
- aktuelle Post-Merge-/Production-CI/Tests,
- M5 vollständig grün,
- Backup/Restore grün,
- Smokes grün,
- offene Risiken/Provider-Beta-/Kostenpunkte,
- Domain/Worker/DB/Sink semantisch eindeutig gebunden,
- keine offenen relevanten Review-/Security-Blocker.

### Nutzeraktion

Es muss eine **explizite, konkrete Produktionsfreigabe** vorliegen. Ein früheres „mach weiter“, ein erfolgreicher Smoke oder `Production Ready=true` zählt nicht als Release-Freigabe.

### Erwartetes Ergebnis

- nur der ausdrücklich implementierte Release-Vertrag darf autorisiert werden,
- `automaticRelease=false` bleibt verbindlich.

### Fehler/Rollback

- keine automatische Release-Aktion,
- bei unklarem Zustand bleibt Release gesperrt,
- spätere Rücknahme/Deaktivierung ist ein eigener produktiver Vorgang und wird nicht in diesem Prep-Dokument erfunden.

## 16. Welche Schritte benötigen ausdrücklich den Nutzer?

Nach aktuellem #165-Vertrag:

- Schritt 1: ja
- Schritt 2: ja
- Schritt 3: ja
- Schritt 4: ja – Operator-Input, aber kein Providerwrite
- Schritt 5: ja
- Schritt 6: ja
- Schritt 7: ja
- Schritt 8: ja
- Schritt 9: ja
- Schritt 10: ja
- Schritt 11: **nein**, read-only Evidence, sofern alle nötigen sicheren Reader bereits autorisiert/verfügbar sind
- Schritt 12: ja
- Schritt 13: ja
- Schritt 14: **ja, ausdrücklich finale Release-Freigabe**

Diese Freigaben werden nicht gesammelt pauschal vorweggenommen. Unmittelbar vor dem jeweiligen riskanten Schritt wird die konkrete Wirkung erneut erklärt.

## 17. Drift-Regel

Ändert sich der tatsächliche #165/M6-Execution-Plan vor Production, wird dieses Dokument nicht blind verwendet.

Insbesondere der geplante M5-F Calendar-Retention-Slice kann Schritt 6 semantisch bewusst präzisieren. Dann müssen:

1. neuer kanonischer M6-Vertrag,
2. dieses Approval-Paket,
3. relevante Preflights/Tests

konsistent aktualisiert und erneut vollständig geprüft werden.

## 18. Externe Wirkung

Keine. Durch dieses Dokument wurde kein einziger der 14 Schritte ausgeführt oder freigegeben.
