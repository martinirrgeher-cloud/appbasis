# K2-R02 – RPO/RTO-Evidenz und Wiederanlauf (Entwurf)

Stand: 15.11.2026. **Kein Produktiv-Go; keine Provideraktion.**

## Ausgangslage

Die verschlüsselte K2-Preview-Sicherung [#43645974462](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43645974462) und der isolierte Datenbank-Restore [#43647364218](https://github.com/martinirrgeher-cloud/appbasis/actions/runs/43647364218) belegen einen technischen Snapshot-Restore. Sie belegen **weder betriebliches RPO/RTO noch Medien-, App- oder Rollen-Restore**. Diese Vorlage ergänzt #633–#637.

## Zeitmodell (Korrektur des bisherigen Auswertungsmodells)

- **incidentAt:** fachlich bestätigter Beginn der Nichtverfügbarkeit oder des Datenverlustereignisses. Nicht stillschweigend durch den Zeitpunkt der Entdeckung ersetzen.
- **recoveryPointAt:** letzter nachweislich wiederherstellbarer konsistenter Datenstand **vor** dem Ereignis.
- **sourceSnapshotAt:** verifizierter Snapshot-Bezugszeitpunkt, höchstens so spät wie recoveryPointAt.
- **restoreStartedAt / restoreFinishedAt:** rein technische Datenbank-Restore-Teilphase.
- **serviceVerifiedAt:** Zeitpunkt, zu dem Login/Sitzungen, Rollen und RLS, R2-Medien, Routing, Kernmodule **und menschliche Abnahme** erfolgreich verifiziert sind.
- **evidenceRecordedAt:** Zeitpunkt, zu dem diese Evidenz erfasst wurde. Darf RPO/RTO **nicht** verlängern oder verkürzen.

**RPO-Istwert = incidentAt − recoveryPointAt.**
**RTO-Istwert = serviceVerifiedAt − incidentAt.**
**DB-Teilphase = restoreFinishedAt − restoreStartedAt; niemals stellvertretend für RTO.**

Bei schleichender Datenkorruption, unklarem Ausfallbeginn, mehreren betroffenen Datenquellen oder fehlender Wiederherstellbarkeit: **BLOCK** bis zur gesonderten fachlichen Aufklärung. Der Prüfer verlangt eindeutige UTC-Belege und kann kein Störungsereignis eigenständig feststellen. Verfügbare Medien mit anderem Sicherungszeitpunkt sind getrennt zu bewerten; der gemeinsame Recovery Point ist der älteste tatsächlich wiederherstellbare konsistente Stand der erforderlichen Komponenten.

### Synthetisches Beispiel (kein gemessener Betrieb)

| Zeitpunkt | Beispiel |
| --- | --- |
| Recovery Point | 02:45 UTC |
| Störung | 03:00 UTC |
| DB-Restore | 03:05–03:20 UTC (15 Minuten) |
| App/Medien/Rechte vollständig verifiziert | 03:40 UTC |
| Evidenz erfasst | 04:00 UTC |

Ergebnis: RPO **15 Minuten**, RTO **40 Minuten**, technische DB-Restore-Dauer **15 Minuten**. Eine spätere Auswertung um 08:00 UTC ändert diese Werte nicht. Wären maximal 30 Minuten RPO und 35 Minuten RTO vorab genehmigt, wäre der Fall **RTO FAIL** – obwohl `pg_restore` nur 15 Minuten beansprucht.

## Offline-Prüfung

`node --test tooling/ulc-linz-k2-recovery-objectives.test.mjs`

Die reine Funktion `evaluateK2RecoveryObjectives` benötigt sieben UTC-Zeitpunkte, die vorab fachlich festgelegten Grenzwerte in ganzen Minuten und sieben explizite Kontrollnachweise: `sourceVerified`, `restoreVerified`, `mediaVerified`, `roleAndRlsVerified`, `appAndRoutingVerified`, `humanAcceptanceVerified`, `evidenceIndependent`. Chronologiefehler werfen einen Fehler; unvollständige Belege und Überschreitung führen zu `BLOCK`. Jeder synthetische PASS liefert **maximal** `READY_FOR_HUMAN_REVIEW`, niemals Freigabe zur Aktivierung.

Die Belege müssen getrennt dokumentiert und überprüft werden; `true`-Flags allein beweisen keine tatsächliche Wiederherstellbarkeit. Zur Zeitmessung gehört der Beginn des echten Vorfalls, nicht bloß der Start eines späteren Restore-Tests. Die Software erfasst keine Live-Evidenz, ruft keine Provider-API auf und verarbeitet keine echten personenbezogenen Datensätze.

## Betreiberentscheidungen – zwingende Stop-Gates

1. Datenverlust- und Wiederanlaufziel schriftlich **vor** dem Ernstfall festlegen; Störungsbeginn, maßgebliche Datenquellen, Verantwortliche und Alarmierungsweg definieren.
2. Reale Medien-Restore-Evidenz getrennt von SQL verifizieren; Benutzerrechte/RLS, Login und Routing mit isolierten Testidentitäten und Kernmodulen nachweisen.
3. Datenschutz, Legal Holds und Re-Deletion gelöschter personenbezogener Datensätze nach Restore gesondert prüfen.
4. Mindestens zwei unabhängig wiederherstellbare Sicherungspunkte, Schlüsselwiederbeschaffung und Quarantäne nachweisen.
5. E2E-Zeitachse samt menschlicher Abnahme und konsistenter Wiederherstellung aller kritischen Komponenten dokumentieren.
6. Gesondert entscheiden über tägliche Backup-Aktivierung, R2-Retention/Lifecycle-Regeln und Produktivnahme.

**Default: BLOCKED.** Kein Merge, Deploy, Provider-/Secret-Write, Backup-Run, Restore-Run oder Go-live durch dieses Paket.
