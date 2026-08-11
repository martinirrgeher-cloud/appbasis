# AppBasis Projektstand

## Phase

Bootstrap / Phase 1

## Ziel

Aufbau eines minimalen vollständigen Vertical Slice als technische Referenz
für alle zukünftigen AppBasis-Anwendungen.

## Aktueller Stand

- Node 24.19.0 und pnpm 11.21.0 sind als verbindliche Toolchain festgelegt.
- Die Monorepo-Grundstruktur für `apps/*`, `packages/*` und `modules/*` ist vorhanden.
- `apps/reference` enthält eine mobile-first React-/TypeScript-SPA mit Vite.
- Das Frontend und ein Cloudflare Worker werden gemeinsam über das Cloudflare
  Vite Plugin entwickelt und gebaut.
- Hono stellt im Worker `GET /api/health` bereit.
- Die Referenzseite ruft den Health-Endpunkt beim Laden auf und zeigt Laden,
  Erreichbarkeit oder Fehler sichtbar an.
- API-Logik, TypeScript-Prüfung und Production Build werden automatisiert geprüft.

## Bewusst noch nicht umgesetzt

- kein Deployment und keine angelegten Cloudflare-Ressourcen
- keine Datenbank- oder Neon-/PostgreSQL-Anbindung
- keine Authentifizierung, Benutzerverwaltung oder Rollen-/Rechteverwaltung
- keine Push-, Queue-, Durable-Object- oder R2-Funktionen

## Nächster technischer Meilenstein

Nach fachlicher und sicherheitstechnischer Entscheidung kann die Referenz-App
kontrolliert um Persistenz und Authentifizierung erweitert werden. Deployment
bleibt ein gesonderter, ausdrücklich freizugebender Schritt.
