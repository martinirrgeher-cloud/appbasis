# AppBasis Design System v0.1

## Ziel

AppBasis verwendet appübergreifend dieselben Layout- und Komponentenprinzipien. Kunden- und App-Unterschiede werden primär über semantische Theme-Tokens abgebildet, nicht über unabhängige Fachmodul-Designsysteme.

Dieser Stand ist der erste ausführbare Vertical Slice. Er wird in der Reference-App anhand der Rollenübersicht und des Rolleneditors bewiesen, bevor weitere UI-Abstraktionen verallgemeinert werden.

## Verbindliche Gestaltungsentscheidungen

- Mobile First ist der primäre Entwurfsmodus.
- Mobile Hauptnavigation: Bottom Navigation mit maximal fünf Haupteinträgen.
- Desktop Hauptnavigation: linke Sidebar.
- Visueller Charakter: modern, kompakt, ruhig und funktionsorientiert.
- Fachmodule nutzen dieselbe AppShell, denselben PageHeader und dieselben Interaktionsmuster.
- Rollenbearbeitung wird als Detailseite mit Tabs `Allgemein | Berechtigungen | Benutzer` aufgebaut.
- Listenaktionen liegen im PageHeader.
- Längere Editoren verwenden einen sticky Editor-Header. `Speichern` bleibt direkt sichtbar; `Schließen` liegt als X rechts daneben. Die primäre Speicheraktion wird nicht in einem Overflow-Menü versteckt.
- Auf langen mobilen Formularen darf zusätzlich eine sticky Action-Bar unten verwendet werden. Sie ergänzt den Editor-Header, ersetzt ihn aber nicht zwingend.
- Pro sichtbarem Bereich gibt es möglichst nur eine dominante Primary Action.
- Mobile Touch-Ziele sind mindestens 44 × 44 px.

## Responsive-Vertrag

- `< 640 px`: Mobile
- `640–1023 px`: Tablet / kompakt
- `>= 1024 px`: Desktop mit Sidebar
- `>= 1440 px`: optional größere Arbeitsfläche; keine eigene Fachlogik

Komponenten dürfen ihre fachliche Bedeutung zwischen Breakpoints nicht ändern. Listen können auf Desktop tabellarisch und mobil als Cards dargestellt werden, solange Daten und Aktionen identisch bleiben.

## Theme-Tokens

Die Source of Truth für die ersten semantischen Tokens liegt in `packages/ui/tokens.css`.

Token-Gruppen:

- Brand: Primary, Secondary, Accent
- Surface: Page, Card, Muted, Elevated
- Text: Primary, Secondary, Muted, Inverse
- Border: Default, Strong
- State: Success, Warning, Danger, Info
- Interaction: Primary Action, Hover, Focus
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 px
- Radius: Control 10 px, Card 12 px, Sheet 16 px, Pill vollständig gerundet
- Touch target: 44 px

Fachmodule verwenden keine eigenen festen Branding-Farben. Kundenbranding wird über die semantischen Variablen überschrieben.

## Komponenten v0.1

Die gemeinsame Foundation enthält derzeit die für den ersten Rollen-Slice benötigten allgemeinen Grundlagen:

- AppShell-Grundlayout
- Desktop Sidebar
- Mobile Header
- Mobile Bottom Navigation
- PageHeader
- Primary-/Secondary-/Ghost-/Danger-/Icon-Button-Basis
- Input/Search
- Card/Surface
- Badge
- Empty State

Der Rolleneditor beweist zusätzlich verbindliche Interaktionsmuster für:

- sticky Editor-Header mit `Speichern` und X
- Tabs
- Checkbox-/Capability-Listen
- Aktiv/Inaktiv-Switch
- geschützte Systemzustände

Diese Muster werden erst dann in `packages/ui` weiter verallgemeinert, wenn ein zweiter realer Anwendungsfall ihre gemeinsame API bestätigt. Dadurch bleibt das UI-Paket bewusst klein und folgt derselben Vertical-Slice-Regel wie die übrige Plattform.

