# AppBasis – Current Gate

Stand: 2026-09-22

Diese Datei ist die operative, chatübergreifende Steuerung für den **aktuell zu
liefernden Gate-Scope**. Sie ersetzt keine Roadmap, ADR oder Security-Grenze.
Volatile PR-, CI-, Review- und Branch-Zustände werden ausschließlich live aus
GitHub abgeleitet.

## Aktuelles Ziel

**FC5 – Module kontrolliert zu bestehenden Apps hinzufügen/aktualisieren.**

FC4 ist für den aktuellen Produktpfad abgeschlossen: Modulvertrag,
Modul-Scaffolder, der persistenzfreie Intervall-Countdown und der normale
Generator-Verbrauch durch eine neue Countdown-Test-App sind reproduzierbar
abgedeckt. Der unmittelbare reale Produktverbraucher bleibt die ULC-Linz
Vereins-App.

Der direkte Umbau einer bestehenden generierten App ist ausdrücklich **nicht**
der Updatepfad. Bestehende Apps werden erst verändert, wenn der reproduzierbare
FC5-Modul-Installations-/Updatevertrag vorhanden ist.

## FC4-Abnahme – abgeschlossen

Für den aktuellen Produktpfad ist reproduzierbar und ausführbar belegt:

1. jedes Standardmodul besitzt einen strikten, maschinenlesbaren Modulvertrag;
2. Modul-ID, Paketname und App-Kompatibilität sind eindeutig;
3. Capability-IDs gehören eindeutig dem Modul;
4. optionales Datenbankschema und Migrationen gehören ausschließlich dem Modul;
5. Modulmanifest, reales Workspace-Paket und reale Migrationen können nicht
   unbemerkt auseinanderlaufen;
6. ein Modul kann über einen kanonischen Scaffolder neu erzeugt werden;
7. der Intervall-Countdown wird über diesen Pfad als erstes neues Modul erzeugt;
8. eine neue Test-App kann das Modul über den normalen Generator konsumieren;
9. CI/Tests bestätigen den vollständigen Vertical Slice auf demselben exakten
   Head.

FC4 erzeugt noch **keinen** generischen Produktions-Updater für bestehende Apps.

## Aktueller Gate-Scope: FC5

FC5 liefert den kontrollierten Updatepfad für bestehende Apps:

- vorhandene App und Modulversion lesen;
- Kompatibilität vor jeder Änderung fail-closed prüfen;
- geplante Datei-/Manifest-/Dependency-/Migrationsänderungen deterministisch
  ableiten;
- bestehende fachliche App-Erweiterungen nicht überschreiben;
- Preview/Tests vor Produktionsfreigabe;
- Produktionsmigration, Deployment und Release bleiben getrennte,
  ausdrücklich freizugebende Schritte.

Erster realer Verbraucher ist `ulc-linz` mit dem FC4-Countdown-Modul.

## Architektur- und Sicherheitsgrenzen

- Core bleibt fachneutral und klein.
- Fachmodule ändern keine Tabellen anderer Module.
- `createAppSkeleton()` bleibt der Pfad für **neue** Apps und wird nicht als
  Updater für bestehende Apps missbraucht.
- Vor FC5 werden bestehende ULC-Runtime- und M5/M6-Evidence-Verträge nicht nur
  für einen einzelnen Fachslice manuell umgebaut oder neu gepinnt.
- Permissions bleiben serverseitig; UI-Sichtbarkeit ist keine
  Sicherheitsgrenze.
- Keine neue allgemeine Policy-/ABAC-Engine.
- Keine Provider-Abstraktion ohne realen zweiten Bedarf.
- Keine Produktivdeployments, Providerwrites, Secret-Rotationen oder
  produktiven DB-Mutationen ohne ausdrückliche Nutzerfreigabe.

## Scope-Freeze für Review und Implementierung

Ein Finding blockiert den aktuellen FC4/FC5-Pfad, wenn mindestens eines gilt:

- der Modulvertrag ist nicht deterministisch oder nicht reproduzierbar;
- Paket, Capability, Datenbankbesitz oder Migrationen können vom Manifest
  unbemerkt abweichen;
- der neue Modulpfad kann bestehende Apps oder fremde Modulschemas
  überschreiben;
- Kompatibilität wird nur angenommen statt geprüft;
- eine bestehende Security-/Privacy-/Release-Grenze wird abgeschwächt;
- der unmittelbar benötigte Countdown-Vertical-Slice kann über den
  vorgesehenen Modulpfad nicht sicher erreicht werden.

Nicht gate-blockierend sind zusätzliche Plattformabstraktionen und allgemeines
Hardening ohne konkreten Verbraucher.

## Loop-Grenze

Für einen Arbeitspfad gilt:

1. Implementierung
2. vollständige CI
3. ChatGPT Diff-/Architektur-/Security-Prüfung
4. gebündelte Korrektur
5. Exact-Head-CI PASS
6. ein finaler Codex-Review
7. bei echtem Finding: genau ein gebündelter Fix + Exact-Head-CI + ein Re-Review

Kommt danach ein weiteres Finding derselben expandierenden Prüfklasse, wird
nicht blind weitergepatcht. Das Finding wird gegen diesen Gate-Vertrag
klassifiziert und entweder als neues abgegrenztes Arbeitspaket behandelt oder
zurückgestellt.

## Nächste Produktfolge

**FC5 Existing-App-Updater → ULC Preview → kontrollierte ULC
Produktionsvorbereitung.**

Der abgeschlossene FC4-Pfad bleibt die Referenz:
**Modulvertrag → Modul-Scaffolder → Countdown-Modul → Generator-Test-App.**

Eine produktive ULC-Änderung setzt danach weiterhin aktuelle Migration-,
Security/Privacy-, Backup/Restore-, Berechtigungs-, Deploy- und Smoke-Evidence
voraus. Die endgültige Produktionsfreigabe bleibt ein separates ausdrückliches
Gate.

## Arbeitsstart in jedem neuen Chat / jeder neuen Session

Vor Änderungen gilt überall dieselbe Reihenfolge:

1. `CURRENT-GATE.md` lesen
2. `AGENTS.md` lesen
3. GitHub Live-State vollständig prüfen
4. nur die für den aktuellen Gate-Entscheid relevanten ADRs/Roadmap-Abschnitte
   prüfen
5. kleinstes Arbeitspaket bis zum nächsten echten Gate ausführen

Wenn ein vorgeschlagener Schritt nicht notwendig ist, um FC4/FC5 oder den
unmittelbaren ULC-Vertical-Slice zu erreichen, wird er zurückgestellt.
