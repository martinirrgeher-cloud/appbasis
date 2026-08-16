# M6 – Erste echte Produktiv-App

## Ziel

M6 beweist den ersten kontrollierten technischen End-to-End-Produktionspfad für eine eigenständige AppBasis-App.

Die Vorbereitungsslices implementieren ausschließlich einen **read-only, fail-closed M6-Release-Readiness-Status** im Factory-Snapshot und dessen Anzeige. Sie erstellen keine Produktionsressourcen, führen keine produktiven Migrationen aus und besitzen keinen Release-Endpunkt.

M6 ist nicht gleichbedeutend mit „Factory Complete“. Der wiederholbare Factory-Lifecycle wird erst nach dem bewiesenen ersten Produktionspfad in FC1 verallgemeinert.

## Roadmap-Voraussetzungen und App-Gates

M1 und M2 bleiben globale Roadmap-Voraussetzungen für M6. Sie werden bewusst nicht als dauerhaft wiederholte per-App-Felder modelliert.

Der Factory-Vertrag beschreibt nur die semantischen Nachweise, die für die konkrete erste Produktiv-App relevant sind:

1. Preview geprüft
2. eigene Produktionsdatenbank bereit
3. eigener Produktions-Worker bereit
4. eigene Domain bereit
5. produktive Benutzer & Rechte bereit
6. Backup & Recovery geprüft
7. Security & Privacy geprüft
8. kontrollierte Produktionsmigrationen ausgeführt
9. Produktions-Deploy abgeschlossen
10. Post-Deploy-Smoke erfolgreich

Diese Liste definiert die erforderlichen Nachweise, aber noch **keine allgemeine Provider-Orchestrierung**. Die konkrete sichere Reihenfolge externer Writes wird erst mit der ersten echten Produktions-App und ihren realen Providerabhängigkeiten festgelegt.

Nur der exakte boolesche Wert `true` gilt für einen Nachweis als verifiziert. Fehlende, falsche, truthy oder geerbte Werte bleiben offen. Unbekannte zusätzliche Felder können kein Pflichtkriterium ersetzen.

Erst wenn alle zehn Nachweise verifiziert sind, ist `technicalEvidenceVerified=true`. Dieser Zustand bestätigt ausschließlich die gesammelte technische Evidenz und ist ausdrücklich **keine** Produktionsfreigabe.

## Ausdrückliche Freigabe bleibt separat

Die vom Nutzer ausdrücklich zu erteilende Produktionsfreigabe wird **bewusst nicht als dauerhaftes Readiness-Flag gespeichert**.

Ein statischer Snapshot darf keine frühere Zustimmung in eine spätere Produktionsaktion hineintragen. Eine zukünftige schreibende Produktionsaktion muss deshalb unmittelbar vor dem externen Write eine frische, ausdrückliche Freigabe verlangen und die dann aktuellen Gates erneut prüfen.

Der M6-Snapshot führt deshalb `explicitApprovalRequired=true` und gleichzeitig invariant `releaseAuthorized=false`. Selbst bei zehn technisch verifizierten Kriterien autorisiert dieser read-only Vertrag keinen Release. Die vorhandene Factory-Capability `releaseProduction` bleibt ebenfalls unverändert `false`.

## Slice 1 – Factory-lokaler M6-Readiness-Vertrag

`tooling/factory-ui/production-release-readiness.mjs` ist bewusst klein und Factory-lokal:

- keine neue Provider-Abstraktion,
- keine zweite Generatorimplementierung,
- kein Deployment- oder Provisionierungsadapter,
- keine Speicherung von Secrets, Provider-IDs oder Benutzerfreigaben,
- semantische per-App-Gates statt Roadmap-Meilensteinflags,
- fail-closed Auswertung,
- keine Release-Autorisierung aus Readiness-Evidenz.

Der Factory-Snapshot liefert pro App zusätzlich `productionReleaseReadiness`.

Aktuell wird daraus ausschließlich ein bereits vorhandener echter Vertrag wiederverwendet: `securityPrivacyReady` darf nur dann als belegt einfließen, wenn der bestehende M5-Vertrag selbst `productionReady=true` liefert. Da M5 gegenwärtig noch nicht vollständig verifiziert ist, bleibt auch dieses M6-Kriterium offen.

Für Preview, Backup/Recovery und die späteren Produktionsschritte erfindet dieser Slice ausdrücklich keine statischen Erfolgssignale. Solange kein belastbarer maschinenlesbarer Nachweis angebunden ist, bleiben die jeweiligen Kriterien offen.

## Slice 2 – M6-Status in der bestehenden Factory-Detailansicht

Die bestehende Produktions-Gate-Kachel zeigt zusätzlich zum M5-Status nun auch den read-only M6-Nachweisstand:

