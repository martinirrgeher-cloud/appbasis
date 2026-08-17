# M5-G – ULC Provider & Compliance Plan

Stand: 2026-08-17

## Zweck

Dieser Plan konkretisiert M5-G für die erste reale Ziel-App **ULC Linz** auf Basis der bestätigten Betreiberentscheidung, dass M5 v0.1 ausschließlich **Cloudflare** und **Neon/PostgreSQL** als externe Provider umfasst.

Er ist ausschließlich Evidence-/Acceptance-Vorbereitung. Er behauptet nicht, dass Datenregion, AVV/DPA, Verschlüsselung oder Subprozessoren bereits verifiziert sind, führt keine Provideränderung aus und setzt kein M5-Kriterium auf `verified`.

## Bestätigter Provider-Scope

Für M5 v0.1 gilt:

- Cloudflare
- Neon/PostgreSQL
- keine zusätzlichen Analytics-Dienste
- keine externen E-Mail-Dienste
- kein Tracking-Dienst
- kein externer Object Storage

Sobald später ein zusätzlicher Dienst personenbezogene Daten verarbeitet, muss der Scope vor Production Ready erweitert und M5-G erneut vollständig bewertet werden.

## Zu belegende M5-Kriterien

M5-G liefert bzw. unterstützt autoritative Evidenz für:

1. `dataRegion`
2. `dpa`
3. `encryption`
4. `subprocessors`

Die Kriterien bleiben unabhängig voneinander. Ein erfolgreicher Nachweis eines Kriteriums darf kein anderes Kriterium implizit verifizieren.

## Cloudflare – erforderliche Evidenz

### Ressourcenbindung

Der Nachweis muss an die konkrete ULC-Zielumgebung gebunden sein und mindestens eindeutig bestimmen:

- Account/Zielumgebung
- öffentliche ULC-Runtime
- gegebenenfalls privilegierte ULC-Control-Plane-Komponenten
- tatsächlich verwendete Bindings und externen Datenflüsse

Keine Reference-, Preview- oder fremde App-Ressource darf als ULC-Evidenz wiederverwendet werden.

### Datenregion

Cloudflare-Evidenz darf nur dann zu `dataRegion` beitragen, wenn für den tatsächlich personenbezogene Daten verarbeitenden Dienst ein autoritativer, für die konkrete ULC-Konfiguration passender Regions-/Residency-Zustand bestimmt werden kann. Fehlt eine eindeutige Aussage oder ist der verwendete Dienst nicht regional bindbar, bleibt das Kriterium offen und muss über die Gesamtarchitektur bewertet werden.

### Verschlüsselung

Für jeden tatsächlich genutzten Cloudflare-Datenpfad muss getrennt belegt werden:

- Transportverschlüsselung
- Verschlüsselung persistenter Providerdaten, soweit solche Daten dort überhaupt gespeichert werden
- Secret-Grenze außerhalb normaler App-Manifeste und Repositorydaten

Eine allgemeine Providerbeschreibung ohne Bindung an den verwendeten Dienst reicht nicht aus.

### AVV/DPA und Subprozessoren

Der Nachweis muss die zum Prüfzeitpunkt gültige Vertrags-/Dokumentversion und die für den tatsächlich verwendeten Cloudflare-Dienst relevante Subprozessorenlage erfassen. Historische Dokumente oder nicht mehr aktuelle Listen verifizieren M5 nicht dauerhaft.

## Neon/PostgreSQL – erforderliche Evidenz

### Zielressource und Datenregion

Für die spätere ULC-Produktivdatenbank muss autoritativ belegt werden:

- exakte ULC-Produktivdatenbank bzw. Projekt-/Branch-Zuordnung
- tatsächliche Produktionsregion
- Übereinstimmung mit dem bestätigten Ziel **EU / Frankfurt**

Preview-/Testdatenbank und Produktionsdatenbank werden getrennt bewertet. Eine Preview-Region beweist die Produktionsregion nicht.

### Verschlüsselung

Für die konkrete ULC-Produktivdatenbank müssen mindestens belegt werden:

- verschlüsselte Verbindung zur Datenbank
- Verschlüsselung persistenter Daten beim Provider
- Verschlüsselungs-/Schutzstatus von Backups bzw. providerseitigen Recovery-Kopien, soweit für die verwendete Neon-Konfiguration relevant
- keine Datenbank-Credentials in App-Manifest, Repository oder normalem Factory-Snapshot

