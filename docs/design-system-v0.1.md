# AppBasis Design System v0.1

## Ziel

AppBasis verwendet appübergreifend dieselben Layout- und Komponentenprinzipien. Kunden- und App-Unterschiede werden primär über semantische Theme-Tokens abgebildet, nicht über unabhängige Fachmodul-Designsysteme.

Dieser Stand ist der erste ausführbare Vertical Slice. Er wird in der Reference-App anhand der Rollenübersicht bewiesen, bevor weitere UI-Abstraktionen verallgemeinert werden.

## Verbindliche Gestaltungsentscheidungen

- Mobile First ist der primäre Entwurfsmodus.
- Mobile Hauptnavigation: Bottom Navigation mit maximal fünf Haupteinträgen.
- Desktop Hauptnavigation: linke Sidebar.
- Visueller Charakter: modern, kompakt, ruhig und funktionsorientiert.
- Fachmodule nutzen dieselbe AppShell, denselben PageHeader und dieselben Interaktionsmuster.
- Rollenbearbeitung wird als Detailseite mit Tabs `Allgemein | Berechtigungen | Benutzer` aufgebaut.
- Listenaktionen liegen im PageHeader.
- Längere Editoren verwenden einen sticky Editor-Header. Primäre Aktionen wie `Speichern` bleiben direkt sichtbar; `Schließen` liegt rechts daneben. Kritische Primäraktionen werden nicht in einem Overflow-Menü versteckt.
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

Der erste ausführbare Slice enthält nur die für die Rollenübersicht benötigten allgemeinen Grundlagen:

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

Weitere Komponenten wie Tabs, Selects, Dialoge, Bottom Sheets, Tabelleninteraktion, Skeletons, Toasts und Editor-ActionHeader werden in den nächsten realen Fachslices ergänzt und danach verallgemeinert.

## Rollenmodul – Architekturgrenze im ersten Slice

Das bestehende Permission-Modell wird nicht ersetzt oder parallel implementiert.

Bereits vorhanden:

- `RoleBundle` mit technischer `roleId` und Capabilities
- `PrincipalPermissions.roleIds[]`
- persistente Principal-Role-Zuordnung mit mehreren Rollen pro Principal
- deny-by-default
- individuelle Grants/Revokes

Noch nicht im Rollenvertrag vorhanden:

- Anzeigename
- Beschreibung
- Aktiv/Inaktiv-Status
- Verwaltungsmetadaten für einen sicheren Lifecycle

Der erste Rollen-Slice zeigt deshalb ausschließlich echte Daten aus den vorhandenen RoleBundles. Eine menschenlesbare UI-Bezeichnung wird nur aus der technischen Role-ID abgeleitet und nicht persistiert.

Bevor `Rolle anlegen`, `Rolle bearbeiten` oder `Rolle deaktivieren` produktiv werden, muss entschieden werden, wie diese Metadaten innerhalb des bestehenden Permission-Owned Schemas ergänzt werden. Eine parallele Rollen-Metadatenlogik in einer Fachapp ist ausdrücklich nicht vorgesehen.
