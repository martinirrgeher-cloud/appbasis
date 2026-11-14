# P04-B – Künftige verschlüsselte Google-Drive-Datenbanksicherung

**Stand:** 14.11.2026 · **Status:** GEPLANT / NICHT EINGERICHTET / KEIN GENEHMIGTER PRODUKTIV-WRITER.

**Betreiberinformation:** Am 14.11.2026 wurde für ULC Linz erklärt: **„Es sollen zukünftig welche in google drive abgelegt werden“** (zusätzliche Datenbanksicherungen). Auf die Frage nach Vereins-Workspace oder regulärem Konto antwortete der Betreiber ausdrücklich: **„In mein google drive“**. Damit ist **sein eigenes „Meine Ablage“/My Drive als gewünschter Zielort** gewählt – **kein Vereins-Shared-Drive**. Ob das Konto technisch ein privates Google-Konto oder ein Workspace-Benutzerkonto ist, wurde nicht überprüft. Die Zielwahl bedeutet **keinen** Uploadauftrag, keinen bereits bestätigten Account/Folderscope, keine freigegebene Frist und keinen erteilten Google-Zugriff.

**P04-B-Systemvertrag:** [privacy/p04-google-drive-offsite-backup-candidate.json](./privacy/p04-google-drive-offsite-backup-candidate.json), abgesichert durch [test/p04-google-drive-backup-approval-gates.test.ts](./test/p04-google-drive-backup-approval-gates.test.ts). Beides **nicht** an produktive Worker, Workflow oder Secrets angebunden. Aktiv bleiben nur die bisherigen Provider-Evidence-Sperren Cloudflare und Neon. Google wird **erst bei echtem Inbetriebnahmebeschluss** als neuer Datenverarbeiter/Backup-Ziel in die freigegebene Datenflussinventur aufgenommen; bis dahin bleibt `unknownProvider=fail-closed`.

## 1. Sichere technische Zielfunktion (mobile Bedienung, keine lokale PC-Pflicht)

**Empfehlung nach Zielwahl:** Später **täglich** eine konsistente PostgreSQL-Sicherung der freigegebenen produktiven App-Datenbank erzeugen und die verschlüsselte Datei in einem **eigens für ULC eingerichteten, privaten Unterordner in der „Meine Ablage“ des Betreibers** ablegen. **Der Betreiber bleibt Dateieigentümer; der Verein benötigt zusätzlich einen dokumentierten Wiederherstellungs-/Nachfolgezugriff auch bei Kontoausfall.** Das kann nach Setup zentral über einen dafür freigegebenen, isolierten Runner mit eigenem Read-/Dump-Zugang erfolgen; manuelle PC-Arbeit für jeden Backup-Lauf ist nicht nötig. **Kein bestehender GitHub-Workflow wird dafür ungeprüft aktiviert.** Beim Testen keine Echtdaten verwenden.