- derselbe bereits geladene Factory-Snapshot liefert M5 und M6; es gibt keinen zweiten Request und keinen parallelen M6-UI-State,
- der Anzeigeadapter importiert den kanonischen `REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA`-Vertrag direkt; es gibt keine zweite Kriterienliste,
- `explicitApprovalRequired` muss `true` und `releaseAuthorized` muss `false` sein,
- inkonsistente, umsortierte oder widersprüchliche Payloads werden als `M6 nicht verifiziert` dargestellt,
- bei unvollständiger Evidenz werden nur Fortschritt und Zahl der offenen Nachweise gezeigt; es wird kein Erfolg suggeriert,
- auch vollständige technische Evidenz wird ausdrücklich nicht als Release-Autorisierung dargestellt.

Der bestehende Factory-Server liefert dafür ausschließlich das bereits vorhandene read-only M6-Vertragsmodul als statisches JavaScript-Modul aus. Es entsteht weder ein neuer API-Endpunkt noch ein neuer Write-Pfad.

Damit ist der bereits vorhandene M6-Vertrag im späteren Factory-Bedienfluss sichtbar, ohne einen Release-Schalter oder eine neue schreibende Control-Plane-Funktion einzuführen.

## Slice 3 – M3-Acceptance als konkreter Preview-Nachweis

Nach dem real erfolgreichen M3-Post-Deploy-Acceptance-Lauf kann das erste M6-Kriterium für die tatsächlich geprüfte generierte App `m3-preview` read-only belegt werden.

`tooling/factory-ui/m3-preview-acceptance-evidence.mjs` enthält dafür keine neue Preview- oder Providerimplementierung, sondern ausschließlich einen kleinen, auditierbaren Verweis auf den erfolgreichen GitHub-Actions-Nachweis:

- Workflow `M3 Preview Post-Deploy Acceptance`,
- `workflow_dispatch` auf `main`,
- erfolgreicher Run `31961655064`,
- Run-Head `f230825c66cf7fa891b6b0cef4da77f79128cad2`,
- M3-Deploymentvertrag über einen SHA-256-Digest an den bereits bestehenden gepinnten Source-/Worker-Version-Vertrag gebunden,
- vollständige akzeptierte App-Definition über einen zweiten kanonischen SHA-256-Digest gebunden.

Der zugrunde liegende M3-Lauf hat vor dem Erfolg unter anderem die migrierte Preview-Datenbank, den exakt gepinnten ursprünglichen Worker-Deploy, Health, anonyme Runtime-Grenze, Datenbankbindung sowie den authentifizierten Permission-/Tasks-Acceptance-Smoke geprüft.

Der Adapter liefert `previewAccepted=true` ausschließlich für `m3-preview`, wenn Run-Metadaten, M3-Vertragsdigest und der Digest der aktuell gelesenen App-Definition exakt dem attestierten Zustand entsprechen. Wird der gepinnte M3-Deploymentvertrag oder die App-Definition später geändert, ist die bestehende Attestation nicht mehr gültig und das Gate fällt automatisch wieder fail-closed auf offen, bis ein neuer echter Acceptance-Nachweis vorliegt.

Run-ID, Head-SHA und beide Digests bleiben interne technische Evidenz. Der Factory-Snapshot und die normale Oberfläche erhalten weiterhin nur den semantischen Boolean-Nachweis; Provider-IDs und Secrets werden dort nicht sichtbar gemacht.

Damit steigt `m3-preview` im M6-Snapshot auf `1/10` technisch geprüfte Nachweise. Die übrigen neun Kriterien bleiben unverändert offen; insbesondere werden weder M4 noch M5 noch Produktionsressourcen aus dem M3-Erfolg abgeleitet.

## Sicherheitsgrenze

Diese Slices verändern nicht:

- `createAppSkeleton()` und den maßgeblichen Generatorpfad,
- M3-Preview-Deployments oder Preview-Datenbanken,
- M4-Backup-/Restore-Providerzustand,
- M5-Kriterien oder deren Semantik,
- App-Manifeste,
- gemeinsame Runtime-/Security-Foundation,
- Produktionsdatenbanken, Worker, Domains oder Secrets.

Es existiert weiterhin kein Factory-Release-Endpunkt und kein produktiver Provider-Write.

## Nächste sichere Slices

1. Backup/Recovery nur dann read-only in den M6-Snapshot einspeisen, wenn M4 einen belastbaren maschinenlesbaren Nachweis liefert.
2. Security & Privacy ausschließlich über den bestehenden M5-Vertrag übernehmen; keine Abkürzung aus einzelnen Repository-Fakten.
3. Für die erste reale Produktions-App konkrete Ressourcen-Nachweise ergänzen, ohne einen allgemeinen Multi-Provider-Provisioner vorwegzubauen.
4. Erst nach M4 und M5 DONE einen getrennten, ausdrücklich freizugebenden Produktionsworkflow für die erste App entwerfen.
5. Post-Deploy-Smoke aus den bewährten M3-Prüfmustern für diese konkrete Produktions-App ableiten.

## Abgrenzung zu FC1

M6 beweist **einen** echten Produktionspfad. Erst wenn dieser reale Verbraucher existiert und die notwendigen Verträge bewiesen sind, darf FC1 daraus den wiederholbaren Factory-Lifecycle `App anlegen → Preview → Tests → Production` ableiten.
