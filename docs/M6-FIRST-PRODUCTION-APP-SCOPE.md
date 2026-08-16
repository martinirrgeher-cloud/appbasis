# M6 – Erste echte Produktiv-App

## Ziel

M6 beweist den ersten kontrollierten technischen End-to-End-Produktionspfad für eine eigenständige AppBasis-App.

Dieser Vorbereitungsslice implementiert ausschließlich einen **read-only, fail-closed M6-Lifecycle-Status** im Factory-Snapshot. Er erstellt keine Produktionsressourcen, führt keine produktiven Migrationen aus und besitzt keinen Release-Endpunkt.

M6 ist nicht gleichbedeutend mit „Factory Complete“. Der wiederholbare Factory-Lifecycle wird erst nach dem bewiesenen ersten Produktionspfad in FC1 verallgemeinert.

## Verbindlicher Produktionspfad

Der kanonische M6-Vertrag führt genau diese geordneten Nachweise:

1. Designsystem & Rollen (M1) bereit
2. Factory-Erzeugung (M2) bereit
3. Preview geprüft (M3)
4. Backup & Recovery geprüft (M4)
5. Security & Privacy geprüft (M5)
6. eigene Produktionsdatenbank bereit
7. eigener Produktions-Worker bereit
8. eigene Domain bereit
9. produktive Benutzer & Rechte bereit
10. kontrollierte Produktionsmigrationen ausgeführt
11. Produktions-Deploy abgeschlossen
12. Post-Deploy-Smoke erfolgreich

Nur der exakte boolesche Wert `true` gilt für einen Nachweis als verifiziert. Fehlende, falsche, truthy oder geerbte Werte bleiben offen. Unbekannte zusätzliche Felder können kein Pflichtkriterium ersetzen.

Erst wenn alle zwölf Nachweise verifiziert sind, ist `productionVerified=true`.

## Ausdrückliche Freigabe bleibt separat

Die vom Nutzer ausdrücklich zu erteilende Produktionsfreigabe wird **bewusst nicht als dauerhaftes Readiness-Flag gespeichert**.

Ein statischer Snapshot darf keine frühere Zustimmung in eine spätere Produktionsaktion hineintragen. Eine zukünftige schreibende Produktionsaktion muss deshalb unmittelbar vor dem externen Write eine frische, ausdrückliche Freigabe verlangen und die dann aktuellen Gates erneut prüfen.

Der M6-Snapshot führt lediglich `explicitApprovalRequired=true`. Die vorhandene Factory-Capability `releaseProduction` bleibt unverändert `false`.

## Slice 1 – Factory-lokaler M6-Lifecycle-Vertrag

`tooling/factory-ui/production-release-readiness.mjs` ist bewusst klein und Factory-lokal:

- keine neue Provider-Abstraktion,
- keine zweite Generatorimplementierung,
- kein Deployment- oder Provisionierungsadapter,
- keine Speicherung von Secrets, Provider-IDs oder Benutzerfreigaben,
- kanonische Reihenfolge vom M1–M5-Gate bis zum Post-Deploy-Smoke,
- fail-closed Auswertung.

Der Factory-Snapshot liefert pro App zusätzlich `productionLifecycleReadiness`.

Aktuell wird daraus ausschließlich ein bereits vorhandener echter Vertrag wiederverwendet: `m5Ready` darf nur dann als belegt einfließen, wenn der bestehende M5-Vertrag selbst `productionReady=true` liefert. Da M5 gegenwärtig noch nicht vollständig verifiziert ist, bleibt auch dieses M6-Kriterium offen.

Für M1–M4 und die späteren Produktionsschritte erfindet dieser Slice ausdrücklich keine statischen Erfolgssignale. Solange kein belastbarer maschinenlesbarer Nachweis angebunden ist, bleiben die jeweiligen Kriterien offen.

## Sicherheitsgrenze

Dieser Slice verändert nicht:

- `createAppSkeleton()` und den maßgeblichen Generatorpfad,
- M3-Preview-Deployments oder Preview-Datenbanken,
- M4-Backup-/Restore-Providerzustand,
- M5-Kriterien oder deren Semantik,
- App-Manifeste,
- gemeinsame Runtime-/Security-Foundation,
- Produktionsdatenbanken, Worker, Domains oder Secrets.

Es existiert weiterhin kein Factory-Release-Endpunkt und kein produktiver Provider-Write.

## Nächste sichere Slices

1. M1–M4 nur dann read-only in den M6-Snapshot einspeisen, wenn ein bestehender technischer Nachweis die jeweilige Aussage tatsächlich belegt.
2. Den M6-Lifecycle read-only in der bestehenden Factory-Detailansicht sichtbar machen, ohne Release-Schalter oder Write-Pfad.
3. Für die erste reale Produktions-App konkrete Provider-/Ressourcen-Nachweise ergänzen, ohne einen allgemeinen Multi-Provider-Provisioner vorwegzubauen.
4. Erst nach M3, M4 und M5 DONE einen getrennten, ausdrücklich freizugebenden Produktionsworkflow entwerfen.
5. Post-Deploy-Smoke aus den bewährten M3-Prüfmustern für die konkrete erste Produktions-App ableiten.

## Abgrenzung zu FC1

M6 beweist **einen** echten Produktionspfad. Erst wenn dieser reale Verbraucher existiert und die notwendigen Verträge bewiesen sind, darf FC1 daraus den wiederholbaren Factory-Lifecycle `App anlegen → Preview → Tests → Production` ableiten.
