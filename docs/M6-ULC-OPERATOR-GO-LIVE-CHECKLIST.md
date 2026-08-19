# M6 – ULC Linz Operator Go-Live Checklist

Stand: 2026-08-19

## Zweck

Dieser Laufzettel verdichtet den aktuell vorbereiteten ULC-M6-Pfad für den ersten realen Produktionsdurchlauf. Er ist **kein Execute-Script, keine Produktionsfreigabe und kein zweiter Provisionierer**.

Verbindlich bleibt:

- `createAppSkeleton()` ist der kanonische Generator-/Publikationspfad.
- Preview und Produktion bleiben getrennte Lebenszyklen.
- Provider-IDs, Datenbankadressen, Connection Strings und Secretwerte bleiben außerhalb normaler Factory-/Evidence-Ausgaben.
- Jeder mutierende Produktions-/Provider-Schritt benötigt eine neue ausdrückliche Nutzerfreigabe.
- Nach jedem mutierenden Schritt wird der tatsächliche Zustand read-only geprüft, bevor der nächste Write freigegeben wird.
- Diese Datei ist keine dauerhafte Wahrheit: vor dem realen Durchlauf werden `main`, alle offenen PRs, der tatsächliche M5/M6-Head, CI/Reviews und Providerzustand frisch geprüft.

Der bei dieser Synchronisierung aktuelle technische #165-Stand besitzt **14 gepinnte Schritte** und enthält jetzt einen eigenen freigabepflichtigen Schritt für Production Security Logging. Damit ist die zuvor dokumentierte Logging-Sink-Ausführungslücke im aktuellen #165-Vertrag geschlossen. Vor realer Ausführung muss dieser Zustand erneut live bestätigt werden.

## Legende

- **READ** – read-only Prüfung.
- **INPUT** – Operatorentscheidung ohne Providerwrite.
- **WRITE** – externe/produktive Änderung; ausdrückliche Freigabe erforderlich.
- **DB-WRITE** – produktive Datenbankänderung; ausdrückliche Freigabe erforderlich.
- **DEPLOY** – Produktionsdeployment; ausdrückliche Freigabe erforderlich.
- **RESTORE-WRITE** – realer Recovery-/Restore-Test; ausdrückliche Freigabe erforderlich.
- **SMOKE-WRITE** – kontrollierter Produktions-Smoke mit möglichem Testdaten-Write; ausdrückliche Freigabe erforderlich.
- **RELEASE** – separate Produktionsfreigabe.
- **STOP** – fail-closed abbrechen.

## 0. Globales Start-Gate

Vor dem ersten Providerwrite müssen gemeinsam erfüllt sein:

- [ ] finaler Repository-/M5/M6-Stand eindeutig,
- [ ] vollständige literal Exact-Head-CI grün,
- [ ] erforderliche finale Reviews abgeschlossen,
- [ ] keine offenen relevanten Review-Threads/Blocker,
- [ ] M3, M4 und M5 als erforderliche Vorgates tatsächlich erfüllt,
- [ ] M6-Preflight weiterhin `providerWriteAllowed=false` / `executionAuthorized=false`,
- [ ] Providerzustand frisch read-only geprüft,
- [ ] keine kollidierenden Produktionsressourcen vorhanden,
- [ ] keine Secretwerte in Chat, Repository, Tickets, Screenshots, Logs oder Evidence,
- [ ] Nutzer hat **genau den nächsten konkreten mutierenden Schritt** ausdrücklich freigegeben.

Fehlt ein Punkt: **STOP**.

## 1. Neon-Produktionsdatenbank Frankfurt

**Klasse:** READ → WRITE

Vorher:

- [ ] vollständige Neon-Inventur im späteren Create-Org-Scope,
- [ ] Frankfurt `aws-eu-central-1` autoritativ verfügbar,
- [ ] keine exakte oder plausible ULC-Production-Kollision,
- [ ] Create-Pfad kann die Region explizit setzen,
- [ ] Plan/Kostenrahmen manuell akzeptiert,
- [ ] Nutzerfreigabe für genau diesen Create-Write.

Danach READ:

