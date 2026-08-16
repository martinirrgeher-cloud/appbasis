# M5 – ULC Linz Rollen-, Data-Scope- und Export-Vorbereitung

## Zweck und Evidenzgrenze

Diese Datei konkretisiert M5 Phase B für die erste reale Ziel-App **ULC Linz** anhand des aktuellen fachlichen Quellstands `martinirrgeher-cloud/ulc-linz` auf Commit `682ed5d37e7206f7fa521e5dab40f840cc303f0b`.

Sie ist **Vorbereitung, keine M5-Evidenz**. Insbesondere werden `rolesRights`, `retention`, `deletionConcept`, `dataExport` oder `highPrivacyProfile` dadurch nicht auf `verified` gesetzt. Die spätere technische Ziel-App muss die Regeln serverseitig umsetzen und mit positiven sowie negativen Smokes beweisen.

## 1. Rollenmodell, das erhalten werden muss

Die bestehende ULC-App verwendet genau vier Rollen:

- `admin`
- `trainer`
- `athlete`
- `parent`

Die Rolle allein genügt außer bei `admin` nicht als Fachberechtigung. Nicht-Admins erhalten explizite Modulrechte `canView` / `canEdit`. `canEdit=true` impliziert `canView=true`.

### Admin

- administriert den eigenen Verein
- verwaltet Benutzer, Rollen und Modulrechte
- sieht Vereinsmitglieder und das Auditprotokoll
- darf nicht auf Daten eines anderen Vereins zugreifen
- der letzte aktive Administrator darf nicht deaktiviert oder herabgestuft werden

### Trainer

`trainer` bleibt eine gemeinsame technische Rolle; die heutige Fachsemantik wird über unterschiedliche Permission-Templates erhalten:

**Kindertrainer**

- View + Edit: `kindertraining`, `u12`, `u14`, `countdown`

**Leistungstrainer**

- View: `performance_registration`, `training_planning`, `training_overview`, `training_documentation`, `exercise_catalog`, `training_blocks`, `athletes`, `countdown`
- Edit: `performance_registration`, `training_planning`, `training_documentation`, `exercise_catalog`, `training_blocks`, `athletes`, `countdown`
- `training_overview` bleibt in diesem Template read-only

Diese beiden Trainerprofile dürfen nicht vorschnell zu getrennten globalen AppBasis-Rollen abstrahiert werden. Sie sind zunächst ULC-spezifische Rollen-/Capability-Bundles auf dem vorhandenen Permissions-Vertrag.

### Athlete

- View: `performance_registration`, `training_overview`, `training_documentation`, `countdown`
- Edit: `performance_registration`, `training_documentation`, `countdown`
- `training_overview` bleibt read-only
- genau eine direkte Athleten-Selbstverknüpfung (`relation_type=self`) ist zulässig

### Parent

- View: `kindertraining`, `u12`, `u14`
- Edit: keine dieser Berechtigungen
- ein Elternkonto darf mit mehreren betreuten Athleten verknüpft sein (`relation_type=managed`)
- keine stillschweigende Erweiterung auf andere Athleten oder andere Vereine

## 2. Harte Data-Scope-Grenzen

### Organisationsgrenze

Alle fachlichen Datenzugriffe bleiben auf die konkrete `organizationId` begrenzt. Ein Benutzer ohne aktive Mitgliedschaft darf keine Vereins- oder Athletendaten sehen. Daten eines zweiten Vereins sind unabhängig von Rolle oder Modulrecht ausgeschlossen.

### Profil-/Mitgliedschaftsgrenze

- `admin`: Mitglieder/Profiles des eigenen Vereins im administrativen Pfad
- Nicht-Admin: grundsätzlich eigenes Profil und eigene Mitgliedschaft
- Admin-Audit ist nicht automatisch für Trainer/Athlet/Parent sichtbar

### Athletendaten

Athletenstammdaten sind personenbezogen und teilweise minderjährigenbezogen. Der bestehende Quellstand erlaubt Leserechte nur, wenn ein dafür vorgesehenes Fachmodul benötigt wird; Bearbeitung der Athletenstammdaten setzt das `athletes`-Editrecht voraus.

Für die Ziel-App reicht deshalb ein grobes `athletes:read` nicht als alleinige M5-Evidenz. Der spätere Fachpfad muss mindestens Organisation, Modulrecht und – sobald personenbezogene Self-/Managed-Sichten umgesetzt werden – die Athletenverknüpfung gemeinsam prüfen.

### Self / Managed

- `athlete` → höchstens ein `self`-Athlet
- `parent` → null bis mehrere `managed`-Athleten
- Trainer-/Adminzugriffe entstehen nicht durch diese Links, sondern über ihre eigenen Rollen-/Modulgrenzen
- Verknüpfungen dürfen nur innerhalb derselben Organisation bestehen

## 3. Pflicht-Smokes für `rolesRights`

Das spätere app-spezifische M5-Kriterium `rolesRights` darf erst nach serverseitiger Implementierung und mindestens folgenden positiven/negativen Smokes als erfüllt gelten:

1. Admin darf die vorgesehenen ULC-Rollen-/Permission-Zuordnungen des eigenen Vereins verwalten.
2. Admin kann keinen zweiten Verein lesen oder verändern.
3. Kindertrainer kann Kindertraining/U12/U14 gemäß Template bearbeiten, aber keinen nicht zugewiesenen Leistungsbereich.
4. Leistungstrainer kann seine vorgesehenen Module bearbeiten; `training_overview` bleibt im Template read-only.
5. Athlete kann nur die vorgesehenen eigenen Fachpfade bearbeiten und keine Admin-/Trainerfunktion ausführen.
6. Parent kann Kindertraining/U12/U14 lesen, aber dort nicht schreiben.
7. Parent darf keine nicht verknüpften Athleten über einen personenbezogenen Self-/Managed-Pfad erhalten.
8. Benutzer ohne aktive Mitgliedschaft wird deny-by-default abgewiesen.
9. Unbekannte Capability, Rolle oder Scope-Kombination wird deny-by-default abgewiesen.
10. Der letzte aktive Admin kann nicht durch einen normalen Rollenwrite entfernt werden.

## 4. Exportumfang für M5

Der Vereins-Default aus `M5-OPERATOR-PRIVACY-PROFILES.md` wird für ULC wie folgt konkretisiert, bleibt aber bis zur technischen Umsetzung offen:

### Personenbezogener Export

Innerhalb des zulässigen Self-/Managed-Scopes:

- Profil
- Mitgliedschaft
- eigene bzw. zulässig verknüpfte Gruppenbezüge
- eigene/zulässig verknüpfte Teilnahmen und Trainingsdaten
- eigene Berechtigungen
- eigene relevante Fachdatensätze
- später zugehörige Dateien/Medien, sobald Object Storage im ULC-Zielpfad umgesetzt ist

Format-Ziel: strukturierter Export, bevorzugt JSON/CSV; Dateien separat referenziert oder gebündelt, ohne fremde Daten einzuschließen.

### Organisations-Export

Ein Organisations-Export ist ein **eigener privilegierter, auditierter Pfad**. Er darf nicht als unbeschränkter generischer „alles exportieren“-Endpunkt entstehen. Vor M5-Verifikation sind mindestens Rollen-/Scope-Prüfung, Auditierung, definiertes Format und ein Negativtest gegen Cross-Organization-Export erforderlich.

## 5. ULC-Datenklassen für Retention/Löschung

Die folgenden Klassen bilden die erste app-spezifische Zuordnung der bereits vorbereiteten Vereins-Defaults. Sie sind noch zu bestätigen und technisch umzusetzen.

| Datenklasse | Beispiele ULC | vorbereiteter Vereins-Default |
|---|---|---|
| Mitglied/Account | Profil, Membership, Rollen, Berechtigungen, Einladungsstatus | aktive Daten solange Zweck/Mitgliedschaft besteht; nach Austritt Zugang sofort deaktivieren; Stammdaten Ziel 12 Monate |
| Athleten-/Trainer-Stammdaten | Name, Geburtsjahr, Notizen, Gruppen, User-Verknüpfungen | Kontakt-/Mitgliedsstammdaten Ziel 12 Monate nach Austritt/Zweckende, sofern keine dokumentierte Ausnahme gilt |
| Operative Trainings-/Teilnahmedaten | Anwesenheit, Anmeldung, Planung, Dokumentation, Bewertungen/Statistikgrunddaten | Ziel 24 Monate; danach personenbezogene Anteile löschen/anonymisieren; anonyme Statistik darf getrennt bestehen bleiben |
| Besonders sensible Zusatzdaten | nur tatsächlich vorhandene besonders sensible, zweckgebundene Zusatzfelder | Ziel 90 Tage nach Zweckende, sofern keine dokumentierte Ausnahme gilt |
| Audit-/Security-Daten | Rollen-/Permission-/Admin-/Security-Ereignisse | Ziel 12 Monate |
| Backups | DB-/später Storage-Backups | Zielrotation maximal 35 Tage; keine selektive Backup-Manipulation |
| Medien | Übungsvideos, Trainingsdokumentationsmedien | konkrete Zweck-/Ownership- und Löschregel vor U4/U6 festlegen; nicht pauschal aus DB-Frist ableiten |

Gesetzliche, vertragliche oder konkret dokumentierte fachliche Aufbewahrungsgründe dürfen nur die betroffene Datenklasse verlängern. Sperren, Archivieren, Anonymisieren und Löschen bleiben getrennte Vorgänge.

## 6. Nächster technischer M5-Slice

Nach Abschluss der ULC-M5-Zielbindung soll ein kleiner app-spezifischer Verbraucher folgen, der:

1. die vier realen Rollen und die vier realen Permission-Templates als ULC-Vertrag festhält,
2. Organisation sowie `self` / `managed` als notwendige Data-Scope-Semantik festhält,
3. die erwarteten positiven und negativen Rollen-/Scope-Fälle ausführbar testet,
4. Export-/Retention-Zielwerte nur als Policy-Input führt und **nicht** als bereits verifizierte M5-Evidenz markiert,
5. weiterhin den vorhandenen AppBasis-Permissions-Vertrag nutzt statt eine zweite Rollenengine zu bauen.

Erst wenn die reale ULC-Zielruntime diese Regeln serverseitig konsumiert und die app-spezifischen Smokes bestehen, kann `rolesRights` belastbar Richtung `verified` gehen. `dataExport`, `retention` und `deletionConcept` bleiben bis zu ihren jeweils eigenen technischen und Betreiber-Nachweisen offen.