1. Ein berechtigter, zeitlich begrenzter Sicherungsprozess erstellt ein **konsistentes vollständiges PostgreSQL-Dump** (zum Beispiel `pg_dump -Fc`) von der exakt verifizierten Datenbank. Zu sichern sind alle acht relevanten Owner (`identity`, `permissions`, `athletes`, `exercise-catalog`, `training-blocks`, `training-plans`, `training-documentation`, `ulc-linz-lifecycle`). Tatsächliche Datenbank-/Hyperdrivebindung vor dem ersten Run belegen.
2. **Vor Google-Drive-Upload** wird das Archiv mit einer unabhängig prüfbaren authentifizierten Verschlüsselung verschlüsselt, z. B. `age` mit einem vereinsspezifischen X25519-Recovery-Empfänger. Drive erhält **nur Ciphertext** und eine minimal gehaltene Manifestdatei (Backup-ID, Datum, Schema-SHA, Ciphertext-Prüfsumme, ggf. verschlüsselte Detailmetadaten). Keine Athletennamen in Dateinamen, Labels oder Logs.
3. Den **privaten Entschlüsselungsschlüssel niemals** in Google Drive, im selben Backup, im Repo oder im GitHub-/Worker-Laufzeit-Log speichern. Recovery und zweite Notfall-Vertrauensperson gesondert festlegen; Rotation, entzogenes Personal und Schlüsselverlust testen.
4. **Vom Betreiber gewählt: eigenes Google Drive / „Meine Ablage“**, statt Vereins-Shared-Drive. Die Backup-Anwendung soll ausschließlich einen dedizierten, nicht öffentlich geteilten Backup-Ordner verwalten und für diese **durch sie angelegten Dateien** möglichst den engen OAuth-Scope `drive.file` verwenden. Ein ChatGPT-Drive-Zugang ist **nicht** automatisch ein OAuth-Refresh-Token für einen unbeaufsichtigten GitHub- oder Cloudflare-Backup-Job. Einrichtungs-Consent und Ordner-/Dateizugriffe brauchen gesonderte Autorisierung. Besonders kritisch: Der Verein darf bei Kontoausfall, Personenwechsel oder Tod des Kontoinhabers nicht ausschließlich von dessen Login abhängen; deshalb vor echtem Backup Vereinszugang/Nachfolge und unabhängige Recovery-Schlüssel sicherstellen. Ein späterer Wechsel zu einem Vereins-Shared-Drive bleibt möglich, ist aber **nicht** ausgewählt.
5. Nach Upload Inhalt/Größe/Integrität prüfen, regelmäßig Restore in **isolierter Quarantäne-PostgreSQL-Datenbank** proben. Ein HTTP-200-Upload allein ist kein wiederherstellbares Backup. Bei Uploadfehler keine gut bestätigte Alt-Sicherung vorzeitig löschen; Warnung an Verantwortlichen.
6. Aufbewahrung **noch unentschieden**: technische Empfehlung als Gesprächsbasis **täglich, rollierende 14 Tage**. Das ist **weder** eine festgelegte DSGVO-Frist **noch** ein Nachweis maximaler Wiederherstellbarkeit. Alle Versionen, Downloads/Exporte, Provider-Recovery und Drive-Papierkorb müssen getrennt betrachtet werden.
7. Abgelaufene Sicherungen nur über einen nachweisbaren **permanenten** Löschvorgang entfernen (`files.delete`, nicht bloß `trashed=true`), Dateieigentümer und Berechtigung prüfen, anschließend Datei-IDs/Manifest und eventuelle Kopien abgleichen. Drive-Papierkorb kann **30 Tage** eine Wiederherstellung zulassen; 14 Tage „sichtbar“ + 30 Tage Papierkorb könnten **44 Tage** bedeuten und damit die bisherige 35-Tage-Löschquellenregel verletzen. Eine frühere objektseitige Cloud-Provider-Recovery bleibt bis zu unabhängiger Anbieterprüfung **unbekannt**.
8. Bei Restore alle Zugriffe/Writer zuerst sperren, Snapshot-Zeit mit einer **nachweislich vollständigeren, unabhängigen neueren Löschquelle** vergleichen, Löschungen über **alle acht Owner** durchsetzen, Drittteilnehmer/Trainer-/Actor-Historien und persönliche Freitexte prüfen, den bereinigten Datenbestand gesondert abnehmen. Alte Marker fehlen in älteren Snapshots möglicherweise; ihre Abwesenheit beweist keine Freigabe.

## 2. Warum Drive unsere Entscheidung D2 verändert

Bisher gilt die **35-Tage-Originalquelle für Athleten-Löschentscheidungen**, danach `postExpiryRetry=deny`. **Das bleibt unverändert.** Das Hinzufügen eines weiteren wiederherstellbaren Backups eröffnet das Risiko, dass ein nach einer Personlöschung erstelltes neues Produktionssystem später aus einem **älteren** Drive-Snapshot erneut personenbezogene Daten enthält.

- **D2-Variante A** wäre nur geeignet, wenn der tatsächliche *maximal* noch wiederherstellbare Bestand bei Neon, Google Drive, Trash/Versionen, externen Downloads und weiteren Kopien **nachweislich** innerhalb der 35-Tage-Quellenautorität liegt und jeder Owner vor Ablauf fertig bearbeitet wurde. Die **14-Tage-Kandidatenregel allein beweist das nicht**.
- **D2-Variante B** benötigt gegebenenfalls eine längere, minimaldatige und atomar belegte Löschentscheidungsquelle. **Keine** konkrete neue Frist, kein personenbezogenes Dauerledger und kein Writer dürfen ohne separate fachliche/rechtliche Prüfung beschlossen oder implementiert werden.
- Wenn weder A noch B mit echter Evidenz möglich ist, muss **Backup-/Restore-Promotion BLOCKED** bleiben. Ein Backup kann für Notfälle gespeichert werden, darf aber dann **nicht** ohne späteren zulässigen und nachgewiesenen Lösch-Replay an Live-Nutzer gelangen.
- **Private Übungsmedien außerhalb der Datenbank** sind nicht automatisch durch `pg_dump` gesichert: Datenbank-Referenzen, tatsächliche Speicherobjekte, Betreiberrechte und D3-Objektlöschprüfung separat behandeln.

## 3. Externe Anforderungen vor der ersten Echtdatensicherung

