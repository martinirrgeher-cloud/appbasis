# M6 – ULC Linz Produktions-Preflight

## Zweck

Dieser Slice bereitet den **konkreten ersten ULC-Linz-Produktionspfad** bis unmittelbar vor den ersten Provider-Write vor.

Er ist bewusst **keine allgemeine Provider-Orchestrierung**. Der erste reale M6-Verbraucher bleibt app-spezifisch; eine spätere Verallgemeinerung gehört erst in FC1.

Der Preflight:

- liest ausschließlich Repository-Verträge,
- erzeugt keine Providerressource,
- setzt kein Secret,
- führt keine Migration aus,
- deployed keinen Worker,
- aktiviert keine Domain,
- erzeugt keine Produktionsbenutzer,
- führt keinen Restore oder Smoke gegen Produktion aus,
- autorisiert keine Produktionsfreigabe.

Der normale Output bleibt deshalb:

`prepared-blocked-before-provider-write`

mit:

- `providerWriteAllowed = false`
- `releaseAuthorized = false`
- `explicitApprovalRequired = true`
- `requiredPrerequisiteGates = [M3_DONE, M4_DONE, M5_DONE]`
- `nextAction.executionAuthorized = false`

`requiredPrerequisiteGates` beschreibt nur die später zwingenden Gates. Der Repository-Preflight behauptet **nicht**, dass diese bereits live belegt sind. Ebenso wird nur der bestehende Runtime-/Resource-Binding-Validierungsvertrag geprüft; reale Production-Evidence wird in diesem Slice nicht konsumiert.

## Kanonische Verträge

Der Preflight baut ausschließlich auf bestehenden Verträgen auf:

- ULC-Zielpolicy / Neon-Zielregion Frankfurt
- `createExpectedUlcLinzDatabaseManifest()` für die reale Datenbankownership
- `createInitialTechnicalAdmin()` als bestehender fail-closed Identity-Bootstrap für einen leeren bzw. eng recoverable Identity-Store
- `replaceUlcLinzPrincipalAccess()` auf `PostgresPrincipalAccessAdministration` für die ULC-spezifische Rollen-/Override-Zuweisung
- ULC-M5-Permission-Provisioning-Bundle für Rollen/Capabilities
- `ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT` aus dem bestehenden #155-Pfad
- bestehender M6-Release-Readiness-Vertrag mit zehn Pflichtkriterien

Es entsteht keine zweite Generator-, Datenbank-, Identity-, Rollen-, Resource-Binding- oder Readiness-Implementierung.

## Produktziel

Für ULC v0.1 bleibt verbindlich:

- eigene dedizierte Neon-Produktionsdatenbank
- Neon-Region `aws-eu-central-1` / EU Frankfurt
- eigener Cloudflare-Produktions-Worker
- Standard Workers / globale transiente Verarbeitung
- ausdrücklich **kein EU-only-Claim**
- eigener Produktionshostname
- keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten ohne neue Bewertung
- Secrets außerhalb des Repository
- explizite Freigabe für jede produktive oder providerseitige Write-Grenze

## Geplanter kontrollierter Ablauf

1. **Neon-Produktionsdatenbank**
   - dedizierte Ressource
   - Frankfurt
   - erster Provider-Write
   - ausdrückliche Freigabe erforderlich

2. **Produktions-Worker anlegen**
   - dedizierter Cloudflare Worker
   - `workers.dev` aus
   - noch kein öffentliches Ingress

3. **Datenbank-Binding**
   - ULC-Worker an genau die dedizierte Produktionsdatenbank binden
   - bestehender #155-Resource-Binding-Vertrag bleibt spätere Evidence-Grenze

4. **Produktionsdomain auswählen**
   - nur Operator-Input
   - noch kein Provider-Write
   - noch kein öffentliches Ingress

5. **Runtime-Konfiguration / Secrets**
   - `BETTER_AUTH_SECRET` als Secret
   - `APPBASIS_BASE_URL` als kontrollierte Konfiguration
   - `HYPERDRIVE` als erforderliches Binding
   - keine Secretwerte im Repository, Chat oder Log

6. **Produktionsmigrationen**
   - ausschließlich aus `apps/ulc-linz/appbasis.database.json`
   - vorher Backup-/Recovery-Zustand prüfen
   - bei kritischer Migration möglichst Sicherung unmittelbar vorher
   - Recovery-/Rollback-Pfad vorab festlegen
   - Migration danach verifizieren

