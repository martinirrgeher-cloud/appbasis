# Phase 2E7 – Reference Preview Deployment Contract

## Ziel

Die Reference-App besitzt einen reproduzierbaren, ausschließlich manuell ausgelösten Preview-Deployment-Pfad auf Cloudflare mit Neon/PostgreSQL und Hyperdrive. PostgreSQL ist die einzige Business-Permission-Authority. Die privilegierte Rollenadministration bleibt eine getrennte Control Plane und wird nicht in den normalen öffentlichen App-Worker eingebaut.

Der öffentliche Worker `appbasis-reference` ist der einzige öffentliche Einstiegspunkt. Er leitet ausschließlich `/api/admin/roles...` über das interne Service Binding `ROLE_ADMIN` an `appbasis-reference-role-admin` weiter. Der interne Worker implementiert den bereits vorhandenen `PostgresRoleAdministration`-Vertrag und bleibt ohne eigene öffentliche Ingress-Fläche.

## Verbindliche Runtime-Grenzen

### Öffentlicher Reference Worker

- Name: `appbasis-reference`.
- Der normale Worker enthält keinen `PostgresRoleAdministration`.
- Externer Admin-Gateway ausschließlich `/api/admin/roles` und `/api/admin/roles/...`.
- Der Gateway schreibt nur auf den internen Vertrag `/api/roles...` um und leitet Request, Cookie, HTTP-Methode, Query und Body über `ROLE_ADMIN.fetch(...)` weiter.
- Fehlt das Service Binding oder die konfigurierte `APPBASIS_BASE_URL`, antwortet der Gateway fail-closed mit `503`.
- `/api/roles` bleibt im normalen App-Worker kein öffentlicher Rollenendpunkt.
- Das Service Binding ist exakt `ROLE_ADMIN` → `appbasis-reference-role-admin`.

### Interner Role-Admin-Worker

- Name: `appbasis-reference-role-admin`.
- Entrypoint: `./worker/role-admin.ts`.
- `workers_dev: false`.
- `preview_urls: false`.
- keine `route` oder `routes` in der Repository-Konfiguration.
- keine ausgehenden Service Bindings.
- `keep_vars: false`.
- eigener `HYPERDRIVE`-Binding auf dieselbe persistente Reference-Datenbank.
- dieselbe kanonische `APPBASIS_BASE_URL` wie der öffentliche Worker.
- `BETTER_AUTH_SECRET` bleibt extern verwaltetes Cloudflare-Secret.
- der Worker authentifiziert die weitergeleitete Session selbst.
- der bestehende Admin-Vertrag verlangt weiterhin serverseitig `app:use` plus `users:manage`.
- Actor und Audit-Reason werden serverseitig bestimmt und nicht aus Browserfeldern vertraut übernommen.
- erfolgreiche Mutationen bleiben im bestehenden PostgreSQL-Vertrag transaktional auditiert.
- `/api/health` bleibt DB- und Secret-unabhängig; Rollenendpunkte bleiben ohne vollständige Runtime-Konfiguration fail-closed.

## Mutationsschutz / CSRF

`SameSite` allein ist für die privilegierte Control Plane kein ausreichender Mutationsschutz, weil Browser-Cookies auch in Same-Site-/Cross-Origin-Konstellationen relevant sein können. Deshalb verwendet Gateway **und** interner Admin-Worker denselben serverseitigen Mutationsschutz aus `apps/reference/worker/role-admin-request-security.ts`.

Für `POST`, `PUT` und `DELETE` gilt:

- ein gültiger `Origin`-Header ist verpflichtend;
- dessen normalisierte Origin muss exakt der konfigurierten `APPBASIS_BASE_URL` entsprechen;
- fehlende, `null`-, fremde oder ungültige Origins werden mit `403 INVALID_REQUEST_ORIGIN` abgewiesen;
- `POST` und `PUT` akzeptieren ausschließlich den Medientyp `application/json`; CORS-safelisted `text/plain` wird mit `415 UNSUPPORTED_MEDIA_TYPE` vor jedem Service-Binding-/Datenbankzugriff abgewiesen.

Read-only `GET` benötigt keinen `Origin`. Der Schutz läuft im öffentlichen Gateway **vor dem Forwarding** und zusätzlich im internen Admin-Worker **vor dem Öffnen der Datenbankverbindung**. Damit bleibt die Mutation auch dann geschützt, falls eine Provider-Ingress-Grenze später versehentlich aufweicht.

## Repository-Owned Worker-Variablen

Beide Source-Wrangler-Konfigurationen enthalten keine reale Provider-ID und keine Environment-spezifischen `vars`.

`tooling/reference-preview-deploy-config.mjs` rendert temporär:

- `apps/reference/wrangler.preview.generated.json`
- `apps/reference/wrangler.role-admin.preview.generated.json`

Die generierten Konfigurationen ergänzen ausschließlich:

