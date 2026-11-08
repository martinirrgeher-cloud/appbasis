# G-04.3 – Preview-v16-Recovery-Preflight (nicht ausgeführt)

**Stand: 08.11.2026. Keine echte Sicherung, keine Wiederherstellung, kein v17-Apply.**

## Zweck

Der neue lesende **Credential-/Target-Preflight** `tooling/ulc-linz-g04-v17-recovery-preflight.mjs` bereitet die echte, später separat freizugebende v16-Preview-Sicherung und den isolierten Restore vor. Er erstellt **keine** Verbindung zu PostgreSQL und verändert weder Datensätze noch den Privacy-/Evidence-Vertrag.

### Sicherheitsanforderungen

- Ausgangsdatenbank ist exakt `appbasis_ulc_linz_preview`. Die drei Rollen werden durch den vorhandenen D4-Preview-Validator geprüft.
- Für alle vier URLs muss TLS explizit über `sslmode=require`, `verify-ca` oder `verify-full` gefordert werden. Andere URL-Parameter und schwächere Modi werden verweigert.
- Das Restore-Ziel ist eine **separate direkte Neon-Origin** mit anderem Host und Datenbankname `appbasis_ulc_linz_...restore...`. Pooler-Aliase und identische Rollen werden verweigert.
- Kein Ausgabeprotokoll enthält Passwörter, vollständige URL oder Benutzerinformationen. Die CLI meldet nur eine redaktionell bereinigte Preflight-Zusammenfassung.
- Fehlende oder abweichende Eingaben führen zum Abbruch **vor** jedem Datenbankzugriff.

### Aufruf – nur nach späterer Betreiberfreigabe

Für den Offline-Check werden dieselben drei bereits vorhandenen Preview-Umgebungsvariablen wie bei G-04.2c benötigt, ergänzt um **`APPBASIS_G04_V17_RESTORE_DATABASE_URL`**. Das Ziel muss von der zuständigen Betreiberperson unabhängig und leer bereitgestellt werden. Der Preflight liefert ausdrücklich keine Freigabe und keine Echtnachweise.

```bash
node tooling/ulc-linz-g04-v17-recovery-preflight.mjs
```

**Wichtig:** Die Umgebung darf nur auf die Preview-Datenbank zeigen. Reale Zugänge niemals in Git, Chat, CI-Logs oder PR-Kommentare kopieren.

### Fachentscheidung, noch ausständig

Die Vorschläge aus `G04-V17-RECOVERY-AND-RETENTION-DECISION.md` gelten **nicht** als beschlossene Aufbewahrungsregel. Vorschlag für die Testphase: Deaktivierte Gruppen reversibel belassen; bei ausdrücklich erlaubtem physischen Entfernen einer Gruppe ausschließlich ihre Kalenderregel und Ausnahmen transaktional kaskadieren; keine automatische kalenderbezogene Fristlöschung. Ob, wann und wie Daten in einer späteren Live-Umgebung gelöscht werden müssen, einschließlich Backups und Personenbezug über Gruppen, muss der Verantwortliche fachlich und rechtlich entscheiden und nachweisbar bestätigen.

### Vor echter Preview-v17-Migration weiterhin nötig

1. Fachlicher Controllerentscheid zu Aufbewahrung, Exportklassifikation und Verantwortlichkeit mit unabhängig abrufbarer Referenz.
2. Separat autorisierter realer v16-Preview-Dump mit nachvollziehbarem SHA-256 und geschütztem Backup-Artefakt.
3. Ein tatsächlicher `pg_restore` **dieser selben** Sicherung auf der zuvor unabhängig als leer bestätigten Restore-Datenbank, danach Schema-, Daten- und ACL-Abgleich mit protokollierter unabhängiger Evidence.
4. Explizite Freigabe und Review der Evidence-Ledger, danach ein weiteres unabhängiges Operator-Gate für v17-Preview-Migration. Runtime-Freischaltung/Deployment nochmals separat.

G-04.3 installiert **keinen** Backup-/Restore-Workflow, führt keinen echten Export oder Restore aus, behauptet keinen Datenschutzentscheid und ändert keine bereits aktiven M5-/v16-Verträge.

**Produktion bleibt gesperrt.**
