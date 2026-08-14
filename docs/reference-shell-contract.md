# Reference Shell Contract

## Zweck

Die Reference-App besitzt mit Rollen und Tasks zwei reale UI-Verbraucher. Bevor daraus allgemeine React-Komponenten oder eine neue Package-Grenze entstehen, werden die tatsächlich gemeinsam bewährten Shell-Eigenschaften als ausführbarer Vertrag festgehalten.

Dieser Vertrag ist bewusst ein Zwischenschritt: Er stabilisiert Verhalten, ohne bereits eine Komponenten-API vorwegzunehmen.

## Gemeinsamer stabiler Kern

Für Rollen und Tasks gelten gemeinsam:

- Mobile First mit fester Bottom Navigation.
- Wechsel auf eine linke, sticky Desktop-Sidebar am dokumentierten Desktop-Breakpoint ab 1024 px.
- semantische AppBasis-Tokens für Page-Surface, Primärtext und Branding statt fachmodulspezifischer Farben.
- primäre Navigationsziele verwenden den gemeinsamen Touch-Target-Token und bleiben damit mindestens 44 px hoch.

Der ausführbare Nachweis liegt in `apps/reference/test/reference-shell-contract.test.ts`.

## Bewusst noch lokal

Nicht Teil des gemeinsamen Shell-Vertrags sind derzeit:

- Tasks-spezifische Formulare, Statussteuerung und Detail-Sheet,
- Rollen-spezifische Tabellen, Karten, Editor-Tabs und Administrationszustände,
- Authentifizierungs- und Fehler-Gates der Tasks-Demo,
- konkrete Navigationsinhalte und aktive Fachrouten.

Diese Unterschiede bleiben lokal, solange kein zweiter realer Bedarf eine Verallgemeinerung rechtfertigt.

## Extraktionsregel

Eine gemeinsame React-Shell darf zunächst innerhalb der Reference-App entstehen, sobald Rollen und Tasks dieselbe kleine Komponenten-API ohne fachliche Sonderfälle verwenden können. Eine Verschiebung nach `packages/ui` erfolgt erst danach und nur, wenn die API durch reale Verbraucher stabil belegt ist.

Damit bleibt `packages/ui` fachneutral und klein; die Extraktion folgt dem bewährten Vertical-Slice-Prinzip statt einer vorschnellen Framework-Abstraktion.
