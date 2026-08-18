# M6 – ULC Linz Operator Go-Live Checklist

Stand: 2026-08-18

## Zweck

Diese kurze Checkliste ist der **Operator-Laufzettel** für den ersten realen ULC-Produktionsdurchlauf. Sie verdichtet die bestehenden M5/M6-Preflights und den aktuellen technischen #165-Pfad zu Freigabe-, Stop- und Evidence-Punkten.

Sie ist **kein Execute-Script, keine Produktionsfreigabe und kein zweiter Provisionierer**. Der kanonische Generator-/Publikationspfad bleibt `createAppSkeleton()`. Reale Writes dürfen nur nach neuer ausdrücklicher Nutzerfreigabe erfolgen.

Vor jedem realen Durchlauf zuerst:

- aktuellen `main`-Head, alle offenen PRs und den tatsächlich freigegebenen M5/M6-Integrationshead prüfen,
- vollständige CI und finalen Review-/Merge-Stand verifizieren,
- Providerzustand frisch read-only prüfen,
- sicherstellen, dass keine ältere Checkliste einen aktuelleren Code-/Providervertrag überschreibt.

## Legende

- **READ** – read-only Prüfung, kein Providerwrite.
- **INPUT** – Operatorentscheidung ohne Providerwrite.
- **WRITE** – externe/produktive Änderung; ausdrückliche Freigabe erforderlich.
- **DB-WRITE** – produktive Datenbankänderung; ausdrückliche Freigabe erforderlich.
- **DEPLOY** – Produktionsdeployment; ausdrückliche Freigabe erforderlich.
- **RESTORE-WRITE** – Recovery-/Restore-Validierung mit realer externer Änderung; ausdrückliche Freigabe erforderlich.
- **SMOKE-WRITE** – kontrollierter Produktions-Smoke, der produktiven Zustand verändern kann; ausdrückliche Freigabe erforderlich.
- **RELEASE** – öffentliche Produktionsfreigabe; eigene ausdrückliche Freigabe erforderlich.
- **STOP** – fail-closed abbrechen, nichts „zurechtinterpretieren“.

## 0. Globales Start-Gate

Vor dem ersten Providerwrite müssen gemeinsam erfüllt sein:

- [ ] finaler Repository-/M5/M6-Stand eindeutig und grün,
- [ ] M5-/M6-Preflight erfolgreich, aber weiterhin `providerWriteAllowed=false` / `executionAuthorized=false`,
- [ ] Nutzer hat **genau den nächsten konkreten mutierenden Schritt** ausdrücklich freigegeben,
- [ ] keine Kosten-/Plan-/Providerannahme wurde stillschweigend getroffen,
- [ ] keine Secretwerte befinden sich in Chat, Repository, Ticket, Screenshot, Log oder Evidence-Dokument,
- [ ] Produktions- und Preview-Ressourcen bleiben eindeutig getrennt.

Fehlt ein Punkt: **STOP**.

## Bekannter Vor-Ausführungs-Blocker – Production Security Logging

Der aktuelle technische #165-Plan pinnt 13 Schritte und verlangt in Schritt 10 reale M5-F-Evidence für den Production-Security-Logging-Sink. Gleichzeitig enthält der aktuell gepinnte 13-Schritte-Vertrag **keinen eigenen mutierenden Schritt**, der diesen Production-Sink bzw. die Cloudflare-Ausleitung mit ausdrücklicher Freigabe anlegt oder konfiguriert; `runtime-configuration` ist aktuell auf `BETTER_AUTH_SECRET`, `APPBASIS_BASE_URL` und `HYPERDRIVE` begrenzt.

Daher gilt vor einem echten Produktionslauf:

