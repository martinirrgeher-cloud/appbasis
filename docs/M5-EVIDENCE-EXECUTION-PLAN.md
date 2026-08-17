# M5 – Evidence Execution Plan

Stand: 2026-08-17

## Zweck

Dieser Plan zerlegt `Production Security & Privacy Ready v0.1` in kleine, app-spezifische Nachweispakete für die erste reale Ziel-App **ULC Linz**. Er ist Vorbereitung und setzt kein Kriterium auf `verified`. M5 bleibt all-required und fail-closed.

## Verbindlicher Zielrahmen

- Betreiber: Verein
- Datenbankregion: EU / Frankfurt
- High Privacy: verpflichtend
- konkrete Ziel-App: ULC Linz
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

Diese Grundlagen sind nur dann M5-Evidenz, wenn der jeweilige Nachweis an ULC und die tatsächliche Zielumgebung gebunden wird.

## Arbeitspakete

| Paket | Ziel | Ergebnis | Abhängigkeit | Aktive Arbeit |
|---|---|---|---|---:|
| M5-A | Zielbindung | Verein, EU/Frankfurt und High Privacy werden kanonisch an ULC gebunden | keine | 0,5–1 h |
| M5-B | Rollen & Rechte | ULC-Rollen, Modulrechte, Organisation sowie `self`/`managed` werden serverseitig konsumiert und positiv/negativ getestet | M5-A | 1–2 h |
| M5-C | Löschung | Deaktivieren, Archivieren, Anonymisieren und Löschen werden je Datenklasse getrennt und auditiert | M5-A | 2–4 h |
| M5-D | Aufbewahrung | Fristen und Reviewpunkte je ULC-Datenklasse werden bestätigt und technisch prüfbar | M5-A | 2–3,5 h |
| M5-E | Export | Self-/Managed-Export und privilegierter Organisations-Export werden scopegeschützt, auditiert und getestet | M5-B | 2–4 h |
| M5-F | Audit & Security Logging | relevante Auth-, Rollen-, Permission- und Adminereignisse sowie Zugriffsschutz und Retention werden belegt | M5-B, M5-D | 1–2 h |
| M5-G | Provider & Compliance | Region, Verschlüsselung, DPA und Subprozessoren werden gegen die tatsächlich verwendeten Dienste geprüft | konkrete Ressourcen/Dienste | 2–4 h |
| M5-H | Control Plane | ULC-Providerzustand belegt keinen unnötigen öffentlichen Ingress privilegierter Komponenten | konkrete Runtime | 1–2 h |
| M5-I | High Privacy | kanonisches Profil wird an ULC gebunden und seine Erfüllung geprüft | M5-B–H | 0,5–1 h |
| M5-J | Gate Consumer | alle zwölf Nachweise werden fail-closed im Factory-Snapshot zusammengeführt | M5-A–I | 1–2 h |

## Schnellste sichere Parallelisierung

### Entwicklungsstrang

1. M5-A Zielbindung
2. M5-B Rollen & Rechte
3. M5-E Export
4. M5-C/M5-D Löschung und Aufbewahrung
5. M5-F Audit
6. M5-I/M5-J finale Bindung

### Codex-freier Vorbereitungsstrang

Parallel dürfen ohne Zwischenreview vorbereitet werden:

- Provider-/DPA-/Subprozessoren-Inventar
- Datenklassen- und Fristenentscheidung
- Exportformat und Feldumfang
- Acceptance-Fälle und erwartete Evidenzquellen
- Review- und Freshness-Zeitpunkte veränderlicher Nachweise

Codex wird erst auf dem tatsächlichen finalen Head eines technischen Consumers angefordert. Reine Vorbereitung erhält keinen vorsorglichen Review.

## Definition DONE

M5 ist nur DONE, wenn alle zwölf kanonischen Kriterien für ULC app-spezifisch `verified` sind, `productionReady=true` aus exakt diesen Nachweisen folgt und Exact-Head-CI sowie der finale Review ohne Blocker abgeschlossen sind. Eine Produktionsfreigabe folgt daraus nicht automatisch.
