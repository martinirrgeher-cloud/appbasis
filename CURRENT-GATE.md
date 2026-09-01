# AppBasis – Current Gate

Stand: 2026-09-01

Diese Datei ist die operative, chatübergreifende Steuerung für den **aktuell zu liefernden Gate-Scope**. Sie ersetzt keine Roadmap, ADR oder Security-Grenze. Bei Widerspruch gelten die höher priorisierten Projektquellen.

## Aktuelles Ziel

**M5 – Security & Privacy Ready v0.1 abschließen und danach unmittelbar zur produktiven AppFactory-Entwicklung zurückkehren.**

M5 ist ein Gate auf dem Weg zur AppFactory und kein eigenständiges Forschungs- oder Hardening-Projekt.

## Verbindliche M5-Abnahme

M5 umfasst genau die zwölf Pflichtpunkte der Roadmap:

1. Datenregion geklärt
2. AVV/DPA geklärt
3. Verschlüsselung bewertet
4. Rollen/Rechte geprüft
5. Löschkonzept vorhanden
6. Aufbewahrungskonzept vorhanden
7. Datenexport vorhanden/definiert
8. Audit-/Security-Logging vorhanden
9. Subprozessoren dokumentiert
10. High-Privacy-Profil für sensible Szenarien definiert
11. Secrets/Credentials getrennt vom normalen App-Manifest
12. privilegierte Control-Plane-Funktionen nicht unnötig öffentlich erreichbar

M5 ist DONE, wenn diese Punkte nachvollziehbar geprüft/angezeigt werden und fehlende Punkte fail-closed sperren.

## Scope-Freeze für Review und Implementierung

Ein Finding blockiert das aktuelle Gate nur, wenn mindestens eines gilt:

- es verletzt einen der zwölf M5-Pflichtpunkte;
- es verletzt eine bereits beschlossene ADR-/Security-/Privacy-Grenze;
- es eröffnet einen real erreichbaren Sicherheits-, Datenschutz-, Datenverlust- oder Berechtigungspfad im aktuellen Produkt-/Betriebsvertrag;
- es macht den unmittelbar benötigten Evidence-/Factory-Pfad falsch oder nicht reproduzierbar.

Nicht gate-blockierend sind insbesondere neue theoretische Hardening-Anforderungen, zusätzliche Provider-/PostgreSQL-Vollständigkeitsbeweise oder Architekturverbreiterungen, die keinen der obigen Punkte verletzen. Solche Findings werden dokumentiert und ins Backlog verschoben.

**Codex erweitert den vereinbarten Gate-Scope nicht nachträglich.** Codex darf reale Verletzungen des eingefrorenen Vertrags aufdecken; daraus entsteht aber nicht automatisch ein neuer Gate-Vertrag.

## Loop-Grenze

Für einen Arbeitspfad gilt:

1. Implementierung
2. vollständige CI
3. ChatGPT Diff-/Architektur-/Security-Prüfung
4. gebündelte Korrektur
5. Exact-Head-CI PASS
6. ein finaler Codex-Review
7. bei echtem Finding: genau ein gebündelter Fix + Exact-Head-CI + ein Re-Review

Kommt danach ein weiteres Finding derselben expandierenden Prüfklasse, wird **nicht weiter gepatcht**. Der Pfad wird eingefroren und das Finding gegen diesen Current-Gate-Vertrag klassifiziert. Danach nur:

- real gate-blockierend → ein neu abgegrenztes Arbeitspaket;
- nicht gate-blockierend → Backlog/Hardening.

Keine fortlaufende Finding→Fix→Review-Schleife.

## Volatile Arbeitszustände

Konkrete PR-Heads, CI-Ergebnisse, Reviewstände, offene Threads, Mergeability und temporäre Freeze-Entscheidungen werden **nicht** in dieser Datei dauerhaft geführt. Sie werden bei jedem Arbeitsstart aus dem verpflichtenden GitHub-Live-State ermittelt.

Hat ein aktuell live ermittelter Arbeitspfad die oben definierte Loop-Grenze erreicht, wird er nicht durch weitere Findings derselben expandierenden Prüfklasse erweitert. Vor einer weiteren Änderung wird der bestehende Stand ausschließlich gegen die eingefrorene M5-Abnahme und bestehende ADR-/Security-Grenzen klassifiziert. Ein neuer Code-Fix ist nur zulässig, wenn daraus ein konkreter M5-Blocker hervorgeht.

## Out of Scope für den aktuellen Gate-Abschluss

- allgemeine PostgreSQL-Hardening-Vollständigkeit über den realen M5-Bedrohungs-/Betriebsvertrag hinaus
- neue Plattformabstraktionen ohne aktuellen Verbraucher
- neue Providerdienste ohne Gate-Notwendigkeit
- zusätzliche öffentliche Runtime-/Admin-Pfade
- Produktivdeployments, Providerwrites, Secret-Rotationen oder produktive DB-Mutationen ohne ausdrückliche Nutzerfreigabe
- M6-Detailhardening, das M5 nicht blockiert

## Nächstes Produktziel nach M5

Unmittelbar nach M5 geht der Hauptstrang zurück auf Produktfortschritt:

**AppFactory bedienen → echte App über den kanonischen Generator erzeugen → Preview ansehen/testen → nutzbaren Vertical Slice verbessern.**

Security/Privacy/Backup bleiben verbindliche Gates, dürfen aber die Produktentwicklung nicht ohne konkreten Gate-Grund verdrängen.

## Arbeitsstart in jedem neuen Chat / jeder neuen Session

Vor Änderungen:

1. `AGENTS.md` lesen
2. `CURRENT-GATE.md` lesen
3. GitHub Live-State vollständig prüfen
4. nur die für den aktuellen Gate-Entscheid relevanten ADRs/Roadmap-Abschnitte prüfen
5. kleinstes Arbeitspaket bis zum nächsten echten Gate ausführen

Wenn ein vorgeschlagener Schritt nicht notwendig ist, um den Current Gate oder den unmittelbar folgenden Produkt-Vertical-Slice zu erreichen, wird er zurückgestellt.
