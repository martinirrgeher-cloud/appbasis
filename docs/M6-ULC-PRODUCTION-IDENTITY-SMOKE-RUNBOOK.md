# M6 – ULC Production Identity & Smoke Runbook

Stand der Vorbereitung: 2026-08-19, 15:07 Europe/Vienna

## Status

**Vorbereitung mit einem gefundenen #165-Vertrags-Finding. Keine Production-Identity und kein Smoke wurde erzeugt/ausgeführt.**

Dieses Runbook konkretisiert `production-access-bootstrap` und `post-deploy-smokes` des aktuellen 14-Schritte-M6-Vertrags.

## 1. Verbindliche Sicherheitsgrenze

Für ULC v0.1 gilt:

- initial genau ein autorisierter Production-Administrator,
- keine echten Benutzer-Credentials für technische Smokes,
- dedizierte technische Smoke-Principals,
- keine Credential-/Session-/Secretwerte in Repository, Chat, Screenshots, normalen Logs oder Evidence,
- kein öffentlicher Permission-Probe-Endpunkt,
- keine Fachmodul-Datenmutation; aktueller App-Vertrag hat `modules: []`,
- ein grüner Smoke autorisiert **niemals** das getrennte Release-Gate,
- normale weitere Benutzer/Rollen werden erst nach erfolgreichem kontrolliertem Production-Smoke und später über den kanonischen Rollenverwaltungsweg angelegt.

## 2. Gefundenes #165-Sequenz-Finding

Der aktuelle #165-Head `dc82bf4e4e89f7bc2261670f90a6bdc85743a727` verlangt im Smoke-Vertrag:

- `dedicatedSmokePrincipalsRequired = true`
- `realUserCredentialsAllowed = false`

Gleichzeitig listet `expectedBoundedWrites` aktuell nur:

- `authentication-session-state`
- `security-event-sink-for-denial-cases`

Damit ist im aktuellen Smoke-Schritt **keine Erzeugung oder Permission-Zuweisung eines Smoke-Principals** als Write gebunden.

Der vorherige `production-access-bootstrap` ist auf den initialen Admin und explizite Least-Privilege-Zuweisung ausgerichtet; ein separater Smoke-Principal-Lifecycle ist dort derzeit nicht ausdrücklich Bestandteil des Contracts.

### Konsequenz

#165 darf nach #163-Integration **nicht** unverändert final an Codex/ins Merge-Gate gehen, solange nicht eindeutig festgelegt und getestet ist, woher der dedizierte Smoke-Principal kommt und wie dessen Lebenszyklus gebunden ist.

Das Finding wird **nicht** jetzt auf dem eingefrorenen #165-Head behoben. Es wird beim ohnehin notwendigen Transfer von #165 auf den neuen `main` als gebündelte Korrektur umgesetzt, bevor neue Exact-Head-CI und finaler Codex erfolgen.

## 3. Bevorzugte minimale Auflösung des Findings

Bevorzugt – sofern der dann aktuelle kanonische Identity-/Permissions-Vertrag dies ohne neue Parallelarchitektur sauber erlaubt:

- im bereits privilegierten `production-access-bootstrap` zusätzlich **einen nicht-menschlichen, ausschließlich für M6-Smoke bestimmten technischen Principal** vorbereiten,
- klar getrennt vom initialen Production-Admin,
- keine normale Benutzer-/Einladungssemantik,
- explizite minimale Trainer-/Scope-Zuweisung nur für den gepinnten Allow-Fall,
- Credential außerhalb Repository/Chat und ausschließlich im geschützten Operations-Kontext,
- vor Public Release nicht als normaler Nutzer verwendbar,
- nach Smoke kontrolliert deaktivieren/quarantänisieren bzw. über den kanonischen Lifecycle bereinigen.

Warum diese Variante bevorzugt ist:

- kein 15. M6-Top-Level-Schritt nötig,
- keine spontane Identity-Erzeugung mitten im Smoke-Executor,
- der eigentliche Smoke kann weiterhin auf die heute eng erwarteten Runtime-Writes begrenzt bleiben,
- Provisioning liegt dort, wo Identity-/Permission-Administration bereits privilegiert gebunden ist.

### Fallback

Falls der kanonische Bootstrap-Vertrag einen separaten technischen Smoke-Principal nicht sicher tragen kann:

- `post-deploy-smokes` muss seine zusätzlich erlaubten Identity-/Permission-/Lifecycle-Writes **explizit** erweitern,
- diese Writes müssen eng, atomar/retry-sicher und adversarial getestet werden,
- kein generischer Test-User-Service und kein zweiter Provisioning-Pfad.

Kein Fallback wird ohne tatsächlichen Implementierungsbedarf gebaut.

## 4. Production-Admin-Bootstrap

### Ziel

Nach Schritt 9 existiert genau ein initialer Production-Administrator mit den kanonisch erforderlichen Rechten.

### Kanonische Verträge

Aktuell gepinnt:

- `@appbasis/identity/root-admin#createInitialTechnicalAdmin`
- `tooling/ulc-linz-m5-permission-provisioning.mjs`
- `tooling/ulc-linz-m5-principal-access-orchestration.mjs#replaceUlcLinzPrincipalAccess`
- `PostgresPrincipalAccessAdministration`

Keine zweite Bootstrap-/Rollenimplementierung.

### Vor dem Write

- Production DB eindeutig gebunden und migriert,
- Worker-Deploy eindeutig gebunden,
- Identity-Set leer oder explizit recoverable,
- konkrete Admin-Identity sicher festgelegt,
- keine Credentials in Chat/Repo,
- Principal Assignments exakt und least-privilege,
- Last-Admin-/Required-Role-Holder-Verträge intakt.

### Nach dem Write read-only prüfen

- genau erwartete Admin-Identity aktiv,
- erwartete ULC-Admin-Rolle/Permissions,
- keine zusätzlichen normalen Principals durch Default-Provisioning,
- Audit-/Administrationsevidence vorhanden, ohne Credentialwerte.

## 5. Credential-Behandlung

### Admin

- Credential nur über sicheren, für die reale Runtime vorgesehenen Mechanismus setzen/übergeben,
- nicht in PR-/Issue-Kommentaren,
- nicht in App-Manifesten,
- nicht in Factory-Snapshots,
- nicht als Smoke-Credential verwenden, wenn ein eigener Smoke-Principal vorgesehen ist.

### Smoke Principal

- technisch/non-human,
- nur für diesen kontrollierten Produktionsnachweis,
- Credential kurzlebig soweit der kanonische Identity-Vertrag dies sicher unterstützt,
- andernfalls nach Smoke sofort kontrollierter Disable-/Lifecycle-Pfad,
- Credential niemals im Smoke-Output.

## 6. Smoke-Voraussetzungen

Vor Schritt 13 müssen real erfüllt sein:

- M5 Production Evidence vollständig gemäß aktuellem Gate,
- Backup/Recovery-Validation grün,
- Production Domain aktiv,
- finaler Runtime-/Migration-/Smoke-Contract unverändert,
- dedizierter Smoke-Principal sicher vorhanden und gebunden,
- keine normalen Endnutzer als Testsubjekte,
- geschützter Operations Runner verfügbar.

Fehlt der Smoke-Principal oder ist seine Herkunft nicht eindeutig: **STOP**.

## 7. Gepinnter aktueller Public-Runtime-Smoke

### Health

`GET /api/health`

Erwartet:

- HTTPS,
- erfolgreicher Status,
- `status = ok`,
- `appId = ulc-linz`.

Keine Auth-/DB-Details im Response.

### Auth

`POST /api/auth/sign-in`

Mit ausschließlich dem dedizierten Smoke-Credential.

Erwartet:

- erfolgreicher Login,
- keine Ausgabe des Passworts/Secretwerts,
- Session-State als erwarteter bounded write.

### Session

`GET /api/auth/session`

Erwartet:

- authentifizierte dedizierte Smoke-Session,
- korrekter Principal-Kontext,
- keine Session-ID/Token im normalen Evidence-Output.

### Passwortwechsel

Der aktuelle Smoke-Vertrag erlaubt **keinen** Passwortwechsel während des Smokes.

Die öffentliche Route `/api/auth/change-required-password` gehört zwar zum Runtimevertrag, ist aber nicht Teil des freigegebenen M6-Smoke-Szenarios.

## 8. Permission-Smoke – ausschließlich geschützte Operations-Grenze

Keine öffentliche `/smoke`, `/permissions/probe` oder Admin-Smoke-Route.

Kanonischer Vertrag:

`apps/ulc-linz/worker/authorization.ts#assertUlcLinzModuleAccess`

### Allow-Fall

- Source Role: `trainer`
- Module: `countdown`
- Action: `view`
- Scope: `organization`
- aktive Same-Organization-Bindung erforderlich.

Erwartet: allow.

### Deny-Fall

- Module: `__m6_smoke_unknown__`
- Action: `view`

Erwartet: deny-by-default.

Der Denial darf einen sanitisierten Security-Event erzeugen. Keine Subject-ID, Credentials, Session-Tokens oder Request-Bodies in diesem Event.

## 9. Application-Smoke

Aktueller Scope:

- `identity-permissions-foundation`
- `modules: []`
- keine erfundene Fachmodulroute,
- keine Fachmodul-Datenmutation.

Application-Smoke bedeutet deshalb aktuell:

- Public Runtime erreichbar,
- Health/Auth/Session funktionieren,
- serverseitige Permission-Semantik funktioniert,
- unbekannte Capability bleibt denied.

Sobald ein echtes Fachmodul in `appbasis.app.json` aufgenommen wird, muss dieser Smoke-Vertrag **vor Production** bewusst aktualisiert werden.

## 10. Erlaubte Production-Writes des Smokes

Nach Behebung des Smoke-Principal-Findings muss der finale Contract wieder eine **geschlossene Liste** besitzen.

Im heutigen Smoke selbst sind fachlich nur erwartet:

- Authentication Session State,
- sanitisiertes Security Event für Denial.

Falls die gewählte Lösung den Smoke-Principal bereits in Schritt 9 vorbereitet, bleiben diese beiden Runtime-Writes die ideale enge Schritt-13-Grenze.

Jeder weitere Write im Smoke ist vor Ausführung zu inventarisieren und im Contract zu pinnen.

## 11. Cleanup / Nachlauf

### Session

Nach Abschluss:

- Smoke-Session über den kanonischen Session-/Identity-Pfad beenden,
- keine Session-Tokens in Evidence.

### Smoke Principal

Nach erfolgreichem Smoke:

- keine weitere operative Nutzung,
- bevorzugt sofort kontrolliert deaktivieren/quarantänisieren,
- vollständige Löschung nur über den kanonischen ULC-Lifecycle, wenn der finale Vertrag dies für den technischen Principal sauber abdeckt,
- Audit-/Retention-/35-Tage-Tombstone-/Restore-Reconciliation-Verträge nicht umgehen.

Der Cleanup ist ein Production-Write. Er muss entweder im finalen Schritt-13-Approval-Paket **explizit als gebundener Cleanup** enthalten sein oder separat freigegeben werden. Kein stiller Cleanup.

### Initialer Admin

Bleibt bestehen. Er darf durch Smoke-Cleanup niemals entfernt, downgraded oder als Testprincipal umgewidmet werden.

## 12. Normale Benutzer nach dem Smoke

Erst nachdem:

- Smoke vollständig PASS,
- Smoke-Cleanup kontrolliert,
- Release-Gate später ausdrücklich freigegeben,