- [ ] **STOP**, solange der finale M6-Vertrag nicht eindeutig festlegt, in welchem mutierenden, freigabepflichtigen Schritt der reale Logging-Sink und seine Ausleitung bereitgestellt werden,
- [ ] der Schritt muss 12-Monats-Retention, geschützten Zugriff, DPA/AVV-/Subprozessor-/Transferbewertung und vollständige Production-Bindung berücksichtigen,
- [ ] keine spontane manuelle Providerkonfiguration außerhalb des gepinnten Ausführungsplans,
- [ ] keine M5-F-Evidence behaupten, bevor der reale Sink existiert und read-only verifiziert wurde.

Dieser Punkt ist eine **Integrationslücke vor Ausführung**, keine Berechtigung, #165 in diesem Vorbereitungsstrang parallel umzubauen.

## 1. Neon-Produktionsdatenbank Frankfurt – erster Providerwrite

**Klasse:** READ → WRITE

### Unmittelbar davor

- [ ] Providerinventur frisch und vollständig aus exakt demselben Organisations-/Create-Scope lesen.
- [ ] Evidence höchstens 15 Minuten alt bzw. innerhalb des aktuell gültigen Preflight-Fensters.
- [ ] keine exakte oder plausibel kollidierende ULC-Produktionsressource vorhanden.
- [ ] ausgewählte Create-Methode kann die Region **explizit** setzen.
- [ ] Zielregion exakt `aws-eu-central-1` / Frankfurt.
- [ ] Provider-Default-Region wird nicht verwendet.
- [ ] gewünschter Neon-Plan/Kostenrahmen manuell akzeptiert.
- [ ] Nutzer gibt **diesen Neon-Create-Write** ausdrücklich frei.

**Wichtig:** Der bei Erstellung dieses Dokuments bekannte vereinfachte Neon-Create-Connector exponiert keine explizite Regionswahl und ist daher für den echten Frankfurt-Create **nicht zulässig**. Vor Ausführung den dann verfügbaren Create-Pfad erneut verifizieren.

### Danach read-only belegen

- [ ] dedizierte Production-Zuordnung `ulc-linz` / `production`,
- [ ] Region autoritativ Frankfurt,
- [ ] eindeutige Project-/Branch-/Database-Bindung,
- [ ] keine Connection Strings/Credentials im normalen Evidence-Output,
- [ ] Verschlüsselungs-/TLS-/Backup-Fähigkeiten für die konkrete Ressource erfassbar.

Abweichung oder Mehrdeutigkeit: **STOP**.

## 2. Dedizierten Produktions-Worker anlegen – noch ohne öffentlichen Ingress

**Klasse:** READ → WRITE

### Unmittelbar davor

- [ ] dedizierter Zielworker eindeutig und kollisionsfrei,
- [ ] `workers.dev = false`,
- [ ] Preview URLs = false,
- [ ] `publicIngress = false`,
- [ ] geschlossener Ingress ist **vor Upload von ULC-Anwendungscode** festgelegt,
- [ ] Nutzer gibt den Worker-Create/initialen Providerwrite ausdrücklich frei.

### Danach read-only belegen

- [ ] eigener Produktions-Worker vorhanden,
- [ ] kein `workers.dev`, keine Preview-URL, keine Custom-Domain/Route als unbeabsichtigter Zwischenzustand,
- [ ] noch keine öffentliche Erreichbarkeit.

Öffentlicher Zwischenzustand: **STOP**.

## 3. Produktionsdatenbank-Binding herstellen

**Klasse:** READ → WRITE

### Unmittelbar davor

- [ ] Neon-Evidence aus Schritt 1 ist noch gültig und gehört zur exakt freigegebenen Ressource,
- [ ] Worker-Evidence aus Schritt 2 gehört zur exakt freigegebenen Runtime,
- [ ] `HYPERDRIVE` wird als Binding behandelt, nicht als Secretname,
- [ ] keine Preview-/Test-DB wird gebunden,
- [ ] Nutzer gibt den Binding-Write ausdrücklich frei.

### Danach read-only belegen

