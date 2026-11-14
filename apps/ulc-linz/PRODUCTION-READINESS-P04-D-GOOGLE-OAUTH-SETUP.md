# P04-D – Google-Drive-OAuth-Verbindung für zukünftige ULC-Backups

**14.11.2026 · Status: manuell startbare, schreibfreie Verbindungskontrolle vorbereitet; KEINE verbundenen Job-Zugangsdaten; Backup bleibt BLOCKED.**

Der Betreiber hat sein **persönliches Google Drive / Meine Ablage** als Ziel gewählt. Der bereits angelegte [ULC-Backupordner](https://drive.google.com/drive/folders/1GpEzbPYeg-3KYHJUses7va8llYWpbl85) ist **leer und nicht geteilt**. Der bereits verbundene ChatGPT-Google-Drive-Connector ist **nicht** der OAuth-Client eines autonomen GitHub-Backupjobs.

**Ziel dieses PR:** Eine konkrete sichere Vorabprobe vorbereiten, ohne einen Google-OAuth-Client, ein fremdes Konto, einen produktiven Runner, einen Datenbankexport, ein Backup oder eine Freigabe vorzutäuschen.

## 1. Gelieferte Technik

- `backup/google-drive-oauth-readonly.ts`: Prüft **nur nach eigener einmaliger Operatorfreigabe** den Refresh-Token am fest verdrahteten Google-Tokenendpunkt und **ausschließlich per GET** den fest eingetragenen Ordner `1GpEzbPYeg-3KYHJUses7va8llYWpbl85`. Erforderlich: OAuth `drive.file` als **einzige** Scope, Ordner `ownedByMe`, `shared=false`, `isAppAuthorized=true`, nicht im Papierkorb, Ordnername/ID exakt, Ordner-Lese-/Schreibfähigkeit laut Metadaten. Token, Provider-Fehlerkörper, Namen/Emails von Personen und Secrets werden **nicht** ausgegeben. **Keine** Backup-Dateien werden geschrieben.
- `tooling/google-drive-oauth-probe.mjs`: Schreibt ausschließlich den unpersönlichen PASS/BLOCKED-Befund. Bei fehlendem Beleg beendet sich der Prozess mit Exit-Code 1.
- `.github/workflows/ulc-drive-oauth-readonly-preflight.yml`: **Nur** `workflow_dispatch` auf `main`; zusätzlich `approve_readonly=true` pro erstem Run; **kein** Cron, PR-/Push-Trigger, Backupjob, Drive-Upload, SQL, Ordnererstellung oder Delete; `contents:read`, kein persistenter Checkout-Token. Wiederholung braucht einen neuen Dispatch.
- `test/p04-drive-oauth-readonly.test.ts`: Isolierte Fake-HTTP-Tests: Ohne Approval/Client/Token **0 Anfragen**; getrennte Zielkennung; minimaler Scope; nur Google-Token-POST und genau ein Ordner-GET; falsche Ordner, Sharing, ungültiger OAuth-Zugriff und geheimnisfreie Fehlermeldungen werden abgewiesen.

**Wichtig:** Die Verbindung ist heute **nicht** eingerichtet, solange Google Cloud kein OAuth-Client erzeugt und keine drei GitHub-Geheimnisse separat hinterlegt wurden. Die GitHub-Integration hat keinen Google-Cloud-OAuth-Client- oder Actions-Secrets-Schreibzugriff; diese Schritte können **nicht** aus dem bisherigen ChatGPT-Drive-Zugang abgeleitet werden.

## 2. Einmalige Benutzeraktion – möglichst auch über Android-Browser durchführbar

**Keine OAuth-Client-Secrets oder Refresh-Tokens in ChatGPT, Issues, Commits, Screenshots oder Messenger schicken.** Nur direkt im eigenen Google-Konto und in den **GitHub Actions Secrets** hinterlegen.

1. Im gewünschten **persönlichen Google-Konto** [Google Cloud Console](https://console.cloud.google.com/) öffnen. Ein eigenes Projekt `ULC Linz Backup OAuth` wählen/erstellen und die [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com) aktivieren. Projektkosten und eventuelle Cloud-Abrechnung vor Aktivierung prüfen.
2. In [Google Auth Platform](https://console.cloud.google.com/auth/overview) Appname, Supportkontakt, Zielgruppe und erlaubte Testnutzer konfigurieren. Für dauerhafte tägliche Backups darf eine externe OAuth-App **nicht** unbemerkt im Zustand *Testing* bleiben: Nicht-OIDC-Refresh-Tokens können dort nach **7 Tagen** ungültig werden. Datenschutzprüfung der Vereinstätigkeit und eventuelle Google-Verifizierungsanforderungen separat abschließen.
3. Unter [Clients](https://console.cloud.google.com/auth/clients) einen **OAuth 2.0 Client vom Typ „Web application“** anlegen, beispielsweise `ULC Linz Drive Backup`. Für die optionale, auf Google gehostete einmalige OAuth-Einwilligung [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) die explizite Redirect-URI `https://developers.google.com/oauthplayground` autorisieren. **Nicht** OOB/Copy-Paste-Redirect, ungesichertes Android-Loopback oder eine erfundene Worker-Callback-URL verwenden.
4. Im **Google OAuth Playground** über das Zahnrad *Use your own OAuth credentials*, den **eigenen** Client-ID und das Client-Secret verwenden, Flow *Server-side*, Access type *Offline*. **Ausschließlich** `https://www.googleapis.com/auth/drive.file` autorisieren, mit dem gewünschten persönlichen Google-Konto bestätigen und den Code gegen einen Refresh-Token austauschen. OAuth Playground dient hier nur als **manueller Bootstrap**, **nicht** als Backup-Provider oder Betriebsanwendung. Diese Methode vor Nutzung organisations-/sicherheitsseitig freigeben; alternativ ist eine eigene geprüfte HTTPS-OAuth-Callback-Anwendung erforderlich.
5. In [GitHub → appbasis → Settings → Secrets and variables → Actions](https://github.com/martinirrgeher-cloud/appbasis/settings/secrets/actions) drei **Repository Secrets** anlegen: `ULC_BACKUP_GOOGLE_CLIENT_ID`, `ULC_BACKUP_GOOGLE_CLIENT_SECRET`, `ULC_BACKUP_GOOGLE_REFRESH_TOKEN`. **Keinen Wert als normale Repository Variable**, Quellcode, PR-Kommentar oder Chat-Nachricht speichern. Nicht manuell Base64 als vermeintliche Verschlüsselung verwenden.
6. **Erst nach Review/Merge** des read-only PR in `main`: In [GitHub Actions](https://github.com/martinirrgeher-cloud/appbasis/actions) Workflow **ULC Drive OAuth Read-Only Preflight** auswählen → *Run workflow* → `approve_readonly=true` bewusst setzen. Das ist **nur** eine einmalige externe Google-Leseprüfung – **keine** Freigabe zur Sicherung von Echtdaten.

**Falls das Ergebnis `drive-folder-inaccessible-to-this-app` lautet:** Kein OAuth-Fehler des persönlichen Google-Logins vorausgesetzt, sondern sehr wahrscheinlich die vorgesehene per-App-Schranke von `drive.file`: Der vorhandene leere Ordner wurde von der **ChatGPT-Drive-App** und nicht vom neuen Backup-OAuth-Client angelegt. Den Ordner über **Google Picker innerhalb genau dieses OAuth-Clients** ausdrücklich öffnen/freigeben oder später über den Backup-Client einen **neuen eigenen Unterordner in „Meine Ablage“** erstellen. Bis dahin **keine** Ausweitung auf den eingeschränkten Voll-Drive-Scope. Der aktuelle schreibfreie Preflight legt bewusst keinen zweiten Ordner an, nimmt keine Picker-Interaktion vor und gibt bei fehlendem Nachweis **FAIL** zurück.

**Wenn Refresh-Token fehlt:** Nur im autorisierten OAuth-Einwilligungsablauf `access_type=offline` und gegebenenfalls erneute explizite Einwilligung prüfen. Keine Token-Rotation/Erweiterung durch ein anderes Konto vortäuschen.

## 3. Nach einem positiven OAuth-Check weiterhin GESPERRT

Der Preflight bestätigt ausschließlich „dieser Client kann **jetzt** den festen privaten Drive-Ordner lesen“. Er beweist **keine** dauerhaft sichere Refresh-Token-Verwahrung, Verschlüsselung mit separaten Vereinsschlüsseln, wiederherstellbaren PostgreSQL-Dump, permanente Objektlöschung, Provider-DPA/AVV, Maximal-Backupalter (inkl. Google Versionen/Papierkorb), Leistungsfähigkeit des Vereins nach Kontoausfall oder die rechtmäßige Verarbeitung von Kinder-/Mitgliederdaten. Das eigentliche Backup und die 14-Tage-Zielfrist bleiben **nicht aktiviert**.

Für Betrieb folgt ein **eigenes**, ausdrücklich autorisiertes Paket: echter konsistenter `pg_dump` vom gebundenen Neon-Ziel, geprüfte clientseitige `age/X25519`-Verschlüsselung **vor** Drive, periodischer Integritäts-/Quarantäne-Restore, erasure replay aller acht Owner, echte Provider-Löschquittung, Audit/Alerts, nur nach gesonderter Sicherheits-/Datenschutz- und Betreiberfreigabe. Keine Änderung von `privacy=blocked`, `applicationLifecycle=blocked` und den bestehenden **35 Tagen / `postExpiryRetry=deny`**.

**Quellen:**
- [Google: Drive `drive.file` mit pro-App-Dateifreigabe](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google: OAuth-Client anlegen](https://developers.google.com/workspace/guides/create-credentials)
- [Google: OAuth Playground mit eigenen Client-Zugangsdaten](https://developers.google.com/oauthplayground/)
- [Google: OAuth Testing / Refresh-Token-Fristen](https://developers.google.com/identity/protocols/oauth2)
- [GitHub: Actions Secrets sicher anlegen](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