werden normale reale Benutzer über die bestehende Rollenverwaltung eingeladen/angelegt.

Keine direkte SQL-Benutzeranlage, keine Default-Massenrollen, kein zweiter Admin nur aus Bequemlichkeit.

## 13. Smoke-Evidence-Output

Der normale Output enthält nur:

- Prüfzeit,
- gebundener Runtime-/Resource-Fingerprint,
- Smoke-Contract-Digest,
- `health: pass|fail`,
- `auth: pass|fail`,
- `session: pass|fail`,
- `permissionsAllow: pass|fail`,
- `permissionsDeny: pass|fail`,
- `application: pass|fail`,
- Cleanup-Status,
- Blocker/Fehlerklasse sanitisiert,
- `releaseAuthorized = false`.

Nicht enthalten:

- Name/E-Mail des realen Admins,
- Smoke-Username, sofern nicht in geschützter transienter Ausführung notwendig,
- Passwort,
- Session Token/Cookie,
- Provider-/DB-IDs,
- Connection Strings,
- personenbezogene Payloads.

## 14. Fail-closed / Stop-Regeln

Smoke nicht starten bzw. sofort stoppen, wenn:

- kein dedizierter technischer Smoke-Principal sicher gebunden ist,
- echte Nutzer-Credentials benötigt würden,
- Runtime-/Migration-/Provider-Fingerprint driftet,
- öffentliche Probe-Route erforderlich wäre,
- Permission-Smoke nicht über die geschützte Operations-Grenze ausführbar ist,
- unerwartete Fachmodulmutation nötig wäre,
- ein Smoke Credential/Sessionwert im normalen Output erscheint,
- M5 oder Backup/Recovery vor Schritt 13 nicht mehr grün ist.

Bei Smoke-Failure:

- Release bleibt gesperrt,
- keine hektische Rollen-/DB-Korrektur,
- Ursache lesen, gebündelt beheben, betroffene Evidence neu erheben.

## 15. Erforderliche #165-Korrektur vor finalem Codex

Beim Transfer von #165 auf den nach #163 neuen `main` muss **vor Exact-Head-CI/ChatGPT-Review/Codex** eine der beiden Varianten sauber implementiert und getestet werden:

### A – bevorzugt

`production-access-bootstrap` materialisiert zusätzlich den dedizierten technischen Smoke-Principal über bestehende kanonische Identity-/Permission-Verträge; Schritt 13 konsumiert ihn nur.

Dabei muss ausdrücklich bewiesen werden:

- initial weiterhin genau ein Production-Admin,
- Smoke-Principal ist kein normaler Endnutzer,
- minimale Trainer-/Same-Org-Scope-Rechte,
- keine Adminrechte,
- kein Default-Provisioning,
- Cleanup-Vertrag gepinnt.

### B – nur falls A nicht sauber möglich ist

Schritt 13 enthält die notwendige JIT-Smoke-Principal-Erzeugung/-Zuweisung/-Bereinigung als ausdrücklich gebundene Writes; `expectedBoundedWrites` und Acceptance werden entsprechend vollständig erweitert.

Kein 15. Top-Level-M6-Schritt nur für theoretische Eleganz, solange A oder B als kleiner Vertical Slice den realen Verbraucher sauber abdeckt.

## 16. DONE für Punkt 9

Punkt 9 ist als Vorbereitung DONE, wenn:

- dieses Runbook dokumentiert ist,
- das #165-Sequenz-Finding eindeutig erfasst ist,
- die bevorzugte minimale spätere Korrektur definiert ist,
- Prep-Head vollständige CI + ChatGPT-Review PASS hat.

Der reale Smoke ist dadurch selbstverständlich noch nicht ausgeführt.

## 17. Externe Wirkung

Keine. Kein Benutzer, Principal, Credential, Session, Permission, Smoke, Cleanup oder Release wurde angelegt/ausgeführt.