- [ ] genau eine erwartete Production-DB-Bindung,
- [ ] Resource-Binding-Consumer akzeptiert den Snapshot fail-closed,
- [ ] keine Provider-ID, DB-Adresse oder Connection String gelangt in normale Factory-/M5-/M6-Ausgaben.

Mismatch: **STOP**.

## 4. Produktions-Domain auswählen

**Klasse:** INPUT – **noch kein Providerwrite**

- [ ] gewünschten öffentlichen Produktionshostname festlegen,
- [ ] Domain/DNS-Kontrolle bestätigen,
- [ ] prüfen, ob der Host bereits belegt ist,
- [ ] HTTPS-Origin festlegen, der später exakt `APPBASIS_BASE_URL` wird,
- [ ] Operator bestätigt diese Auswahl als Input für die späteren freigabepflichtigen Schritte,
- [ ] noch **keine** Domain aktivieren und noch **keinen** öffentlichen Ingress öffnen.

Ungeklärter Host: **STOP vor Schritt 9**.

## 5. Runtime-Konfiguration setzen

**Klasse:** WRITE

Aktueller Runtimevertrag:

- `HYPERDRIVE` – Binding, **kein Secret**,
- `APPBASIS_BASE_URL` – freigegebener HTTPS-Origin, kein Secret,
- `BETTER_AUTH_SECRET` – Secret; Wert niemals dokumentieren.

### Unmittelbar davor

- [ ] verantwortliche Person für Production-Secrets festgelegt,
- [ ] Secret wird außerhalb von Chat/Repository/Evidence erzeugt und gesetzt,
- [ ] Origin aus Schritt 4 ist eindeutig,
- [ ] Nutzer gibt die Runtime-Konfigurations-/Secret-Writes ausdrücklich frei.

### Danach read-only belegen

- [ ] erwartete Binding-/Konfigurationsnamen vorhanden,
- [ ] keine Secretwerte lesbar dokumentiert,
- [ ] keine zusätzliche nicht inventarisierte Production-Konfiguration.

## 6. Kontrollierte Produktionsmigrationen

**Klasse:** DB-WRITE

### Unmittelbar davor

- [ ] exakter freigegebener App-/DB-Manifest- und Migrationsstand bekannt,
- [ ] Ziel ist eindeutig die eigene ULC-Produktionsdatenbank,
- [ ] Backup-/Recovery-Precheck grün,
- [ ] Recovery-/Rollback-Pfad dokumentiert und realistisch ausführbar,
- [ ] keine unerwartete Schema-/Migrationsdrift,
- [ ] Nutzer gibt **die konkrete Produktionsmigration** ausdrücklich frei.

### Danach read-only belegen

- [ ] erwartete Migrationen vollständig angewendet,
- [ ] kein unbekannter/zusätzlicher Schema-Drift,
- [ ] Migrationsergebnis und Recovery-Referenz dokumentiert, ohne Credentials/DB-Adressen offenzulegen.

Fehler/Teilzustand: **STOP**, keine improvisierte Fortsetzung.

## 7. Worker deployen – weiterhin ohne öffentliche Domain-Aktivierung

**Klasse:** DEPLOY

### Unmittelbar davor

- [ ] finaler freigegebener Runtime-Head bekannt,
- [ ] vollständige Exact-Head-CI grün,
- [ ] Worker-Ingress weiterhin geschlossen,
- [ ] DB-/Runtime-Bindings entsprechen dem freigegebenen Produktionssnapshot,
- [ ] Nutzer gibt das Produktionsdeployment ausdrücklich frei.

### Danach read-only belegen

- [ ] deployter Runtimevertrag entspricht dem freigegebenen Head,
- [ ] Worker weiterhin nicht öffentlich erreichbar,
- [ ] keine unerwarteten Bindings/Telemetry-/Persistenzdienste hinzugekommen.

## 8. Produktive Benutzer & Rechte provisionieren

**Klasse:** DB-WRITE / privilegierter Write

