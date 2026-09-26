# ULC Linz – Intervall-Countdown Vertical Slice

Stand: 2026-09-23

## Ziel

Der erste reale FC5-Verbraucher soll nicht nur das Modul `countdown` im
ULC-Manifest deklarieren, sondern einen tatsächlich nutzbaren mobilen
Intervall-Countdown liefern. Preview ist erst sinnvoll, wenn dieser
fachliche Vertical Slice lokal und in CI geschlossen ist.

## Verbindlicher Funktionsumfang

- Anzahl der Übungen/Durchgänge konfigurierbar.
- Belastungsdauer konfigurierbar.
- Pausenzeit konfigurierbar.
- Getrennte Zwischenansage-Intervalle für Belastung und Pause.
- Startfolge: `3, 2, 1, Los`.
- Restzeitansagen gemäß konfiguriertem Intervall.
- Letzte fünf Sekunden von Belastung und Pause immer einzeln.
- Nach der letzten Pausensekunde folgt direkt `Los` für den nächsten Durchgang.
- Nach dem letzten Durchgang folgt `Fertig`.
- Belastung wird in der UI rot, Pause grün dargestellt.
- Pause stoppt Zeitfortschritt und Sprachausgaben gemeinsam.
- Reset setzt den Ablauf vollständig auf den Anfang zurück.

## Stufen

### D1 – Domainvertrag

`@appbasis/countdown` erhält einen persistenzfreien, deterministischen
Zeitplan-/Snapshot-Vertrag. Keine Providerwrites, keine Datenbank, keine ULC-
Produktionsänderung.

### D2 – ULC Runtime und Berechtigung

ULC konsumiert ausschließlich den öffentlichen Modulvertrag. Zugriff bleibt
serverseitig fail-closed und wird an den bestehenden ULC-Rollen-/Permission-
Vertrag angebunden. Keine Production-Evidence wird dabei revalidiert.

### D3 – Mobile ULC UI

Mobile-first Bedienung mit Start, Pause/Weiter, Reset, Belastung/Pause-Farbe und
Browser-Sprachausgabe. Die UI darf keine Berechtigungsgrenze ersetzen.

### D4 – isolierte ULC Preview

Erst nach D1–D3 wird eine eigene ULC-Preview vorbereitet. Der bestehende
ULC-Runtime-Vertrag mit getrenntem Application- und Security-Log-Hyperdrive
bleibt erhalten; die generische Single-Hyperdrive-Preview darf dafür nicht
blind wiederverwendet werden.

## Nach D4 – Production Revalidation

D4 wurde mit echtem ULC-Preview-Zugang abgenommen. Danach wurde die durch FC5
notwendig gewordene Production-Evidence für den Countdown-Scope getrennt neu
durchlaufen: M5, kontrollierter workers.dev Pilot-Ingress, dedizierter
Smoke-Principal und Post-Deploy-Smoke sind auf demselben akzeptierten
Produktions-Head erfolgreich.

Dieser Schritt revalidiert den aktuellen FC5-Verbraucher; er schließt **nicht**
M6 erneut ab und erteilt keine finale Produktionsfreigabe.

## Abgrenzung

Dieser Slice autorisiert weder Produktion noch produktive Migrationen,
Providerwrites, Secret-Rotationen oder eine Neuberechnung der bisherigen
M5/M6-Production-Evidence.
