## Ziel / nutzbarer ULC-Linz-Slice

<!-- Welche bestehende Funktion oder welcher Betreiber-Blocker ist nach diesem PR wirklich besser? -->

## Scope und Nicht-Ziele

- Betroffene Dateien / Verträge:
- Unverändert zu lassen (bestehende mobile Abläufe, Daten, Rechte):

## Vorabprüfung und Risiken

- [ ] Aktiven Kopf von CURRENT-GATE.md, GitHub-Live-Stand und betroffene Pfade geprüft
- [ ] Auth/Persistenz/Datenschutz/Provider-Folgen geprüft oder nicht betroffen
- [ ] Bei Codeänderung angrenzende Fehlerpfade und Folgeschritte geprüft

## Tests und unabhängige Kontrolle

- Gezielt ausgeführt:
- CI: PASS / FAIL / ausstehend (exakte URL/SHA nachtragen)
- Codex-Review: risikobasiert erforderlich / nicht erforderlich / ausstehend
- Betreiberprüfung (nur bei verändertem Verhalten):

## Ressourceneinsatz

- Ein Codex-Implementierungsauftrag; nur ein finales risikobasiertes Review statt pro Commit
- Work nur wenn externe UI zwingend benötigt; kein paralleles Bearbeiten derselben Aufgabe
- Keine wiederholten Workflow-Läufe ohne Root-Cause-/Folgeprüfung

## Freigaben

- [ ] Keine Merge-/Produktivdeploy-/DB-/Secret-/Löschfreigabe in diesem PR enthalten
- Betreiberentscheidung notwendig für:
