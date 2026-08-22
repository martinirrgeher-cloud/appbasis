# AppFactory – kanonische Readiness-Terminologie

Stand: 2026-08-19

## Status

**Angenommen.** Die frühere Entscheidungsvorlage ist durch ADR-023 verbindlich entschieden.

Autoritative Reihenfolge bleibt: Entscheidungsregister → Betriebsakte → Roadmap/Gates → Runbook. `docs/ADR-023-READINESS-LIFECYCLE.md` spiegelt die Entscheidung für die Repository-Integration.

## Kanonische Semantik

### 1. Security & Privacy Ready

Bedeutung:

- exakt das M5-Gate,
- alle zwölf kanonischen M5-Kriterien erfüllt,
- fail-closed bei einem fehlenden, widersprüchlichen oder nicht vertrauenswürdig gebundenen Nachweis.

UI-Label:

**Security & Privacy Ready**

Das bestehende interne M5-Feld `productionReady` kann aus Kompatibilitätsgründen zunächst bestehen bleiben. Die UI darf seinen Namen nicht als fachliche Lifecycle-Bezeichnung interpretieren.

### 2. Production Ready

Bedeutung:

Die konkrete App hat den vollständigen technischen Pre-Release-Zustand erreicht. Mindestens:

- Preview geprüft,
- Security & Privacy Ready,
- Backup/Recovery-Gate grün,
- realer Restore erfolgreich,
- dedizierte Produktionsdatenbank,
- dedizierter Produktions-Worker,
- kontrollierte Produktionsdomain,
- produktive Benutzer und Rechte,
- produktive Migrationen erfolgreich,
- Produktionsdeployment erfolgreich,
- Post-Deploy-Smokes erfolgreich,
- alle notwendigen mutierenden Vorbereitungsschritte jeweils ausdrücklich freigegeben und kontrolliert ausgeführt,
- keine offenen relevanten Security-/Privacy-/Recovery-/Review-Blocker.

`Production Ready` setzt **nicht** `releaseAuthorized=true`.

Es bedeutet ausschließlich: Die App kann jetzt kontrolliert für den finalen Release freigegeben werden.

### 3. Produktion freigegeben

Bedeutung:

- `Production Ready=true`,
- zusätzlich separate ausdrückliche finale Release-Freigabe,
- erst das separate Release-Gate autorisiert den Übergang,
- kein automatischer Übergang aus technischer Evidence.

UI-Label:

**Produktion freigegeben**

## Zwei getrennte Freigabearten

### Schrittfreigaben

Jeder mutierende Provider-/Produktionsschritt benötigt seine eigene ausdrückliche Freigabe, zum Beispiel Neon-Create, Worker-Create, DB-Binding, Secret-/Runtime-Konfiguration, Logging-Sink, produktive Migration, Deployment, Access-Bootstrap, Public Ingress, Restore oder Production-Smokes.

Eine Schrittfreigabe autorisiert nur den jeweiligen konkreten Schritt und ist Bestandteil des kontrollierten Wegs zu Production Ready.

### Finale Release-Freigabe

Davon getrennt autorisiert eine eigene ausdrückliche Release-Freigabe erst den Lifecycle-Übergang zu **Produktion freigegeben**.

Schrittfreigaben ersetzen diese finale Release-Freigabe nicht.

## Kanonischer Lifecycle

1. Entwurf
2. Repository erzeugt
3. Preview vorbereitet
4. Preview deployed
5. Preview geprüft
6. Security & Privacy Ready
7. Production Ready
8. Produktion freigegeben

## Ableitung für den finalen Factory-Readiness-Slice

Der gemeinsame Integrationsnachfolger von #134 + #136 + #166 muss:

- M5 als **Security & Privacy Ready** darstellen,
- `Production Ready` nicht aus `productionReadiness.productionReady` allein ableiten,
- den umfassenden Production-Ready-Zustand aus den kanonischen Preview-/M5-/M6-/Recovery-/Deployment-/Smoke-Verträgen ableiten,
- `Produktion freigegeben` ausschließlich aus dem separaten Release-Gate ableiten,
- bei unvollständiger oder widersprüchlicher Evidence fail-closed bleiben,
- keinen aktiven Produktionsbutton einführen, solange kein eigener kontrollierter Release-Slice existiert.

Die Terminologieanpassung wird in denselben finalen Factory-Readiness-Integrationshead aufgenommen und durch dessen einen finalen Sol/max-Codex-Review abgedeckt. Ein zusätzlicher Terminologie-Review entfällt.

## Sicherheitswirkung

Die Präzisierung lockert kein Gate:

- M5 bleibt all-required/fail-closed,
- Production Ready ist breiter als M5,
- jeder mutierende Schritt bleibt separat freigabepflichtig,
- der finale Release bleibt zusätzlich separat freigabepflichtig,
- vollständige technische Evidence autorisiert keinen Auto-Release.

## Nicht enthalten

Diese Dokumentationsentscheidung verändert aktuell keine Runtime-, Schema-, Migration-, Manifest-, Provider- oder Release-Logik. #163 und #165 bleiben unverändert.
