# AppFactory – Vorschlag für kanonische Readiness-Terminologie

Stand: 2026-08-19

## Status

**Entscheidungsvorlage – noch kein ADR und noch keine verbindliche Architekturänderung.**

Dieser Vorschlag löst einen Terminologie-Widerspruch zwischen M5, der breiteren Roadmap-Definition von `Production Ready v0.1` und dem FC1-Lifecycle auf, ohne bestehende Runtime-/Gate-Verträge still umzudeuten.

## Ausgangslage

Die Projektquellen verwenden derzeit drei überlappende Begriffe:

1. **M5 – Production Security & Privacy Ready v0.1**
   - zwölf Security-/Privacy-Pflichtkriterien,
   - der aktuelle Repository-Evaluator verwendet das Feld `productionReady`,
   - ein fehlendes M5-Kriterium hält dieses Gate fail-closed offen.

2. **Production Ready v0.1** in der Roadmap
   - zusätzlich Factory Ready,
   - Backup/DR + realer Restore,
   - Security/Privacy Ready,
   - getrennte Produktionsdatenbank,
   - getrennter Produktions-Worker,
   - kontrollierte Domain,
   - kontrollierte Migrationen,
   - ausdrückliche Freigabe,
   - Post-Deploy-Smoke grün.

3. **FC1-Lifecycle**
   - `Production Ready`,
   - danach separat `Produktion freigegeben`.

Damit darf das interne M5-Feld `productionReady` nicht allein aufgrund seines Namens als FC1-`Production Ready` dargestellt werden.

## Empfohlene kanonische Semantik

### 1. Security & Privacy Ready

Bedeutung:

- genau das M5-Gate,
- alle zwölf kanonischen M5-Kriterien erfüllt,
- fail-closed bei einem fehlenden oder nicht vertrauenswürdig gebundenen Nachweis.

UI-Label:

**Security & Privacy Ready**

Technischer Hinweis:

Das bestehende interne Feld `productionReady` kann aus Kompatibilitätsgründen zunächst bestehen bleiben. Die UI darf den Feldnamen nicht als fachliche Lifecycle-Bezeichnung verwenden.

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
- produktive Benutzer & Rechte,
- produktive Migrationen erfolgreich,
- Produktionsdeployment erfolgreich,
- Post-Deploy-Smokes erfolgreich,
- alle erforderlichen mutierenden Vorbereitungsschritte wurden jeweils ausdrücklich freigegeben und kontrolliert ausgeführt,
- keine offenen relevanten Security-/Privacy-/Recovery-/Review-Blocker.

Wichtig:

`Production Ready` setzt **nicht** `releaseAuthorized=true`.

Es bedeutet: Die App **kann jetzt kontrolliert freigegeben werden**.

### 3. Produktion freigegeben

Bedeutung:

- `Production Ready=true`,
- zusätzlich separate ausdrückliche Release-Freigabe des Nutzers,
- Release-Gate setzt erst dann die Freigabe-Autorisierung,
- kein automatischer Übergang aus technischer Evidence.

UI-Label:

**Produktion freigegeben**

## Interpretation der „ausdrücklichen Freigabe“ aus der Roadmap

Um FC1 und den M6-Sicherheitsvertrag konsistent zu halten, wird empfohlen, zwei Freigabearten ausdrücklich zu unterscheiden:

### A. Schrittfreigaben

Jeder mutierende Provider-/Produktionsschritt benötigt seine eigene ausdrückliche Freigabe, zum Beispiel:

- Neon-Create,
- Worker-Create,
- DB-Binding,
- Runtime-/Secret-Konfiguration,
- Logging-Sink,
- produktive Migration,
- Deployment,
- produktiver Access-Bootstrap,
- Public Ingress,
- Restore,
- Production-Smokes.

Diese Freigaben autorisieren **nur den jeweiligen Schritt** und sind Bestandteil des kontrollierten Wegs zu Production Ready.

### B. Release-Freigabe

Eine davon getrennte ausdrückliche Freigabe autorisiert erst den Lifecycle-Übergang zu `Produktion freigegeben`.

Damit wird die Roadmap-Anforderung „ausdrückliche Freigabe“ nicht gestrichen, sondern präzisiert:

- mutierende Produktionsvorbereitung braucht Schrittfreigaben,
- der finale Release braucht eine separate Release-Freigabe.

## Empfohlener Lifecycle

1. Entwurf
2. Repository erzeugt
3. Preview vorbereitet
4. Preview deployed
5. Preview geprüft
6. Security & Privacy Ready
7. Production Ready
8. Produktion freigegeben

FC1 verlangt nur Mindestzustände; der zusätzliche sichtbare Zustand `Security & Privacy Ready` macht das bestehende M5-Gate transparent, ohne `Production Ready` zu überladen.

## Ableitung für #166

Nach einer verbindlichen Entscheidung sollte #166 bzw. sein finaler Integrationsnachfolger:

- M5 nicht als `Production Ready`, sondern als `Security & Privacy Ready` darstellen,
- `Production Ready` nicht aus `productionReadiness.productionReady` allein ableiten,
- den umfassenden Production-Ready-Zustand aus den kanonischen Preview-/M5-/M6-/Recovery-Verträgen ableiten,
- `Produktion freigegeben` ausschließlich aus dem separaten Release-Gate ableiten,
- bei unvollständiger oder widersprüchlicher Evidence fail-closed bleiben,
- keinen aktiven Produktionsbutton einführen, solange kein eigener kontrollierter Release-Slice existiert.

## Notwendige Quellenpflege bei Annahme

Wenn dieser Vorschlag angenommen wird:

1. **Entscheidungsregister** zuerst um eine präzisierende ADR ergänzen bzw. ADR-011 erweitern.
2. **Betriebsakte** auf dieselbe Terminologie bringen.
3. **Roadmap** bei `Production Ready v0.1` die zwei Freigabearten ausdrücklich unterscheiden.
4. **Runbook** dieselbe Operator-/Release-Trennung verwenden.
5. Erst danach UI-/Snapshot-/Acceptance-Tests finalisieren.

## Sicherheitswirkung

Die vorgeschlagene Präzisierung lockert kein Gate:

- M5 bleibt all-required/fail-closed,
- Production Ready wird breiter, nicht schwächer,
- jeder mutierende Schritt bleibt freigabepflichtig,
- Release bleibt separat freigabepflichtig,
- vollständige technische Evidence autorisiert keinen Auto-Release.

## Noch nicht enthalten

- keine ADR-Änderung,
- keine Betriebsakten-/Roadmap-/Runbook-Änderung,
- keine #166-Codeänderung,
- kein Merge,
- kein Codex-Aufruf,
- kein Providerwrite,
- keine Produktionsfreigabe.
