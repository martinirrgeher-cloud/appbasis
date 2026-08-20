# M6 – ULC Linz Produktions-Preflight

## Zweck

Dieser Slice bereitet den konkreten ersten ULC-Linz-Produktionspfad bis unmittelbar vor externe Writes vor. Er bleibt app-spezifisch und baut keine allgemeine Provider-Orchestrierung.

Der Preflight liest nur Repository-Verträge. Er erzeugt keine Providerressource, setzt kein Secret, führt keine Migration aus, deployed keinen Worker, aktiviert keine Domain, erzeugt keine Produktionsbenutzer und autorisiert keinen Release.

Der normale Repository-Output bleibt daher `prepared-blocked-before-provider-write` mit `providerWriteAllowed=false`, `releaseAuthorized=false` und `explicitApprovalRequired=true`.

## Kanonisches Phasenmodell

Gemäß ADR-023 und der Entscheidung vom 20.08.2026 werden drei Zustände strikt getrennt:

1. **Kontrollierte Produktionsvorbereitung**
   - Voraussetzung für den ULC-v0.1-Pfad: M3 ist real belegt.
   - M4 und M5 müssen noch nicht DONE sein, wenn genau die vorbereiteten, nicht öffentlichen Ressourcen benötigt werden, um deren reale Evidence zu erzeugen.
   - Jeder mutierende Schritt benötigt weiterhin seine eigene ausdrückliche Nutzerfreigabe.
   - Worker und Deployment bleiben ohne öffentliches Ingress.
   - Diese Phase ist weder `Security & Privacy Ready` noch `Production Ready`.

2. **Production Ready**
   - M4 / Backup & Disaster Recovery ist DONE, inklusive realem Restore.
   - M5 / Security & Privacy Ready ist DONE und fail-closed vollständig.
   - dedizierte Produktionsressourcen, kontrollierte Migrationen und Deployment sind belegt.
   - die öffentliche Domain darf erst nach M4- und M5-Evidence aktiviert werden.
   - Post-Deploy-Smokes müssen anschließend erfolgreich sein.

3. **Produktion freigegeben**
   - setzt Production Ready voraus.
   - benötigt zusätzlich eine davon getrennte ausdrückliche finale Release-Freigabe.
   - technische Evidence autorisiert niemals automatisch den Release.

Diese Trennung löst die reale Evidence-Abhängigkeit: M5-G und M5-F benötigen konkrete Produktionsressourcen bzw. einen realen Logging-Sink. Solche Ressourcen dürfen deshalb kontrolliert vorbereitet werden, ohne dadurch Production Ready zu behaupten.

## Kanonische Verträge

Der Preflight verwendet ausschließlich bestehende Verträge:

- ULC-Zielpolicy mit Neon Frankfurt
- `createExpectedUlcLinzDatabaseManifest()`
- `createInitialTechnicalAdmin()`
- `replaceUlcLinzPrincipalAccess()` / `PostgresPrincipalAccessAdministration`
- ULC-M5-Permission-Provisioning-Bundle
- `ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT`
- bestehenden M5-F-Evidence-Owner
- bestehenden M6-Release-Readiness-Vertrag mit zehn Pflichtkriterien

Es entsteht keine zweite Generator-, Datenbank-, Identity-, Rollen-, Audit-, Resource-Binding- oder Readiness-Implementierung.

## Produktziel

Für ULC v0.1 gilt weiterhin:

- dedizierte Neon-Produktionsdatenbank in `aws-eu-central-1` / Frankfurt
- dedizierter Cloudflare-Produktions-Worker
- Standard Workers, ausdrücklich kein EU-only-Claim
- eigener Produktionshostname
- keine zusätzlichen personenbezogenen Cloudflare-Persistenzdienste ohne neue Bewertung
- realer Security-Logging-Sink mit strukturierter Event-Erfassung, geschütztem operativem Zugriff und zwölf Monaten Retention
- Secrets außerhalb des Repository
- ausdrückliche Freigabe für jede mutierende Provider-/Produktionsgrenze

## Kontrollierter Ablauf

### Phase A – nicht öffentliche Produktionsvorbereitung

