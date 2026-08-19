# M6 – ULC Confirmed Operator Inputs

Stand: 2026-08-19

## Zweck

Dieses Dokument hält ausschließlich bereits bestätigte, nicht geheime Operator-Inputs für den späteren ULC-Produktionsdurchlauf fest.

Es autorisiert **keinen** Provider-Write, kein Deployment, keine DNS-Änderung, keine Secret-Änderung, keine produktive Migration und keine Produktionsfreigabe.

## Bestätigt

### Produktionshostname

Bestätigter gewünschter Produktionshostname:

`app.ulc-linz.at`

Daraus folgt als geplanter kanonischer Origin:

`https://app.ulc-linz.at`

Noch nicht ausgeführt oder behauptet:

- DNS-Kontrolle,
- DNS-/Custom-Domain-/Route-Write,
- TLS-Aktivierung für den realen Produktionshostname,
- öffentliche Erreichbarkeit,
- `APPBASIS_BASE_URL`-Write.

Unmittelbar vor dem späteren Domain-/Ingress-Write müssen Belegung, DNS-Kontrolle, Worker-Bindung und TLS-Ziel erneut read-only geprüft werden.

### Initialer Produktionsadministrator

Bestätigte Startregel:

- zunächst **genau ein** initialer Produktionsadministrator,
- diese Rolle übernimmt der Operator/Nutzer, der den kontrollierten Produktionsdurchlauf freigibt,
- konkrete E-Mail-/Identity-Daten werden **nicht** in diesem Repository dokumentiert,
- konkrete Identität wird erst unmittelbar vor dem freigabepflichtigen Production-User-Write sicher bereitgestellt,
- der Bootstrap verwendet ausschließlich die bestehenden Root-Admin-/Principal-Access-/Permission-Provisioning-Verträge,
- keine Default-Principal-Zuweisung und kein zweiter Admin-Sonderpfad.

### Weitere Startbenutzer

Bestätigte Startregel:

- beim initialen Produktionsbootstrap keine weiteren normalen Benutzer vorsorglich anlegen,
- weitere Benutzer erst nach erfolgreichem kontrolliertem Produktions-Smoke über die normale Rollenverwaltung hinzufügen,
- Least Privilege und bestehende ULC-Rollen-/Scope-Regeln bleiben unverändert.

## Weiterhin offen

Diese Entscheidungen müssen später separat getroffen bzw. bestätigt werden:

- tatsächliche DNS-Kontrolle und freie Belegung von `app.ulc-linz.at`,
- konkrete Admin-Identity für den privilegierten Write,
- Cloudflare-/Neon-Plan und Kosten,
- konkreter Production-Security-Logging-Sink,
- Backup-/Recovery-Parameter innerhalb des freigegebenen Lifecycle-/Restore-Vertrags,
- jeder einzelne Provider-/DB-/Deploy-/Ingress-/Restore-/Smoke-Write,
- finale Produktionsfreigabe.

## Sicherheitsgrenze

Keine Secretwerte, E-Mail-Adressen, Provider-IDs, Datenbankadressen oder Connection Strings werden in diesem Dokument gespeichert.

Bei Konflikt mit einem später frisch live verifizierten Providerzustand oder einem neueren expliziten Operatorentscheid gilt der neuere Zustand bzw. die neuere Entscheidung; der Produktionslauf bleibt bis zur erneuten Prüfung fail-closed.