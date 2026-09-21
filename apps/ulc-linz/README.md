# ULC Linz

Generated AppBasis app skeleton, erweitert um den ersten sichtbaren ULC-Fachbereich.

- App ID: `ulc-linz`
- Generator-Module: noch keine
- Platform services: identity, permissions
- App-eigener Vertical Slice: Intervall-Countdown v0.1

Die App bleibt auf der kanonisch erzeugten AppBasis-Runtime. Der Countdown ist bewusst
app-eigene Fachfunktion und noch kein allgemeines FC4-Modul: Es wird kein zweiter
Generator-/Modulvertrag erfunden, bevor der stabile Modulvertrag tatsächlich benötigt wird.

## Intervall-Countdown v0.1

Der erste sichtbare Slice stellt nach Anmeldung einen mobilen Intervall-Countdown bereit:

- Belastungsdauer
- Pausendauer
- Anzahl Übungen
- Start, Pause/Fortsetzen und Beenden
- deadline-basierte Zeitmessung
- optionaler Browser-Wake-Lock während eines laufenden Countdowns
- keine fachliche Persistenz und keine Countdown-PII

Der Zugriff wird serverseitig über die bestehende ULC-Rollen-/Capability-Grenze geprüft.
Der Browser erhält nur den Freigabestatus; Organisations- oder Provider-IDs werden nicht
an den Countdown-Endpunkt ausgegeben.

## M5-B authorization boundary

The ULC runtime owns the canonical app-specific role/data-scope policy in
`worker/role-data-scope.json` and exposes a server-side authorization guard from
`worker/app.ts`.

The guard reuses the shared AppBasis permission store and requires an active membership
in the exact organization, an exact ULC runtime role and the requested module capability.
Subject-scoped athlete/parent data continues to require an explicit `self`/`managed`
relation. A separate `module` scope exists only for non-data tools such as the countdown
and does not grant organization- or subject-data access. Unknown or inconsistent state is
denied.

This boundary does not make a future changed production version ready by itself; current
Security & Privacy and M6 evidence must be refreshed before a later production release.