- [ ] dedizierte ULC-Production-Ressource,
- [ ] Region autoritativ Frankfurt,
- [ ] eindeutige Project-/Branch-/Database-Bindung,
- [ ] keine Credentials/Connection Strings in normaler Evidence,
- [ ] Backup-/TLS-/Encryption-Fähigkeiten für die konkrete Ressource erfassbar.

Abweichung: **STOP**.

## 2. Dedizierten Produktions-Worker anlegen

**Klasse:** READ → WRITE

Vorher:

- [ ] eindeutiger kollisionsfreier Worker,
- [ ] `workers.dev=false`,
- [ ] Preview URLs aus,
- [ ] `publicIngress=false`,
- [ ] Nutzerfreigabe für den Worker-Write.

Danach READ:

- [ ] eigener Production-Worker vorhanden,
- [ ] kein öffentlicher Zwischenzustand,
- [ ] keine unerwartete Domain/Route/Preview-URL.

Öffentlicher Zwischenzustand: **STOP**.

## 3. Produktionsdatenbank-Binding herstellen

**Klasse:** READ → WRITE

Vorher:

- [ ] Neon-Evidence gehört exakt zu Schritt 1,
- [ ] Worker-Evidence gehört exakt zu Schritt 2,
- [ ] `HYPERDRIVE` wird als Binding behandelt,
- [ ] keine Preview-/Test-DB wird gebunden,
- [ ] Nutzerfreigabe für den Binding-Write.

Danach READ:

- [ ] exakt erwartete Production-DB-Bindung,
- [ ] Resource-Binding-Consumer akzeptiert den Snapshot fail-closed,
- [ ] keine Provider-ID/DB-Adresse/Connection String in normalem Output.

Mismatch: **STOP**.

## 4. Produktions-Domain auswählen

**Klasse:** INPUT – noch kein Providerwrite

- [ ] gewünschten Produktionshostname festlegen,
- [ ] Domain-/DNS-Kontrolle bestätigen,
- [ ] bestehende Belegung prüfen,
- [ ] kanonischen HTTPS-Origin festlegen,
- [ ] Origin wird später exakt `APPBASIS_BASE_URL`,
- [ ] noch keine Domain aktivieren und keinen Public Ingress öffnen.

Unklarer Host: **STOP vor Schritt 10**.

## 5. Runtime-Konfiguration setzen

**Klasse:** WRITE

Aktueller Runtimevertrag:

- `HYPERDRIVE` – Binding,
- `APPBASIS_BASE_URL` – kontrollierte Konfiguration,
- `BETTER_AUTH_SECRET` – Secret; Wert niemals dokumentieren.

Vorher:

- [ ] Verantwortliche für Production-Secrets festgelegt,
- [ ] Secret außerhalb von Chat/Repository/Evidence erzeugt,
- [ ] Origin aus Schritt 4 eindeutig,
- [ ] Nutzerfreigabe für Runtime-Konfigurations-/Secret-Writes.

Danach READ:

- [ ] erwartete Binding-/Konfigurationsnamen vorhanden,
- [ ] keine Secretwerte sichtbar,
- [ ] keine unerwartete zusätzliche Production-Konfiguration.

## 6. Production Security Logging einrichten

**Klasse:** WRITE

Dieser Schritt ist im aktuellen #165-Vertrag ausdrücklich vorhanden und muss vor Worker-Deploy und vor M5-Production-Evidence liegen.

Vorher:

- [ ] konkreter Logging-Sink/Exportweg bewusst ausgewählt,
- [ ] strukturierte Security-Events unterstützt,
- [ ] geschützter operativer Zugriff definiert,
- [ ] exakt 12 Monate Retention technisch/providerseitig möglich,
- [ ] vollständiges Sink-Inventar möglich,
- [ ] keine öffentliche Read-API,
- [ ] Kosten/Plan akzeptiert,
- [ ] DPA/AVV, Datenregion, Subprozessoren und Transfers bewertet,
- [ ] erforderliche Logging-Credentials/Secrets sicher außerhalb des Repository verwaltet,
- [ ] Nutzerfreigabe für genau diesen Logging-/Delivery-Write.

Danach READ:

