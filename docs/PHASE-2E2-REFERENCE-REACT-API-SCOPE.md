# Phase 2E2 – Reference React-Integration mit der Server-API

## Ziel

Die sichtbare mobile Reference-App verwendet die in Phase 2E1 gemergte HTTP-Grenze für Session, Login, verpflichtenden Erst-Passwortwechsel und Tasks. React bildet weder Better-Auth-, Identity- noch Permission-Regeln nach, sondern rendert ausschließlich den vom Server gelieferten Access-Zustand und reagiert auf HTTP-Ergebnisse.

## Scope

- ausschließlich `apps/reference` plus dieses Scope-Dokument
- kleiner typisierter Reference-API-Client für same-origin `/api/*`
- Session-Wiederherstellung beim App-Start über `GET /api/auth/session`
- Login-Ansicht mit Username + Passwort über `POST /api/auth/sign-in`
- bei `password-change-required` ausschließlich Pflicht-Passwortwechsel anzeigen; Dashboard/Tasks bleiben nicht bedienbar
- Pflicht-Passwortwechsel über `POST /api/auth/change-required-password` mit browserseitig erzeugtem UUID-v4-Idempotency-Key
- nach voller Freigabe Tasks über die API laden, anlegen und Status umschalten
- bestehende mobile App-Shell, Task-Detaildialog, Fokusfalle, Escape-Verhalten und kompakte Bedienung beibehalten
- klare Zustände für Laden, nicht angemeldet, Pflicht-Passwortwechsel, voller Zugriff, 403 und nicht konfigurierte Runtime/503
- fokussierte Tests für den API-Client und Zustandsübergänge, soweit ohne neue UI-Testplattform sinnvoll

## Harte Grenzen

- kein direkter Import oder Einsatz von Better Auth, `IdentityService`, `PermissionStore` oder `InMemoryTaskRepository` im React-Code
- keine Verdopplung von Business-Permissions im Frontend; React interpretiert nur Serverstatus
- keine Speicherung von Session-Tokens in JS-State, LocalStorage, SessionStorage oder Response-Modellen; Auth bleibt Cookie-basiert
- keine Benutzerverwaltung in diesem Slice
- keine PostgreSQL-Tasks-Persistenz oder Migration
- keine Deployment-, Hyperdrive-, Secret- oder externe Ressourcenänderung
- keine neue Routing-, State-Management- oder API-Framework-Abstraktion
- keine Änderung der serverseitigen Security-Semantik aus Phase 2E1, außer ein echter API-Vertragsfehler macht dies zwingend erforderlich

## UX-Verhalten

- initial zeigt die App einen neutralen Ladezustand, bis die Session geprüft wurde
- 401 bei Session-Restore führt zur Login-Ansicht, nicht zu einer Fehlermeldungs-Endlosschleife
- erfolgreiche Anmeldung übernimmt den vom Server gelieferten `access`
- `password-change-required` zeigt aktuellen Benutzer und Passwortwechsel-Formular; Tasks/Dashboard werden nicht gerendert
- erfolgreicher Passwortwechsel übernimmt die rotierte Cookie-Session automatisch und lädt die Tasks
- voller Zugriff zeigt die bestehende Dashboard-/Tasks-Oberfläche mit echten API-Daten
- 401 während einer späteren API-Aktion führt kontrolliert zurück zum Login
- 403 zeigt eine verständliche fehlende-Berechtigung-Ansicht; keine clientseitige Freischaltung
- 503 zeigt eine klare „Demo-Backend noch nicht konfiguriert“-Ansicht
- Netzwerk-/unerwartete Fehler bleiben retrybar und dürfen keine alte erfolgreiche Mutation vortäuschen

## Abnahmekriterien

- `App.tsx` verwendet keinen lokalen Task-Repository-Zustand mehr als Source of Truth
- Reload stellt eine gültige Session über das HttpOnly-Cookie wieder her
- Login, Pflicht-Passwortwechsel und Tasks funktionieren ausschließlich über die Phase-2E1-API
- Session-Token ist im Frontend weder typisiert noch gespeichert noch lesbar
- Tasks werden nach Create/Toggle aus der Serverantwort bzw. durch kontrolliertes Reload aktualisiert
- bestehende Dialog-Fokus-/Escape- und mobile Layout-Funktionen bleiben erhalten
- 401/403/503 sind explizit behandelt
- Typecheck, Tests, Build, Repo-Verify, frozen install und `git diff --check` sind grün
- Diff bleibt im beschriebenen Scope

Draft: nicht mergen, bevor Exact-Head-CI und finaler Codex-Review sauber sind.
