# Phase 3C – Shared Identity HTTP Adapter

## Ziel

Der erste wirklich app-übergreifend wiederverwendbare Teil des bewiesenen Reference-Vertical-Slices wird aus der konkreten App herausgezogen: der HTTP-Vertrag für Username-Login, Session-Auflösung und den erzwungenen Passwortwechsel.

Die Extraktion bleibt bewusst innerhalb von `@appbasis/identity`. Es entsteht kein allgemeines Runtime-Framework und keine neue Provider-Abstraktion.

## Öffentlicher Vertrag

`@appbasis/identity/http` stellt einen Web-standardbasierten Adapter bereit. Er verwendet ausschließlich `Request` und `Response` und hängt damit weder von Hono noch von Cloudflare ab.

Der Adapter kapselt:

- `POST /api/auth/sign-in`-Semantik auf Handler-Ebene,
- Session-Auflösung aus dem bestehenden `cookie`-Header,
- `POST /api/auth/change-required-password`-Semantik auf Handler-Ebene,
- den bestehenden Identity-Payload,
- den bestehenden Session-Cookie-Vertrag,
- die bereits bewiesene Identity-Fehlerabbildung auf HTTP-Status und JSON-Fehlercodes.

Die konkrete App entscheidet weiterhin selbst, auf welchen Routen diese Handler eingebunden werden. Der Adapter besitzt keine Navigation, keine Modul- oder App-Berechtigungen und keine fachlichen Endpunkte.

## Verhaltenskompatibilität

Für die Reference-App bleiben unverändert:

- Route-Pfade,
- Request-Felder,
- Response-Payloads,
- HTTP-Statuscodes,
- Fehlercodes und Fehlermeldungen,
- Cookie-Paar und Attribute `Path=/`, `HttpOnly`, `SameSite=Lax` sowie optional `Secure`,
- Übergabe des vollständigen eingehenden Cookie-Headers an den Identity-Service.

Die vorhandenen Reference-API-Tests bleiben deshalb weiterhin Vertragsprüfung für den migrierten ersten Consumer. Zusätzlich besitzt `@appbasis/identity` direkte Adaptertests ohne Hono.

## Bewusste Grenzen

Dieser Slice ändert nicht:

- Better-Auth-Konfiguration oder Identity-Persistenz,
- Datenbankschema oder Migrationen,
- Sessions oder Passwortregeln,
- Permissions oder Rollen,
- Tasks oder andere Fachmodule,
- Frontend-Auth-UI,
- Cloudflare-/Neon-/Hyperdrive-Konfiguration,
- Deployment oder CI-Struktur.

Es wird keine neue Dependency und kein neuer Workspace-Package-Importer benötigt; der Adapter lebt im bereits vorhandenen Identity-Paket.

## Warum nicht `packages/runtime`

Ein separates allgemeines Runtime-Paket wäre zu diesem Zeitpunkt eine unbelegte zusätzliche Plattformgrenze und würde Hono- bzw. App-Runtime-Kopplung fördern. Der konkrete wiederverwendbare Bedarf ist enger: HTTP-Transport für die vorhandene Identity-Fähigkeit.

Darum bleibt die Abstraktion dort, wo ihr fachneutraler Vertrag bereits bewiesen ist: `@appbasis/identity`.

## Abnahme

- `@appbasis/identity/http` verwendet nur Web-Standardtypen für HTTP.
- direkte Adaptertests beweisen Login-Payload, Session-Cookie, Cookie-Weitergabe und fail-closed Eingabevalidierung.
- die Reference-App verwendet den Adapter als ersten realen Consumer.
- bestehende Reference-API-Tests bleiben grün und beweisen keine Änderung des externen Vertrags.
- vollständige CI und reale PostgreSQL-E2E bleiben grün.

## Nächster Slice

Der nächste Factory-Slice soll den Generator um die kleinste lauffähige zweite App erweitern. Erst wenn dieser zweite Consumer einen weiteren neutralen gemeinsamen Baustein benötigt, wird der nächste Runtime-Teil extrahiert.