- [ ] reale ULC-Production-Sink-Bindung eindeutig,
- [ ] strukturierte Event-Erfassung aktiv,
- [ ] operativer Zugriff geschützt,
- [ ] Retention exakt 12 Monate belegt,
- [ ] Sink-/Destination-Inventar vollständig,
- [ ] keine öffentliche Read-API,
- [ ] Delivery-/Destination-Health geprüft,
- [ ] keine Secret-/personenbezogene Payload-Leakage.

Unvollständige Logging-Evidence: **STOP**.

## 7. Kontrollierte Produktionsmigrationen

**Klasse:** DB-WRITE

Vorher:

- [ ] exakter freigegebener App-/DB-Manifest-/Migrationsstand,
- [ ] Ziel eindeutig die eigene ULC-Produktionsdatenbank,
- [ ] Backup-/Recovery-Precheck grün,
- [ ] Recovery-/Rollback-Pfad dokumentiert,
- [ ] keine Schema-/Migrationsdrift,
- [ ] Nutzerfreigabe für die konkrete Produktionsmigration.

Danach READ:

- [ ] erwartete Migrationen vollständig angewendet,
- [ ] kein unbekannter Schema-Drift,
- [ ] Ergebnis und Recovery-Referenz ohne Credentials dokumentiert.

Fehler/Teilzustand: **STOP**.

## 8. Produktions-Worker deployen – weiterhin ohne Public Ingress

**Klasse:** DEPLOY

Vorher:

- [ ] finaler Runtime-Head bekannt,
- [ ] literal Exact-Head-CI grün,
- [ ] Worker-Ingress geschlossen,
- [ ] DB-/Runtime-/Logging-Bindings entsprechen dem freigegebenen Snapshot,
- [ ] Nutzerfreigabe für das Produktionsdeployment.

Danach READ:

- [ ] deployter Runtimevertrag entspricht dem freigegebenen Head,
- [ ] Worker weiterhin nicht öffentlich erreichbar,
- [ ] keine unerwarteten Bindings/Telemetry-/Persistenzdienste.

## 9. Produktive Benutzer & Rechte provisionieren

**Klasse:** DB-WRITE / privilegierter Write

Vorher:

- [ ] ausschließlich bestehende Root-Admin-/Principal-Access-/Permission-Provisioning-Verträge,
- [ ] keine Default-Principal-Zuweisungen,
- [ ] Organisation/Rolle/Scope eindeutig,
- [ ] Least Privilege unverändert,
- [ ] Nutzerfreigabe für den privilegierten Production-Write.

Danach READ:

- [ ] produktive Benutzer-/Rollen-/Scope-Evidence,
- [ ] Last-Admin-/Required-Role-Holder-Schutz intakt,
- [ ] keine Cross-Org- oder unbekannte Capability-Zuweisung.

## 10. Öffentliche Domain / Ingress aktivieren

**Klasse:** WRITE – separates Public-Ingress-Gate

Vorher:

- [ ] Domain aus Schritt 4 endgültig bestätigt,
- [ ] Runtime/DB/Logging/Benutzer-Konfiguration aus Schritten 1–9 geprüft,
- [ ] keine zweite unbeabsichtigte öffentliche Origin,
- [ ] `workers.dev` und Preview URLs bleiben aus,
- [ ] Nutzerfreigabe für die Domain-/Ingress-Aktivierung.

Danach READ:

- [ ] exakt freigegebener HTTPS-Origin öffentlich,
- [ ] Route zeigt auf den dedizierten ULC-Production-Worker,
- [ ] keine Preview-/Test-Domain als Produktion,
- [ ] `APPBASIS_BASE_URL` entspricht exakt dem freigegebenen Origin.

## 11. M5-Production-Evidence erheben

**Klasse:** READ

- [ ] F/G/H-Evidence aus derselben realen Production-Resource-Binding-Sicht/Fingerprint,
- [ ] Freshness-/Gültigkeitsfenster eingehalten,
- [ ] Logging-Sink + geschützter Zugriff + exakt 12 Monate Retention real belegt,
- [ ] Neon Frankfurt, DPA/Account-Bindung, Verschlüsselung, Subprozessoren/Transfers und Datenflüsse real belegt,
- [ ] Control-Plane-/Ingress-Snapshot aktuell und geschützt,
- [ ] keine Fixtures/Dokumentationswerte als Production-Evidence,
- [ ] M5-J nur bei vollständiger kanonischer Evidence 12/12.