Weitere Komponenten wie Selects, Dialoge, Bottom Sheets, Skeletons und Toasts werden in den nächsten realen Fachslices ergänzt.

## Rollenmodul – bestehendes Permission-Modell bleibt Source of Truth

Das bestehende Permission-Modell wird nicht ersetzt oder parallel implementiert.

Bereits vorhanden und weiterhin gültig:

- `RoleBundle` mit technischer `roleId` und Capabilities
- `PrincipalPermissions.roleIds[]`
- persistente Principal-Role-Zuordnung mit mehreren Rollen pro Principal
- deny-by-default
- individuelle Grants/Revokes

Permissions Schema v3 ergänzt innerhalb des Permission-Owned Schemas:

- `display_name`
- `description`
- `state` mit `active | inactive`
- `kind` mit `system | managed`
- append-only Administrations-Audit mit Actor, Reason sowie Vorher-/Nachher-Zustand für jede rollenbezogene Mutation

Lifecycle-Regeln:

- bestehende Rollen bleiben durch die Migration kompatibel und werden als `system` behandelt,
- provisionierte Systemrollen dürfen nicht aus bereits vorhandenen `managed` Rollen mit gleicher ID übernommen werden,
- nur `managed` Rollen dürfen über die Managed-Rollenverwaltung verändert werden,
- jede erfolgreiche Rollenmutation und Principal-Rollen-Neuzuordnung benötigt Actor und Reason und schreibt das Audit innerhalb derselben PostgreSQL-Transaktion,
- deaktivierte Rollen behalten ihre Principal-Zuordnungen, erteilen aber keine rollenbasierten Rechte,
- Reaktivieren stellt die rollenbasierte Wirkung wieder her,
- Hard-Delete ist nur für inaktive, nicht zugewiesene `managed` Rollen zulässig,
- neue oder geänderte Rollen dürfen nur bereits bekannte Capability-IDs referenzieren,
- mehrere aktive Rollen pro Principal bleiben unterstützt.

## Bewusste Runtime-Grenze der Reference-App

Die Reference-App verwendet für normale Laufzeit-Berechtigungsentscheidungen denselben persistenten PostgreSQL-PermissionStore wie die Permission-Infrastruktur. Die früheren Environment-Allowlisten und der In-Memory-PermissionStore gehören nicht mehr zur normalen Reference-Runtime.

Für die bereits bestehende Reference-Preview gibt es vor dem ersten Deploy mit PostgreSQL-Authority einen separaten, explizit bestätigten `Reference Preview Permission Cutover`. Dieser liest die bisherigen Member-/Admin-Zuordnungen read-only aus den noch laufenden Cloudflare-Worker-Bindings, wendet ausschließlich die fehlenden versionierten Permission-Migrationen `0001` und `0002` an und persistiert beide bisherigen Rollenklassen. Ein normaler Reference-Deploy verändert diesen Zustand nicht; er prüft vor Build/Deploy lediglich fail-closed, dass Permissions Schema v3 und alle Legacy-Zuordnungen persistent vorhanden sind. Die alten Allowlist-Bindings bleiben während dieser Übergangsphase nur als Cutover-Nachweis erhalten und werden von der Runtime nicht mehr ausgewertet.

Der separate Demo-Bootstrap provisioniert die bekannten Demo-Rollen und ordnet dem Demo-Benutzer idempotent `demo:member` zu. Provisioning und Migrationen bleiben damit weiterhin strikt außerhalb des normalen Worker-Request-Pfads.

Der Rolleneditor bleibt dennoch zunächst ohne persistentes `Speichern`: Rollenadministration ist eine privilegierte Control-Plane-Funktion und wird nicht in den normalen App-Worker eingebaut. Die spätere Aktivierung des Editors benötigt einen getrennten, authentisierten Admin-Weg, der den bestehenden `PostgresRoleAdministration`-Vertrag mit verpflichtendem Actor/Reason und transaktionalem Audit verwendet.