| Gate | Konkreter Nachweis | Stand |
| --- | --- | --- |
| **Drive-Eigentümer** | **Eigene „Meine Ablage“ des Betreibers gewählt**; tatsächlicher Google-Kontotyp, eigener ULC-Backup-Ordner samt Folder-ID, MFA, Rechte und vereinsseitiger Recovery-/Nachfolgezugriff nachzuweisen | **ZIEL BESTÄTIGT, TECHNIK OFFEN** |
| **Google-Rechtsgrundlage** | Auftragsverarbeitungsvertrag/AVV, Datenübermittlung und Unterauftragsverarbeiter, geeigneter Backup-/Kinder-Datenschutz | **OFFEN** |
| **Verschlüsselung** | Beleg `encrypt-before-upload`, Schlüssel getrennt, verschlüsselter Archivtest, unabhängiger Recovery-Custodian | **OFFEN** |
| **Datenquelle** | Verifizierter Cloudflare-Worker↔Neon-Produktionsbezug, dedizierte abgesicherte Dump-Berechtigung, vollständige Owner- und Schema-Version | **OFFEN** |
| **Retention / D2** | Betreiberfreigabe des rollierenden Zeitfensters und objektiver Nachweis maximaler Recovery-Zeit aller Versionen/Exports | **OFFEN** |
| **Automatisierung** | Geringste OAuth-Berechtigung, gesicherter Token-Rotation-/Fehlerpfad, konsistenter Dump, Upload, Prüfsumme, Alerts, dokumentierte Löschbestätigung | **OFFEN** |
| **Restoreprobe** | Zufällig ausgewähltes Archiv per Hash verifizieren, entschlüsseln, in Quarantäne zurückspielen, Daten-/Schema-/Owner-Checks, jüngere Löschungen replayen | **OFFEN** |
| **Freigabe** | Isolierte E2E/CI PASS, konkrete Betreiberfreigabe zum Speichern und Verarbeiten von Echtdaten, eigenes Workflow-Gate | **OFFEN** |

**Rechtliche Grenze:** Google verschlüsselt Drive-Daten standardmäßig bei Übertragung und Speicherung, aber das ersetzt **keine** eigene archivseitige Verschlüsselung, die Kontrolle des Entschlüsselungsschlüssels und eine Prüfung der Verarbeitung/Übermittlung personenbezogener Vereins- und Minderjährigendaten. Die Google-Workspace-eigene Client-side Encryption ist ein optionales **Workspace/Administrator-Feature**, nicht automatisch für ein privates Gmail-Konto vorhanden. Die österreichische Datenschutzbehörde nennt AVV und Drittlandübermittlungsprüfungen als eigenständige Anforderungen.

**Technische Primärquellen (14.11.2026):**
- [Google – Verschlüsselung in Drive](https://support.google.com/drive/answer/10519333)
- [Google – Shared Drives/Eigentümerschaft](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [Google – Drive API permanente Dateilöschung](https://developers.google.com/workspace/drive/api/guides/delete)
- [Google – Dateien im Papierkorb bis 30 Tage](https://support.google.com/drive/answer/2375102)
- [Österreichische Datenschutzbehörde – Auftragsverarbeiter](https://dsb.gv.at/rechte-pflichten/ihre-pflichten-als-auftragsverarbeiterin)

## 4. Was heute ausdrücklich NICHT geschieht

- **Kein** Google-Drive-Ordner wird angelegt, keine Google-OAuth-Verbindung eingerichtet, keine Datei übertragen, keine Passwörter/Schlüssel erzeugt.
- **Keine** produktive PostgreSQL-Abfrage, kein `pg_dump`, kein GitHub-Scheduled-Workflow aktiviert, keine Retention-/Provider-Policy oder Release-Contract-Freischaltung.
- **Keine** Behauptung, dass eine Google-Drive-Sicherung existiert, die 14 Tage wirksame Frist beträgt oder Drive durch bestimmte Google-Kontofunktionen bereits DSGVO-abgenommen ist.
- `privacy=blocked`, `applicationLifecycle=blocked`, `postExpiryRetry=deny`, die 35-Tage-Quelle und die acht M6-Betreiberfreigaben bleiben unverändert.

**Zielentscheidung ist erfolgt:** persönliche „Meine Ablage“ des Betreibers. **Nächste technische Voraussetzungen** sind ein sicherer und explizit autorisierter Google-OAuth-Zugriff auf einen dedizierten ULC-Backup-Ordner, die Prüfung des tatsächlichen Konto- und Eigentümertyps, ein vom Google-Login unabhängiger Entschlüsselungs-/Recovery-Schlüssel sowie ein für den Verein dokumentierter Nachfolgezugang. Diese Schritte dürfen erst nach gesonderter Berechtigungs-, Datenschutz-/Backup- und Echtdatenfreigabe aktiviert werden. **Bis dahin bleibt der Backup-Weg ein Designentwurf.**