M5 < 12/12: **STOP – Security & Privacy Ready bleibt offen.**

## 12. Backup-/Recovery-Validierung mit realem Restore

**Klasse:** RESTORE-WRITE + READ-Evidence

Vorher:

- [ ] Restore-Ziel eindeutig isoliert von Produktion,
- [ ] Kosten-/Providerwirkung bekannt,
- [ ] Nutzerfreigabe für realen Restore-/Recovery-Validation-Write.

Danach:

- [ ] eigener kontrollierter Backup-/Restore-Nachweis,
- [ ] Datenintegrität geprüft,
- [ ] Auth geprüft,
- [ ] Permissions geprüft,
- [ ] Application-Smoke geprüft,
- [ ] Restore-Reconciliation für bereits gelöschte/retention-gesteuerte Daten geprüft.

### Bekannte Architekturgrenze

Der aktuelle ULC-Lifecycle schützt Restore-Reconciliation über einen 35-Tage-Löschmarker-/Tombstone-Horizont. Wenn der reale Backup-/Snapshot-Horizont Wiederherstellungen ermöglicht, die diese Schutzgrenze überschreiten, muss die Architektur **vor Production Ready** bewusst neu bewertet bzw. gehärtet werden.

Restore nicht erfolgreich oder Horizon-Mismatch ungeklärt: **STOP**.

## 13. Post-Deploy-Smokes

**Klasse:** SMOKE-WRITE gegen reale Production

Vorher:

- [ ] genauer Smoke-Umfang bekannt,
- [ ] kontrollierte Testdaten/-writes definiert,
- [ ] Cleanup-/Reconciliation-Verhalten geklärt,
- [ ] keine echten Nutzerdaten unnötig verändert,
- [ ] Nutzerfreigabe für den Production-Smoke-Write.

Mindestens:

- [ ] Health,
- [ ] Auth,
- [ ] Permissions / deny-by-default,
- [ ] Application-Verhalten,
- [ ] Logging-/Telemetry-Delivery gesund,
- [ ] keine Secrets/Providerdetails in Antworten/Logs,
- [ ] keine unerwartete öffentliche Control Plane,
- [ ] Smoke-Testdaten nachvollziehbar bereinigt bzw. eindeutig als Test-Evidence behandelt.

Relevanter Fehler: **STOP**.

## 14. Explizites Release-Gate

**Klasse:** RELEASE

Auch wenn alle technischen Nachweise vollständig sind:

- [ ] `releaseAuthorized` bleibt bis zur separaten Freigabe false,
- [ ] alle zehn kanonischen M6-Kriterien aktuell und real belegt,
- [ ] M5 Security & Privacy weiterhin gültig,
- [ ] Backup/Restore weiterhin gültig,
- [ ] keine offene relevante Review-/Security-/Privacy-/Recovery-Frage,
- [ ] tatsächlicher Providerzustand unmittelbar vor Release erneut read-only geprüft,
- [ ] Nutzer gibt **die Produktionsfreigabe selbst** ausdrücklich frei.

Kein Auto-Release.

## Sichere manuelle Entscheidungen, die vorgezogen werden können

Ohne Providerwrite können vorbereitet werden:

- [ ] gewünschter Produktionshostname,
- [ ] wer Production-Secrets verwalten darf,
- [ ] konkreter Security-Logging-Sink inklusive Kosten, DPA/AVV, Region, Subprozessoren und 12-Monats-Retention,
- [ ] Neon-Plan und regionsfähiger Frankfurt-Create-Pfad,
- [ ] Verantwortliche für Provider-/Subprozessor-Änderungsbeobachtung.

Diese Entscheidungen autorisieren **keinen** Providerwrite.

## Operator-Abschlussregel

Nach jedem mutierenden Schritt:

1. nicht automatisch fortfahren,
2. tatsächlichen Provider-/Produktionszustand read-only verifizieren,
3. Evidence sanitisieren und sichern,
4. Abweichungen fail-closed stoppen,
5. erst dann die nächste erforderliche ausdrückliche Freigabe einholen.