1. **Neon-Produktionsdatenbank** – dediziert, Frankfurt, erster Provider-Write, separate Freigabe.
2. **Produktions-Worker** – dediziert, `workers.dev=false`, kein öffentliches Ingress.
3. **Datenbank-Binding** – bindet den privaten Worker an die dedizierte Produktionsdatenbank.
4. **Produktionsdomain auswählen** – Operator-Input, noch kein Provider-Write und kein Ingress.
5. **Runtime-Konfiguration / Secrets** – `BETTER_AUTH_SECRET`, `APPBASIS_BASE_URL`, `HYPERDRIVE`; keine Werte im Repository oder Log.
6. **Production Security Logging** – eigener freizugebender Write; strukturierte Events, geschützter Zugriff, zwölf Monate Retention, vollständiges Sink-Inventar, keine öffentliche Read-API.
7. **Produktionsmigrationen** – nur aus `apps/ulc-linz/appbasis.database.json`; Recovery-Zustand, Sicherung und Rollbackpfad vorher prüfen; danach verifizieren.
8. **Produktions-Worker deployen** – kanonischer Entrypoint `./worker/index.ts`; weiterhin `publicIngress=false`.
9. **Produktive Benutzer & Rechte bootstrapen** – bestehende Identity-/Permission-Verträge, keine Default-Principal-Zuweisungen.

Bis einschließlich Schritt 9 bleibt die Produktionsruntime absichtlich nicht öffentlich erreichbar.

### Phase B – reale M5-/M4-Evidence und Production Ready

10. **M5-Production-Evidence** – read-only aus den real vorbereiteten Ressourcen. Das vollständige fail-closed Gate heißt `Security & Privacy Ready v0.1`.
11. **Backup & Recovery validieren** – automatische Backups, Retention, PITR soweit verfügbar sowie realer Restore mit Datenintegrität, Auth, Permissions und App-Smoke.
12. **Produktionsdomain aktivieren** – erst nach erfolgreicher M5- und M4-Evidence; eigener ausdrücklich freizugebender Public-Exposure-Write.
13. **Post-Deploy-Smokes** – Health, Auth, Permissions, Application. Der Smoke ist selbst ein kontrollierter Produktionswrite und benötigt Freigabe.

Erst wenn alle zehn M6-Kriterien erfüllt sind, kann der technische Zustand `Production Ready` entstehen.

### Phase C – Release

14. **Release-Gate** – kein automatischer Release; separate ausdrückliche Nutzerfreigabe zwingend.

## M6-Kriterienabdeckung

Der Plan deckt exakt die zehn bestehenden Kriterien ab: Preview, Produktionsdatenbank, Produktions-Worker, Domain, Benutzer/Rechte, Backup/Recovery, Security/Privacy, Migrationen, Deployment und Post-Deploy-Smoke.

`securityPrivacyReady` ist an den realen Security-Logging-Sink und die vollständige M5-Production-Evidence gebunden. `backupRecoveryReady` entsteht erst aus dem realen Recovery-Schritt. Die öffentliche Domain hängt ausdrücklich von beiden Schritten ab.

## Harte Sicherheitsgrenzen

- Repository-Preflight besitzt keinen Execute-/Provision-/Deploy-Pfad.
- `providerWritesEnabled=false`.
- Die Inventur allein macht keinen Provider-Write freigabefähig.
- Eintritt in die Produktionsvorbereitung benötigt separate Gate-Evidence; der aktuelle reine Inventarreader konsumiert sie nicht und bleibt daher blockiert.
- Jeder mutierende Vorbereitungsschritt benötigt eine ausdrückliche Freigabe.
- Vor M4/M5 gibt es kein öffentliches Production-Ingress.
- Domain-Auswahl und Domain-Aktivierung sind getrennt.
- Production Ready setzt M4 und M5 voraus.
- Release setzt Production Ready plus separate Release-Freigabe voraus.
- Secretwerte sind kein Repository-Input.
- Drift in App-, DB-, Runtime-/Binding-, Permission-, Logging-, Step- oder M6-Verträgen blockiert fail-closed.

## Bewusst noch nicht ausgeführt

Dieser Slice ist ausschließlich Vorbereitung. Es wurde keine ULC-Produktionsdatenbank, kein Worker, kein Binding, kein Logging-Sink, keine Domain, kein Secret, keine produktive Migration, kein Restore, kein Produktions-Smoke und kein Release ausgeführt.
