# M5 – Evidence Execution Plan

Stand: 2026-08-17

## Zweck

Dieser Plan zerlegt `Production Security & Privacy Ready v0.1` in kleine, app-spezifische Nachweispakete für die erste reale Ziel-App **ULC Linz**. Er setzt kein Kriterium allein aufgrund einer Policy-Entscheidung auf `verified`. M5 bleibt all-required und fail-closed.

## Verbindlicher Zielrahmen

- Betreiber: Verein
- Datenbankregion: EU / Frankfurt
- High Privacy: verpflichtend
- konkrete Ziel-App: ULC Linz
- Provider-Scope für M5 v0.1: ausschließlich **Cloudflare + Neon/PostgreSQL**
- keine zusätzlichen Analytics-, E-Mail-, Tracking- oder externen Storage-Dienste in diesem Scope
- technische Preview- und Reference-Nachweise werden nicht automatisch auf ULC übertragen
- externe Providerwrites, Produktionsressourcen und Produktionsfreigaben bleiben getrennt zustimmungspflichtig

## Bereits vorhandene technische Grundlagen

- Secrets bleiben außerhalb der App-Manifeste.
- Persistente Permissions arbeiten deny-by-default.
- ULC-Rollen- und Data-Scope-Verträge sind vorbereitet.
- ULC-Modulrechte können auf Principal Overrides abgebildet und auditiert ersetzt werden.
- Der letzte aktive ULC-Administrator ist gegen unzulässige Herabstufung geschützt.
- Für getrennte privilegierte Control Planes existiert ein ausführbares Reference-Muster.
- M4 hat einen realen isolierten Restore mit funktionalem Anwendungssmoke bewiesen.
- Die ULC-M5-Zielbindung ist auf `main` bereits maschinenprüfbar an Betreiberprofil **Verein**, Produktions-Datenregionsziel **EU / Frankfurt** und das kanonische High-Privacy-Profil gebunden (PR #126).

Diese Grundlagen sind nur dann M5-Evidenz, wenn der jeweilige Nachweis an ULC und die tatsächliche Zielumgebung gebunden wird.

## Bestätigte Betreiber-Policy

Am 2026-08-17 wurden für ULC Linz bestätigt:

- Mitglieds-/Kontaktstammdaten: 12 Monate nach Austritt/Zweckende, danach löschen oder belastbar anonymisieren.
- Operative Trainings-/Teilnahmedaten: 24 Monate, danach löschen oder irreversibel anonymisieren; rein anonyme/statistische Daten dürfen erhalten bleiben.
- Besonders sensible Zusatzdaten: 90 Tage nach Zweckende; medizinische Diagnosen/Gesundheitsakten werden in v0.1 nicht als normaler App-Datenbestand vorgesehen.
- Audit-/Security-Daten: 12 Monate.
- Backup-Rotation: maximal 35 Tage; Restore darf bereits gelöschte Daten nicht dauerhaft wieder aktivieren.
- Medien: folgen grundsätzlich dem zugehörigen Datensatz; verwaiste Medien spätestens nach 30 Tagen entfernen.
- Export: JSON ist der kanonische vollständige Export; CSV darf ergänzend für einfache tabellarische Daten angeboten werden.
- Provider-Scope: ausschließlich Cloudflare und Neon/PostgreSQL.

Diese Werte sind verbindlicher Policy-Input, aber keine technische M5-Evidenz.

## Arbeitspakete

| Paket | Ziel | Ergebnis | Abhängigkeit | Status / Restarbeit |
|---|---|---|---|---:|
| M5-A | Zielbindung | Verein, EU/Frankfurt und High Privacy werden kanonisch an ULC gebunden | keine | **DONE als Zielbindung**; keine M5-Evidenz daraus ableiten |
| M5-B | Rollen & Rechte | ULC-Rollen, Modulrechte, Organisation sowie `self`/`managed` werden serverseitig konsumiert und positiv/negativ getestet | M5-A + reale ULC-Runtime | 1–2 h technisch |
| M5-C | Löschung | Deaktivieren, Archivieren, Anonymisieren und Löschen werden je Datenklasse getrennt und auditiert | bestätigte Policy + reale ULC-Runtime | **Policy bestätigt**; 2–4 h technisch |
| M5-D | Aufbewahrung | bestätigte Fristen und Reviewpunkte je ULC-Datenklasse werden technisch prüfbar | bestätigte Policy + reale ULC-Runtime | **Fristen bestätigt**; 2–3,5 h technisch |
| M5-E | Export | Self-/Managed-Export und privilegierter Organisations-Export werden scopegeschützt, auditiert und getestet | M5-B | **Format bestätigt**; 2–4 h technisch |
| M5-F | Audit & Security Logging | relevante Auth-, Rollen-, Permission- und Adminereignisse sowie Zugriffsschutz und Retention werden belegt | M5-B, M5-D | **Retention bestätigt**; 1–2 h technisch |
| M5-G | Provider & Compliance | Region, Verschlüsselung, DPA und Subprozessoren werden gegen Cloudflare + Neon geprüft | konkrete Ressourcen/Dienste | **Provider-Scope bestätigt**; 2–4 h Evidenzarbeit |
| M5-H | Control Plane | ULC-Providerzustand belegt keinen unnötigen öffentlichen Ingress privilegierter Komponenten | konkrete Runtime | 1–2 h nach realer ULC-Runtime |
| M5-I | High Privacy | kanonisches Profil wird an ULC gebunden und seine Erfüllung geprüft | M5-B–H | 0,5–1 h |
| M5-J | Gate Consumer | alle zwölf Nachweise werden fail-closed im Factory-Snapshot zusammengeführt | M5-A–I | 1–2 h |

## M5-A – Zielbindung

### Status

M5-A ist als **stabile Zielentscheidung** bereits abgeschlossen. PR #126 hat `ulc-linz` über den bestehenden Generator-/Verify-Pfad maschinenprüfbar an folgende kanonische Zielwerte gebunden:

- Betreiberprofil `Verein`
- Produktions-Datenregionsziel `EU / Frankfurt`
- High-Privacy-Profil `appbasis-high-privacy-v0.1`
- erforderliche Plattformdienste `identity` und `permissions`

Diese Bindung ist bewusst **keine** Production-Readiness-Evidenz. Insbesondere bleiben `dataRegion`, `highPrivacyProfile` und weitere app-/providerabhängige Kriterien offen, bis reale ULC-Evidenz vorliegt. M5-A wird deshalb nicht erneut implementiert und erhält keinen parallelen zweiten Policy-/Manifestvertrag.

## M5-G – Provider-Scope

Für v0.1 sind ausschließlich Cloudflare und Neon/PostgreSQL im personenbezogenen Produktivdaten-Scope. M5-G muss deshalb nur für diese tatsächlich verwendeten Provider/Dienste aktuelle Evidenz für Datenregion, Verschlüsselung, DPA/AVV, Subprozessoren sowie relevante Backup-/Retention-Grenzen erfassen.

Ein später zusätzlich eingeführter Analytics-, E-Mail-, Tracking- oder Storage-Dienst erweitert den Scope automatisch und hält M5-G so lange `open`, bis die zusätzliche Provider-Evidenz vollständig ist.

Provider-/DPA-/Subprozessoren-Nachweise bleiben veränderliche Evidenz und müssen mit `observedAt` sowie einem Review-/Ablaufzeitpunkt geführt werden. Keine historischen Providerangaben werden dauerhaft als Freigabe behandelt.

## M5-H – Control-Plane-Ausführungsplan

### Sicherheitsziel

M5-H verifiziert ausschließlich privilegierte ULC-Komponenten. Die normale öffentliche ULC-App-Runtime darf den vorgesehenen öffentlichen Ingress besitzen; privilegierte Admin-/Control-Plane-Komponenten dürfen dagegen nicht direkt aus dem Internet erreichbar sein. Das Reference-Muster ist nur Vorlage für die Nachweisform und darf nicht als ULC-Evidenz übernommen werden.

### Voraussetzungen

Technische ULC-Verifikation beginnt erst, wenn eine konkrete ULC-Runtime existiert. M5-A liefert die kanonische App-/Zielbindung bereits; aktuell fehlt noch die reale ULC-Runtime-/Providerressource. Bis dahin bleibt M5-H für ULC `open`. Worker-Namen, Provider-Ressourcen-IDs oder Accountdetails werden nicht vorab erfunden und nicht in das normale App-Manifest geschrieben.

### Autoritative Evidenz

Für jede privilegierte ULC-Komponente muss der spätere read-only Providercheck mindestens folgende Punkte gegen die tatsächlich gebundene Cloudflare-Zielumgebung prüfen:

1. Die erwartete privilegierte Worker-Ressource existiert im erwarteten Account genau einmal.
2. `workers.dev` ist für diese Ressource deaktiviert.
3. Preview-URLs sind für diese Ressource deaktiviert.
4. Die Ressource besitzt keine Custom Domain.
5. Die Ressource besitzt keine öffentliche Worker Route.
6. Providerantworten und optionale Pagination-/Result-Metadaten sind strukturell konsistent; unvollständige oder mehrdeutige Inventare werden nicht akzeptiert.
7. Falls die ULC-App die privilegierte Komponente benötigt, ist die erwartete interne Service-Binding-Beziehung zur öffentlichen ULC-Runtime eindeutig nachweisbar; eine öffentliche Ersatzroute ist kein zulässiger Fallback.
8. Der Nachweis gehört zur exakten ULC-App und Zielumgebung und darf nicht aus `reference`, Preview oder einer anderen App wiederverwendet werden.

### Fail-closed-Fälle

M5-H bleibt oder fällt auf `open`, sobald einer der folgenden Fälle eintritt:

- erwartete privilegierte Ressource fehlt, ist mehrfach oder nicht eindeutig identifizierbar
- Providerzugriff schlägt fehl, liefert ungültiges JSON oder `success != true`
- `workers.dev` oder Preview-URLs sind nicht explizit deaktiviert
- mindestens eine Custom Domain oder Worker Route ist vorhanden
- Domain-/Route-Inventar oder Pagination-Metadaten sind widersprüchlich oder unvollständig
- erwartete interne Binding-Beziehung fehlt oder zeigt auf eine andere Ressource
- Evidenz ist für falsche App, falsche Umgebung oder falschen Provideraccount gebunden
- Evidenz ist älter als die zulässige Freshness
- der Evidenzlauf verwendete eine andere, nicht vertrauenswürdig gebundene Workflow-Revision
- Uhrzeit, GitHub-Zustand oder Providerzustand können nicht verlässlich bestimmt werden

Es gibt keinen Fallback auf ältere erfolgreiche Evidenz, wenn ein neuerer relevanter Lauf fehlschlägt oder noch läuft.

### Freshness und Repository-Grenze

Für v0.1 gilt als Ziel maximal 24 Stunden Freshness und eine erneute Prüfung vor dem Production-Gate. Volatile Providerdaten, Run-IDs, Attempts, beobachtete Zeitpunkte oder Ablaufzeitpunkte werden nicht als Repositoryzustand committed. Im Repository verbleibt nur stabile Policy; der spätere Consumer entdeckt den neuesten passenden Evidence-Run dynamisch und validiert dessen Aktualität und vertrauenswürdige Workflow-Revision.

### Geplante technische Umsetzung

Sobald die reale ULC-Runtime vorhanden ist:

1. Die bereits abgeschlossene M5-A-Zielbindung liefert die stabile ULC-App-/Zielbindung.
2. Der existierende Reference-Ingress-Verifier wird als konkretes Muster wiederverwendet; keine zweite driftende Generator- oder Providerarchitektur entsteht.
3. Erst bei realem ULC-Verbraucher werden notwendige gemeinsame Verifier-Primitiven minimal extrahiert; keine vorsorgliche Plattformabstraktion.
4. Ein ULC-spezifischer Evidence-Workflow läuft read-only aus `main` gegen die exakte Zielumgebung und verwendet Secrets nur aus der geschützten CI-/Providergrenze.
5. Der Factory-Consumer akzeptiert nur den neuesten passenden Lauf, maximal 24 Stunden alt und an die vertrauenswürdige Workflow-Revision gebunden.
6. Adversarial Tests decken mindestens öffentliches `workers.dev`, Preview-URL, Custom Domain, Route, falsche Ressource, falsche App/Umgebung, inkonsistente Providerantwort, stale Evidence und Workflow-Drift ab.
7. Danach vollständige Exact-Head-CI; Codex wird später auf dem tatsächlichen finalen technischen Head nachgeholt.

### Aktueller Arbeitsstand

Der Reference-spezifische technische Consumer läuft in PR #134 als ausführbares Vorbild für die spätere ULC-Evidenzbindung. Er darf ausschließlich `reference` verifizieren und wird nicht als ULC-Evidenz wiederverwendet. Die ULC-spezifische technische Verifikation bleibt bis zur realen ULC-Runtime bewusst `open`.

## Schnellste sichere Parallelisierung

### Entwicklungsstrang

1. M5-A Zielbindung – **DONE**
2. reale ULC-Runtime über den kanonischen `createAppSkeleton()`-Pfad herstellen
3. M5-B Rollen & Rechte
4. M5-E Export
5. M5-C/M5-D Löschung und Aufbewahrung
6. M5-F Audit
7. M5-G/H Provider-/Control-Plane-Evidenz
8. M5-I/M5-J finale Bindung

### Codex-freier Vorbereitungsstrang

Parallel dürfen ohne Zwischenreview vorbereitet werden:

- Cloudflare-/Neon-DPA-/Subprozessoren-Inventar und Evidenzschema
- Export-Feldumfang für JSON/CSV
- Acceptance-Fälle und erwartete Evidenzquellen
- Review- und Freshness-Zeitpunkte veränderlicher Nachweise
- M5-H Control-Plane-Ingress-/Binding-Acceptance gemäß obigem Ausführungsplan

Die Datenklassen-, Retention-, Medien-, Exportformat- und Provider-Scope-Entscheidungen sind bestätigt. Codex wird erst später auf den tatsächlich finalen technischen Heads nachgeholt.

## Definition DONE

M5 ist nur DONE, wenn alle zwölf kanonischen Kriterien für ULC app-spezifisch `verified` sind, `productionReady=true` aus exakt diesen Nachweisen folgt und Exact-Head-CI sowie der finale Review ohne Blocker abgeschlossen sind. Eine Produktionsfreigabe folgt daraus nicht automatisch.
