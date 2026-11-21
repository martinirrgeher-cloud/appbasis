# ULC Linz – regulärer Administrator-Login nach P05-Organisationskorrektur

**21.11.2026 – reale Produktionsdatenbank gelesen, keine neue Datenänderung.**

## Was bereits stimmt

Neon-Produktion `neondb` enthält vier aktive Vereinsgruppen
(Kindertraining, U12, U14, Gruppe Irrgeher), drei Jugendmodul-Zuordnungen
und 0 Gruppen der alten M6-Testorganisation. Der technische Account
`ulc.production.admin` ist als `source_role='admin'` in der
Organisation `ulc-linz` eingetragen und besitzt genau die bestehende
`ulc-linz:admin`-Rollenbindung. Die 27 expliziten Revokes gehören
weiterhin zur M6-Testidentität.

## Entscheidender Login-Blocker

**Ein gültiges technisches Better-Auth-Root-Konto ist nicht automatisch
eine AppBasis-Anwendungsidentität.** Der technische Root wird durch
`packages/identity/src/root-admin.ts` absichtlich *ohne*
`appbasis_identity_security_state` angelegt. Die reguläre ULC-Anmeldung
nutzt aber `IdentityService.signInWithUsername` und
`resolveSession` aus `packages/identity/src/service.ts`. Diese
beenden die Sitzung und geben `IDENTITY_STATE_MISSING` zurück,
wenn dieser Identitätsstatus fehlt.

Read-only SQL in `neondb` hat bestätigt:

- technischer Root-Admin: **1**;
- Root mit regulärem AppBasis-Identitätsstatus: **0**;
- aktive nicht-M6-Admin-Mitgliedschaften: **1**;
- reguläre App-Admin-Kandidaten mit Identitätsstatus und genau
  passender `ulc-linz:admin`-Rolle: **0**.

Die bereits gesetzte technische Rolle ist ein **DB-Setup-PASS, kein
Login-PASS**. Das zuvor vorgeschlagene „Root vorübergehend als
App-Admin verwenden“ ist deshalb im normalen App-Login **nicht
funktionsfähig**. Der technische Root soll nicht durch einen
ungeprüften Direkt-`INSERT` in die Identity-Security-Tabelle
scheinbar zu einer regulären App-Identität umgebaut werden.

## Neuer fail-closed Read-only Go-live-Check

`tooling/ulc-linz-production-onboarding-readonly.mjs` prüft jetzt
zusätzlich zwei **aggregierte** Kennzahlen:

- `technicalAdminAppIdentityState` – macht die Trennung vom
  Better-Auth-Root sichtbar;
- `regularClubAdminCandidates` – zählt nur echte
  `ulc-linz`-Mitglieder mit `source_role=admin`, gültigem
  `user`-Konto, aktivem AppBasis-Identitätsstatus ohne
  Passwortwechsel-Sperre, genau einer passenden
  `ulc-linz:admin`-Rolle, vorhandenem Permission-Principal
  und nicht widerrufener Administrations-Capability.

**0** solche Kandidaten meldet den neuen Blocker
`NO_REGULAR_APP_ADMIN_IDENTITY`. Auch ein positiver Zähler
beweist **noch keinen** realen HTTP-Login, funktionierende
Sitzungscookies oder Browser-/Handy-Admin-Smoke.

Es werden nur aggregierte Zähler und Blockercodes ausgegeben; keine
Identitäts-IDs, E-Mail-Adressen, Passwörter oder Tokens.

## Betriebsnächster Schritt

Den vorhandenen technischen Root weiterhin nur für geschützte
Bootstrap-Verfahren verwenden. Für die laufende Vereinsverwaltung
über die bereits vorhandenen AppBasis-Provisionierungsfunktionen
einen **eigenen, ausdrücklich autorisierten regulären ULC-Administrator**
mit sicherem Zugang anlegen, der zur Organisation `ulc-linz`
gehört. Vor aktiver Nutzung muss der Benutzer seinen Erstzugang
abschließen; Rolle/Scope anschließend serverseitig und mit
realem Login prüfen. Dazu sind eine konkret gewünschte
Benutzeridentität und ein sicherer Weg für das Erstpasswort
erforderlich; keine Annahme oder Übernahme des M6-Smoke-Passworts.

**Keine** Produktionsdatenbank-/Benutzer-/Rollen-/Revoke-Änderung,
keine Cloudflare- oder Deploy-Aktion durch diesen technischen PR.
P01-/P24-Privacy-/Backup-/Medienfreigaben bleiben gesondert.
