# Intervall-Countdown

Persistenzfreies AppBasis-Fachmodul für einen sportlichen Intervall-Countdown.

- Module ID: `countdown`
- Package: `@appbasis/countdown`
- App schema compatibility: 2
- Capability: `countdown:view`
- Database: none

## Fachlicher Vertrag

Das Modul modelliert deterministisch:

- konfigurierbare Anzahl von Übungen/Durchgängen,
- Belastungsdauer und Pausenzeit,
- getrennte Ansageintervalle für Belastung und Pause,
- Startsequenz `3, 2, 1, Los`,
- Einzelansage der letzten fünf Sekunden jeder Belastung und Pause,
- `Los` beim direkten Wechsel in den nächsten Durchgang,
- `Fertig` nach dem letzten Durchgang,
- aktuelle Phase, Durchgang und Restzeit aus einer verstrichenen Zeit.

Pause/Weiter/Reset und Sprachausgabe bleiben Consumer-Verantwortung. Weil das Modul
keinen eigenen laufenden Prozess oder Zustand persistiert, kann ein UI den
verstrichenen Timer beim Pausieren einfrieren und dadurch zugleich alle
Countdown-Cues anhalten.

Der Modulvertrag in `appbasis.module.json` bleibt Source of Truth für
Kompatibilität, Capabilities und optionalen Datenbankbesitz.