- [ ] ausschließlich bestehende Root-Admin-/Principal-Access-/Permission-Provisioning-Verträge verwenden,
- [ ] keine Default-Principal-Zuweisungen erfinden,
- [ ] Organisation/Rolle/Scope eindeutig festlegen,
- [ ] Least-Privilege-Vertrag unverändert,
- [ ] Nutzer gibt diesen privilegierten Produktionswrite ausdrücklich frei.

Danach:

- [ ] produktive Benutzer-/Rollen-/Scope-Evidence read-only prüfen,
- [ ] Last-Admin-/Required-Role-Holder-Schutz weiterhin intakt,
- [ ] keine Cross-Org- oder unbekannte Capability-Zuweisung.

## 9. Öffentliche Domain / Ingress aktivieren

**Klasse:** WRITE – separates Public-Ingress-Gate

Dieser Schritt ist bewusst getrennt von Worker-Create und Deployment.

### Unmittelbar davor

- [ ] Domain aus Schritt 4 endgültig bestätigt,
- [ ] Runtime/DB/Benutzer-Konfiguration aus Schritten 1–8 geprüft,
- [ ] keine zweite unbeabsichtigte öffentliche Origin-Möglichkeit,
- [ ] `workers.dev` und Preview URLs bleiben aus,
- [ ] Nutzer gibt **die öffentliche Domain-/Ingress-Aktivierung separat** ausdrücklich frei.

### Danach read-only belegen

- [ ] genau der freigegebene HTTPS-Origin ist öffentlich,
- [ ] Route zeigt auf den dedizierten ULC-Produktions-Worker,
- [ ] keine Preview-/Test-Domain als Produktion,
- [ ] `APPBASIS_BASE_URL` entspricht exakt dem freigegebenen Origin.

## 10. M5-Production-Evidence erheben

**Klasse:** READ

- [ ] F/G/H-Evidence stammt aus derselben realen Production-Resource-Binding-Sicht bzw. dem verlangten gemeinsamen Fingerprint,
- [ ] Freshness-/Gültigkeitsfenster eingehalten,
- [ ] Logging-Sink, geschützter Zugriff und exakt 12 Monate Retention real belegt,
- [ ] Neon Frankfurt, DPA/Account-Bindung, Verschlüsselung, Subprozessoren/Transfers und Datenflüsse real belegt,
- [ ] Control-Plane-/Ingress-Snapshot aktuell und geschützt,
- [ ] keine Fixture-/Dokumentationswerte werden als Production-Evidence akzeptiert,
- [ ] M5-J ergibt nur bei vollständiger kanonischer Evidence 12/12.

M5 < 12/12: **STOP – Production Ready bleibt false.**

## 11. ULC-spezifisches Backup-/Recovery-Gate mit realem Restore

**Klasse:** RESTORE-WRITE + READ-Evidence

### Unmittelbar davor

- [ ] Restore-Ziel und etwaige dafür nötige Providerressource sind eindeutig isoliert von Produktion,
- [ ] Kosten-/Providerwirkung des Restore-Vorgangs bekannt,
- [ ] Nutzer gibt den realen Restore-/Recovery-Validation-Write ausdrücklich frei.

### Danach belegen

- [ ] eigener kontrollierter Backup-/Restore-Nachweis für diese Produktions-App,
- [ ] isoliertes Restore-Ziel, nicht die Produktionsdatenbank,
- [ ] Datenintegrität geprüft,
- [ ] Auth geprüft,
- [ ] Permissions geprüft,
- [ ] Application-Smoke geprüft,
- [ ] Restore-Reconciliation für bereits gelöschte/retention-gesteuerte Daten geprüft.

### Bekannter Stop-Punkt

