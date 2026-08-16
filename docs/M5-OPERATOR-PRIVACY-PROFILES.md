# M5 – Betreiber-/Datenschutzprofile als vorbereitete Factory-Defaults

## Zweck

Diese Datei hält die fachlich freigegebenen **Vorschläge** für drei spätere Betreiber-/Datenschutzprofile fest:

- Privat
- Verein
- Firma

Die Profile sind bewusst **noch kein produktionswirksamer Vertrag und keine M5-Evidenz**. Sie erzeugen insbesondere **kein** `productionReady=true`, keine Provideränderung und keine neue Production-Capability.

Die spätere Factory darf diese Werte erst dann als app-spezifische Nachweise verwenden, wenn ein realer schreibender Verbraucher existiert, die konkrete App die Auswahl ausdrücklich bindet und die tatsächliche technische bzw. organisatorische Erfüllung separat verifiziert wurde.

Damit bleibt ADR-012 eingehalten: keine neue allgemeine Plattformabstraktion ohne realen Verbraucher.

## Gemeinsame Regeln

Für alle drei Profile gelten folgende Grenzen:

- M5 bleibt all-required und fail-closed.
- Eine Profilwahl ersetzt keinen konkreten Nachweis für Datenregion, DPA/AVV, Verschlüsselung, Rollen/Rechte, Audit, Subprozessoren oder Providerzustand.
- Gesetzliche, vertragliche oder fachlich notwendige Aufbewahrungspflichten können die vorgeschlagenen Löschfristen für einzelne Datenklassen übersteuern; diese Ausnahme muss dokumentiert und auf die betroffenen Daten begrenzt bleiben.
- Kontosperre, Archivierung, Anonymisierung und endgültige Löschung bleiben unterschiedliche Zustände bzw. Operationen.
- Backups werden nicht selektiv manipuliert; gelöschte Daten laufen über die definierte Backup-Rotation aus und dürfen bei einem Restore nicht stillschweigend wieder dauerhaft aktiv werden.
- Exporte müssen berechtigungsgeprüft sein und dürfen keine fremden oder außerhalb des zulässigen Data Scopes liegenden personenbezogenen Daten enthalten.
- High Privacy wird nur dann als erfüllt gewertet, wenn die konkrete App-Bindung und die Erfüllung des kanonischen High-Privacy-Vertrags nachgewiesen sind.

## Profil A – Privat

Ziel: einfacher, datensparsamer Standard für private oder sehr kleine nicht-organisationale Anwendungen.

### Vorgeschlagene Defaults

| Bereich | Default |
|---|---|
| Aktive Benutzer-/Profildaten | solange Konto und Zweck aktiv sind |
| Inaktive Konten | Review nach 24 Monaten; Löschung/Anonymisierung spätestens nach 36 Monaten, sofern kein dokumentierter Grund zur weiteren Speicherung besteht |
| Normale Fachdaten | solange für den aktiven Zweck benötigt; danach löschen oder anonymisieren |
| Audit-/Security-Logs | 90 Tage |
| Konto-Löschung | Zugang sofort sperren; aktive personenbezogene Daten innerhalb von 30 Tagen löschen/anonymisieren, soweit keine dokumentierte Ausnahme gilt |
| Backup-Rotation | Zielwert maximal 35 Tage |
| Personenbezogener Export | strukturierter Export, bevorzugt JSON/CSV; zugehörige Dateien nur innerhalb des zulässigen Scopes |
| High Privacy | nicht automatisch aktiv; bei sensiblen Szenarien verpflichtend auswählbar |

## Profil B – Verein

Ziel: Standard für Vereinsbetrieb mit Mitgliedern, Gruppen, Trainings-/Teilnahmedaten und möglichen Kinder-/Jugenddaten.

### Vorgeschlagene Defaults

| Bereich | Default |
|---|---|
| Aktive Mitgliedsstammdaten | solange Mitgliedschaft bzw. konkreter Vereinszweck besteht |
| Vereinsaustritt | Benutzerzugang sofort deaktivieren |
| Kontakt-/Mitgliedsstammdaten | 12 Monate nach Austritt; danach löschen/anonymisieren, sofern keine dokumentierte Ausnahme gilt |
| Operative Vereins-/Teilnahme-/Trainingsdaten | 24 Monate; danach personenbezogene Anteile löschen/anonymisieren; anonyme Statistik darf getrennt bestehen bleiben |
| Besonders sensible zweckgebundene Zusatzdaten | 90 Tage nach Zweckende, sofern keine dokumentierte Ausnahme gilt |
| Audit-/Security-Logs | 12 Monate |
| Backup-Rotation | Zielwert maximal 35 Tage |
| Personenbezogener Export | Profil, Mitgliedschaft, Gruppen, Teilnahmen, Berechtigungen und eigene relevante Fachdaten/Dateien innerhalb des zulässigen Scopes |
| Organisations-Export | eigener rollen- und scopegeschützter Export; kein pauschaler unbeschränkter „alles exportieren“-Pfad |
| High Privacy | standardmäßig erforderlich, sobald Kinder, Schule oder andere sensible Daten betroffen sind |

## Profil C – Firma

Ziel: Standard für geschäftliche Anwendungen mit Kunden, Geschäftspartnern, Mitarbeitenden und operativen Vorgängen.

### Vorgeschlagene Defaults

| Bereich | Default |
|---|---|
| Aktive Kunden-/Geschäftspartnerdaten | solange Vertrags-/Geschäftszweck besteht |
| Nach Vertrags-/Geschäftsende | Review nach 24 Monaten; danach löschen/anonymisieren, sofern keine dokumentierte Ausnahme gilt |
| Normale operative Vorgangsdaten | Review nach 36 Monaten; danach löschen/anonymisieren, soweit kein weiterer legitimer Zweck dokumentiert ist |
| Ausgeschiedene Mitarbeitende | Benutzerzugang sofort deaktivieren |
| Nicht aufbewahrungspflichtige Benutzer-/Profildaten | grundsätzlich innerhalb von 12 Monaten entfernen/anonymisieren |
| Audit-/Security-Logs | 12 Monate; längere Frist nur app-spezifisch begründet |
| Backup-Rotation | Zielwert maximal 35 Tage |
| Personenbezogener Export | strukturierter personenbezogener Export, bevorzugt JSON/CSV plus zulässige Dateien |
| Unternehmens-Export | fachlicher Export über eigenen Berechtigungs-/Auditpfad |
| High Privacy | nicht generell automatisch; verpflichtend bei sensiblen Daten/Szenarien |

## Gemeinsamer späterer Lebenszyklus

Der spätere technische Verbraucher soll die Profile nicht als drei getrennte Löschsysteme implementieren. Bevorzugter gemeinsamer Ablauf:

`aktiv -> optional archiviert -> Frist/Review erreicht -> Löschprüfung -> anonymisieren oder löschen -> Backup-Rotation läuft aus`

Dokumentierte Sperr-/Aufbewahrungsgründe dürfen nur die konkret betroffene Datenklasse zurückhalten. Andere fällige Daten bleiben löschbar.

## Aktueller Zielrahmen für die erste echte Produktiv-App

Für die erste reale Produktiv-App ist fachlich bereits festgelegt:

- Betreiberart: **Verein**
- gewünschte Produktions-Datenregion: **EU / Frankfurt**
- High-Privacy-Profil: **ja**

Diese drei Entscheidungen sind derzeit **Planungs-/Policy-Input, noch keine app-spezifische M5-Evidenz**. Die vorhandene technische App `m3-preview` wird dadurch ausdrücklich nicht stillschweigend zur ersten Vereins-Produktiv-App erklärt.

## Spätere Factory-Nutzung

Sobald ein realer schreibender Factory-Verbraucher für Datenschutz-/Betreiberkonfiguration existiert, kann die Oberfläche sinngemäß anbieten:

`Datenschutzprofil: Privat | Verein | Firma`

Danach zeigt die Factory die vorgeschlagenen Fristen transparent an und verlangt vor Produktion eine bewusste Bestätigung oder Anpassung. Erst eine an die konkrete App gebundene, validierte Konfiguration plus die jeweils notwendigen technischen/Provider-/Betreibernachweise darf M5-Kriterien verifizieren.

Bis dahin:

- kein neues Feld in `appbasis.app.json`,
- keine zweite Konfigurationsschicht,
- keine automatische M5-Evidenz,
- keine Produktionsfreigabe.