### AVV/DPA und Subprozessoren

Für Neon müssen die zum Prüfzeitpunkt gültigen Vertrags-/Datenschutzunterlagen und die aktuelle Subprozessorenliste gegen den real genutzten Dienstumfang geprüft werden. Der Evidence-Output hält Prüfzeitpunkt und Reviewzeitpunkt fest; die Dokumente selbst werden nicht als dauerhafte Wahrheit im Repository eingefroren.

## Datenfluss-Inventar

Vor `verified` muss für ULC v0.1 ein kleines, app-spezifisches Datenfluss-Inventar vorliegen:

| Datenfluss | Quelle | Ziel | personenbezogen | Pflichtnachweis |
|---|---|---|---|---|
| Browser → ULC Runtime | Benutzergerät | Cloudflare Runtime | ja | TLS / Zielbindung |
| ULC Runtime → Produktiv-DB | Cloudflare Runtime | Neon/PostgreSQL | ja | TLS / DB-Zielbindung / Region |
| CI/Control Plane → Provider APIs | geschützte CI-/Admin-Grenze | Cloudflare/Neon | Metadaten, ggf. privilegiert | Secret-Grenze / Audit / Least Privilege |
| Backup/Recovery | Neon/PostgreSQL | providerseitige Recovery-Kopien | ja | Verschlüsselung / Retention / Restore-Grenze |

Nicht vorhandene Datenflüsse werden nicht künstlich ergänzt.

## Freshness

Provider-, Vertrags- und Subprozessoren-Evidenz ist veränderlich. Der spätere Evidence-Output benötigt mindestens:

- `observedAt`
- Dokument-/Konfigurationsreferenz
- konkrete App-/Umgebungsbindung
- `validUntilOrReviewAt`

Abgelaufene, nicht abrufbare, widersprüchliche oder nicht eindeutig ULC-gebundene Evidenz fällt fail-closed auf `open`.

## Fail-closed-Fälle

M5-G bleibt offen, wenn mindestens einer dieser Fälle eintritt:

- ein tatsächlich verwendeter Provider/Dienst fehlt im Inventar
- Produktionsressource oder Zielumgebung ist nicht eindeutig identifizierbar
- Produktionsregion kann nicht autoritativ als EU / Frankfurt bestätigt werden
- DPA-/AVV- oder Subprozessoren-Nachweis fehlt, ist veraltet oder nicht dem Dienstumfang zuordenbar
- Transport- oder At-Rest-Verschlüsselung kann für einen relevanten Datenpfad nicht belegt werden
- Credentials oder Secretwerte gelangen in Manifest, Repository oder normalen Factory-Snapshot
- Preview-/Reference-Evidenz wird als Produktionsnachweis verwendet
- Providerantworten oder Metadaten sind unvollständig bzw. widersprüchlich
- Evidence-Freshness ist überschritten

## Technische Reihenfolge

1. Reale ULC-Runtime im Repository herstellen.
2. Später tatsächlich verwendete Cloudflare- und Neon-Produktionsressourcen eindeutig binden; keine Ressource vorab erfinden.
3. Read-only Provider-/Konfigurationsevidenz erfassen.
4. Aktuelle DPA-/AVV- und Subprozessorenunterlagen für exakt diese beiden Provider prüfen.
5. Datenfluss-Inventar gegen reale Runtime/Bindings bestätigen.
6. Vier M5-Kriterien getrennt auswerten; fehlende Teilnachweise bleiben `open`.
7. Factory-Gate erst nach app-spezifischer, frischer Evidenz aktualisieren.
8. Vollständige Exact-Head-CI und ChatGPT-Diff-/Architektur-/Security-Prüfung.
9. Finalen Codex-Review gemäß aktueller Sammelstrategie später nachholen; bis dahin kein Merge final-review-pflichtiger technischer Consumer.

## Produktionsgrenze

Dieser Plan autorisiert weder das Anlegen einer Cloudflare- noch einer Neon-Produktionsressource. Produktive Ressourcen, produktive Datenbankänderungen, Secrets, Deployments und Produktionsfreigaben benötigen weiterhin eine separate ausdrückliche Zustimmung.