- `HYPERDRIVE` mit der geschützten bestehenden Provider-ID.
- `APPBASIS_BASE_URL` als kanonische HTTPS-Origin aus `APPBASIS_PREVIEW_URL`.

Für beide Worker gilt `keep_vars: false`. Exakt `APPBASIS_BASE_URL` darf als unverschlüsseltes `plain_text` vorhanden sein. `APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS` und `APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS` sind sowohl als `plain_text` als auch als `json` verboten. Jedes `json`-Binding blockiert den Deploy-Abschluss. Auch jede andere unerwartete unverschlüsselte Variable blockiert den Deploy-Abschluss.

Worker-Secrets werden durch einen normalen Deploy unabhängig von `keep_vars` nicht gelöscht. `BETTER_AUTH_SECRET` wird im Workflow weder gelesen noch kopiert noch geloggt.

## Pre-existing Ressourcen

Der Workflow erstellt keine Cloudflare-, Hyperdrive- oder Datenbankressourcen. Vor einem echten Deploy müssen bereits existieren:

- `appbasis-reference`
- `appbasis-reference-role-admin`
- die bestehende Reference-Hyperdrive-Konfiguration
- die bestehende Reference-Preview-Datenbank

Für `appbasis-reference-role-admin` muss vor dem ersten echten Deploy derselbe `BETTER_AUTH_SECRET`-Sessionvertrag wie beim öffentlichen Reference Worker eingerichtet sein. Der Wert darf nie in Chat, Repository oder Workflow-Logs übertragen werden.

Deploy und Hyperdrive-Update laufen mit deaktiviertem Auto-Provisioning/Auto-Create. Fehlt eine erwartete Ressource, endet der Workflow vor dem Deployment.

## Persistente Permission-Authority vor Deployment

Vor jeder externen Deploy-Änderung wird der isolierte PostgreSQL-Permission-Authority-Verifier ausgeführt. Er muss den Schema-v3-Endzustand und die Reference-Systemzuordnungen bestätigen. Der historische Permission-Cutover bleibt ein separater expliziter Workflow und ist der einzige Pfad, der alte Allowlist-Bindings als Migrationsinput lesen darf.

Der technische Better-Auth-Admin bleibt fail-closed von AppBasis-Permissions getrennt.

## Remote-Binding-Authority

Nach dem Deploy des internen Workers liest der Workflow dessen reale Cloudflare-Settings. `tooling/reference-preview-worker-settings.mjs` akzeptiert ihn nur, wenn:

- exakt `APPBASIS_BASE_URL` als zulässiges `plain_text` vorhanden ist,
- kein `json`-Binding vorhanden ist,
- `BETTER_AUTH_SECRET` als `secret_text` vorhanden ist,
- exakt ein `HYPERDRIVE`-Binding namens `HYPERDRIVE` vorhanden ist,
- kein Service Binding vorhanden ist.

Nach dem Deploy des öffentlichen Workers akzeptiert derselbe Verifier diesen nur, wenn:

- exakt `APPBASIS_BASE_URL` als zulässiges `plain_text` vorhanden ist,
- kein `json`-Binding vorhanden ist,
- exakt ein Service Binding `ROLE_ADMIN` auf `appbasis-reference-role-admin` zeigt.

Damit gehört der tatsächlich deployte Remote-Zustand zum Gate.

## Remote-Ingress-Authority des Admin-Workers

Nur eine route-freie Repository-Konfiguration reicht nicht aus, weil Cloudflare-Ingress auch außerhalb der aktuellen Wrangler-Datei existieren kann. Deshalb prüft `tooling/reference-role-admin-ingress.mjs` den echten Cloudflare-Zustand **zweimal**:

1. **vor dem Upload des privilegierten Admin-Codes**, damit ein bereits öffentlich gerouteter Platzhalter-Worker nicht kurzzeitig den neuen Admin-Handler öffentlich erhält;
2. **nach dem Admin-Deploy**, damit deploymentseitige Änderungen ebenfalls erkannt werden.

Der Verifier verwendet ausschließlich accountweite Workers-APIs und hängt nicht von einer Liste token-sichtbarer Zonen ab:

- Worker-Subdomain-Status für `workers.dev` und Preview URLs;
- accountweite Worker-Custom-Domains gefiltert nach `service=appbasis-reference-role-admin`;
- accountweite Workers-Script-Liste, deren Script-Datensatz die dem Worker zugeordneten `routes` enthält.

Der Gate akzeptiert nur:

- `workers.dev` deaktiviert;
- Preview URLs deaktiviert;
- keine Custom Domain für `appbasis-reference-role-admin`;
- keine dem Worker zugeordnete Worker Route.

Eine unlesbare, erfolglose oder strukturell unerwartete Cloudflare-Antwort blockiert den Deploy fail-closed. Erst wenn der **post-deploy** Ingress-Check sauber ist, darf `appbasis-reference` mit dem neuen Gateway deployt werden.