Der aktuelle ULC-Lifecycle schützt Restore-Reconciliation über einen 35-Tage-Löschmarker-/Tombstone-Horizont. Wenn der tatsächliche Backup-/Snapshot-Horizont ältere Wiederherstellungen zulässt, die diese Schutzgrenze überschreiten, muss die Architektur **vor Production Ready** bewusst neu bewertet bzw. gehärtet werden. Nicht durch Dokumentation übergehen.

Realer Restore nicht erfolgreich: **STOP**.

## 12. Post-Deploy-Smokes

**Klasse:** SMOKE-WRITE gegen reale Production

Der aktuelle #165-Vertrag klassifiziert diesen Schritt bewusst als `production-smoke-write` und verlangt ausdrückliche Freigabe.

### Unmittelbar davor

- [ ] genauer Smoke-Umfang und erwartete kontrollierte Testdaten/-writes bekannt,
- [ ] Cleanup-/Reconciliation-Verhalten für erzeugte Testdaten geklärt,
- [ ] keine echten Nutzer-/Produktionsdaten werden unnötig verändert,
- [ ] Nutzer gibt den Production-Smoke-Write ausdrücklich frei.

### Ausführen und belegen

Mindestens:

- [ ] Health,
- [ ] Auth,
- [ ] Permissions/deny-by-default,
- [ ] Application-Verhalten.

Zusätzlich prüfen:

- [ ] keine Secrets/Providerdetails in Antworten/Logs,
- [ ] keine unerwartete öffentliche Control Plane,
- [ ] Logging-/Telemetry-Delivery gesund,
- [ ] relevante Denials bleiben fail-closed,
- [ ] kontrollierte Smoke-Testdaten sind nachvollziehbar und werden gemäß freigegebenem Vertrag bereinigt bzw. eindeutig als Test-Evidence behandelt.

Jeder relevante Smoke-Fehler: **STOP**, keine Freigabe.

## 13. Explizites Release-Gate

**Klasse:** RELEASE

Auch wenn alle technischen M6-Kriterien vollständig belegt sind:

- [ ] `releaseAuthorized` bleibt bis zur separaten Freigabe false,
- [ ] alle zehn kanonischen M6-Kriterien sind aktuell und real belegt,
- [ ] M5 Production Ready ist weiterhin gültig,
- [ ] keine offene relevante Review-/Security-/Privacy-/Recovery-Frage,
- [ ] tatsächlicher Providerzustand unmittelbar vor Release nochmals read-only geprüft,
- [ ] Nutzer gibt **die Produktionsfreigabe selbst** ausdrücklich frei.

Erst danach darf ein später dafür vorgesehener kontrollierter Release-Pfad die App als `Produktion freigegeben` markieren. Kein Auto-Release.

## Sichere manuelle Entscheidungen, die vorgezogen werden können

Diese Punkte können ohne Providerwrite vorbereitet werden:

- [ ] gewünschter Produktionshostname / Domain,
- [ ] wer Production-Secrets verwalten darf,
- [ ] konkreter Security-Logging-Sink inklusive Kosten, DPA/AVV, Datenregion, Subprozessoren und **exakt 12 Monaten Retention**,
- [ ] Neon-Plan und realer Create-Pfad, der eine explizite Frankfurt-Region unterstützt,
- [ ] verantwortliche Person für Provider-/Subprozessor-Änderungsbeobachtung.

Das Treffen dieser Entscheidungen **autorisiert noch keine Bestellung, Ressourcenerstellung oder Konfigurationsänderung**.

## Operator-Abschlussregel

Nach jedem mutierenden Schritt:

1. nicht sofort den nächsten mutierenden Schritt ausführen,
2. tatsächlichen Provider-/Produktionszustand read-only verifizieren,
3. erwartete Evidence sichern/sanitisieren,
4. Abweichungen fail-closed stoppen,
5. erst dann die nächste erforderliche ausdrückliche Freigabe einholen.

Damit bleibt der reale M6-Durchlauf kontrolliert, nachvollziehbar und ohne stillen Übergang von „technisch vorbereitet“ zu „produktiv freigegeben“.