7. **Produktions-Worker deployen**
   - kanonischer Entrypoint `./worker/index.ts`
   - noch ohne öffentliche Domain-Aktivierung

8. **Produktive Benutzer & Rechte bootstrapen**
   - erster technischer Benutzer über bestehenden `createInitialTechnicalAdmin()`-Vertrag
   - nur für leeren bzw. eng recoverable Identity-Ausgangszustand
   - ULC-Rollen-/Override-Zuweisung über bestehenden `replaceUlcLinzPrincipalAccess()`-Pfad
   - darunter bestehender `PostgresPrincipalAccessAdministration`-Vertrag
   - ULC-M5-Permission-Provisioning-Bundle bleibt Rollen-/Capability-Basis
   - keine Default-Principal-Zuweisungen
   - reale Principal-Zuweisungen müssen explizit erfolgen
   - kein zweiter Provisioning-Vertrag wird eingeführt

9. **Produktionsdomain aktivieren**
   - eigener expliziter Public-Exposure-Write
   - erst nach Runtime-Konfiguration, Migration, Deployment und Access-Bootstrap
   - technische öffentliche Erreichbarkeit ist noch **keine** Produktionsfreigabe; `releaseAuthorized` bleibt bis zum finalen Gate `false`

10. **M5-Production-Evidence erheben**
    - read-only
    - reale ULC-Produktionsressourcen
    - bestehender #155-Resource-Binding-Consumer
    - finaler M5-All-required-/fail-closed-Pfad

11. **Backup & Recovery für ULC-Produktion validieren**
    - automatische Backups
    - Retention
    - PITR soweit verfügbar
    - realer Restore
    - Datenintegrität
    - Auth
    - Permissions
    - App-Smoke

12. **Post-Deploy-Smokes**
    - Health
    - Auth
    - Permissions
    - Application

13. **Release-Gate**
    - kein automatischer Release
    - ausdrückliche Nutzerfreigabe weiterhin zwingend

## M6-Kriterienabdeckung

Der Preflight muss exakt alle zehn bestehenden M6-Kriterien abdecken:

- Preview geprüft
- eigene Produktionsdatenbank
- eigener Produktions-Worker
- eigene Domain
- produktive Benutzer & Rechte
- Backup & Recovery
- Security & Privacy
- Produktionsmigrationen
- Produktionsdeployment
- Post-Deploy-Smoke

Ein Contract-Test vergleicht diese Abdeckung direkt mit `REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA`. Wird dort später ein Pflichtkriterium ergänzt oder entfernt, blockiert der Preflight fail-closed bis zur bewussten Anpassung.

Zusätzlich sind alle 13 Ausführungsschritte mit ihrer erwarteten Klasse gepinnt. Dependencies dürfen nur auf bereits vorherige Schritte zeigen. Eine spätere Umklassifizierung eines Provider-Writes in einen scheinbar read-only Schritt oder eine nach vorne gerichtete/zyklische Dependency wird dadurch fail-closed abgewiesen.

## Harte Sicherheitsgrenzen

- `evaluateUlcLinzM6ProductionPreflight()` besitzt **keinen Execute-/Provision-/Deploy-Pfad**.
- `providerWritesEnabled` bleibt `false`.
- Der erste reale Write ist eindeutig `neon-production-database`.
- Domain-Auswahl und öffentliche Domain-Aktivierung sind getrennt.
- Öffentliche Erreichbarkeit allein kann den Release nicht autorisieren.
- Jeder mutierende Schritt verlangt ausdrückliche Freigabe.
- Secretwerte sind kein Repository-Input.
- Der Release-Gate kann technisch nicht automatisch autorisieren.
- Fehlende oder driftende App-, Datenbank-, Runtime-/Binding-, Permission-, Step- oder M6-Verträge blockieren fail-closed.

## Bewusst noch nicht ausgeführt

Dieser Slice ist nur Vorbereitung. Insbesondere existiert aus diesem Slice heraus weiterhin **keine** neu angelegte ULC-Produktionsdatenbank, kein neuer Produktions-Worker, kein Produktions-Binding, keine aktivierte Domain, kein gesetztes Secret, keine produktive Migration und keine Produktionsfreigabe.