Damit benötigt der Deployment-Token keine zonenbasierte Vollständigkeitsannahme für diesen Nachweis. Er muss die verwendeten accountweiten Workers-Script-, Subdomain- und Custom-Domain-Leseoperationen ausführen können; fehlende Rechte führen zu einem fail-closed Abbruch.

Der Security-Verifier selbst ist Teil des verpflichtenden `verify:preview-deploy`-Tests und damit Bestandteil von `verify:repo`/CI. Seine Fail-closed Fälle dürfen nicht als unentdeckte Root-Level-Testdatei außerhalb der CI-Discovery liegen.

## Gemeinsamer Session-Vertrag als Live-Gate

Nach erfolgreichem Deploy nutzt der Demo-v0.1-Acceptance-Smoke dieselbe `demo.user`-Session zusätzlich gegen `/api/admin/roles`.

`demo.user` besitzt persistent die Member-Rolle und kein `users:manage`. Daher muss der Admin-Gateway mit exakt `403 PERMISSION_DENIED` antworten. Das beweist gleichzeitig:

- Service Binding und Pfad-Weiterleitung funktionieren;
- derselbe Session-Cookie wird vom Admin-Worker verstanden;
- der interne Worker authentifiziert selbst;
- die Rollen-Control-Plane bleibt deny-by-default geschützt.

Ein abweichender Session-Secret-Vertrag würde nicht den erwarteten autorisierten 403-Pfad erreichen und lässt den Deploy fehlschlagen.

## Manueller Deployment-Ablauf

`Reference Preview Deploy` läuft nur über `workflow_dispatch` und die Concurrency-Gruppe `reference-preview-deploy`.

1. Repository auschecken, frozen install und vollständiges `verify:repo`.
2. Hyperdrive-ID und Preview-Origin validieren und maskieren.
3. beide ephemeren Wrangler-Konfigurationen rendern und fail-closed prüfen.
4. bestätigen, dass beide Worker bereits existieren.
5. persistente PostgreSQL-Permission-Authority prüfen.
6. Query-Caching der bestehenden Hyperdrive-Konfiguration deaktivieren.
7. Reference-App bauen.
8. **vor dem Admin-Upload** mit `tooling/reference-role-admin-ingress.mjs` jeden öffentlichen Admin-Ingress ausschließen.
9. internen `appbasis-reference-role-admin` deployen.
10. Remote-Bindings des internen Workers prüfen.
11. **nach dem Admin-Deploy** erneut jeden öffentlichen Admin-Ingress ausschließen.
12. erst jetzt den öffentlichen `appbasis-reference` mit `ROLE_ADMIN`-Binding deployen.
13. dessen Remote-Binding-Authority prüfen.
14. öffentlichen Health-Vertrag prüfen.
15. authentifizierten mutierenden Demo-v0.1-Smoke inklusive Admin-Gateway-403-Gate ausführen.
16. generierte Deployment-, Permission-Authority- und Settings-Artefakte immer entfernen.

## Harte Grenzen

- kein automatischer Deployment-Trigger auf PR oder `main`;
- keine automatische Erstellung oder Löschung von Cloudflare-, Hyperdrive- oder Datenbankressourcen;
- keine Runtime-Migration oder ad-hoc Datenbankadministration;
- keine Secrets, Datenbankadressen oder Provider-IDs im Repository;
- keine direkte Rollenadministration im normalen öffentlichen Reference Worker;
- keine öffentliche `workers.dev`-URL, Preview URL, Custom Domain oder Worker Route für `appbasis-reference-role-admin`;
- keine Role-Admin-Mutation ohne exakte Same-Origin-Prüfung;
- keine POST-/PUT-Role-Admin-Mutation mit CORS-safelisted `text/plain`;
- kein Browser-vertrauenswürdiger Audit-Actor;
- keine historischen Permission-Allowlist-Bindings;
- kein öffentlicher Gateway-Deploy, solange Admin-Bindings oder Admin-Ingress nicht vollständig sauber verifiziert sind;
- kein Wrangler Auto-Provisioning oder Auto-Create.

## Abnahme

Ein Slice ist erst mergefähig, wenn:

- normale Exact-Head-CI vollständig grün ist;
- `verify:preview-deploy` den Ingress-Verifier-Test tatsächlich ausführt;
- die getrennte Admin-Runtime und der enge Gateway vertraglich/testseitig gepinnt sind;
- Same-Origin-/JSON-Mutationsschutz am Gateway und internen Worker gepinnt ist;
- der Ingress-Verifier sowohl vor als auch nach dem Admin-Deploy aufgerufen wird;
- die Route-Prüfung aus der accountweiten Worker-Script-Autorität kommt und nicht aus token-sichtbaren Zonen;
- der bestehende Rollen-Autorisierungs- und Audit-Vertrag unverändert bleibt;
- der finale Codex-Review exakt den finalen Head ohne Blocking-Finding geprüft hat.
