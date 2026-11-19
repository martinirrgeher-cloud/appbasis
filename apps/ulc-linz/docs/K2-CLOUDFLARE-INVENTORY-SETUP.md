# ULC K2 – Cloudflare-Inventur ohne Screenshot-Schleifen (16.11.2026)

**Status: technischer Draft, keine Cloudflare-Verbindung eingerichtet, kein Provider-Zugriff erfolgt.** Ziel: alle **aktiven Worker-Versionen eines einzelnen Cloudflare-Accounts** sowie ihre Binding-Namen/-Typen und die dazu gehörenden Hyperdrive-Hosts/Datenbanknamen technisch vergleichen. Keine Änderung an Cloudflare, Neon, R2 oder der ULC-App.

## Bereits vorhandene Basis
- Im Repository existiert bereits `.github/workflows/m5-ulc-cloudflare-read-preflight.yml` für einen begrenzten M5-Lesezugriff. Dieser Workflow wird **nicht** geändert. Das neue Paket prüft stattdessen die **gesamte Worker-Liste des bestätigten Accounts**.
- Betreiber-Screenshots: 7/7 Worker mit den sichtbaren Bindings wurden aufgenommen, 8 unterschiedliche Hyperdrive-Konfigurationen manuell als nicht auf K2 zeigend geprüft.
- Der bekannte K2-Quarantäne-Compute lautet `ep-snowy-fog-b1xzh562`; die logische K2-Restore-Datenbank lautet `ulc_linz_k2_restore_quarantine`. **Dieser Fingerprint muss bei einem späteren K2-Restore-Wechsel bewusst aktualisiert und erneut geprüft werden.**

## Einmalige Einrichtung durch den Kontoinhaber

1. In Cloudflare unter **My Profile → API Tokens → Create Token → Create Custom Token** einen **neuen** Token nur für den betroffenen Account anlegen. Benötigte **Account**-Permissions: **Workers Scripts: Read** und **Hyperdrive: Read**. Keine Write/Admin-/Workers-Edit-Rechte. Für einen einmaligen Test möglichst kurz befristet.
2. In GitHub **Repository Settings → Environments** das Environment **`ulc-k2-cloudflare-readonly`** anlegen. Dort als **Environment secrets** exakt `CLOUDFLARE_ACCOUNT_ID` und `CLOUDFLARE_K2_READ_TOKEN` eintragen. Den Token und die ID **nicht** in Chat, GitHub-Issue, Dateien oder Screenshots schreiben. Bereits vorhandene breite Deploy-Tokens/Secrets nicht kopieren.
3. Zuerst den **Draft-PR** prüfen und die Offline-CI abwarten. Das Live-`workflow_dispatch` steht erst nach einem **gesondert freigegebenen Merge nach `main`** zur Verfügung; ein Draft-PR allein ermöglicht keinen manuellen Live-Start auf `main`.
4. Nach einer expliziten Merge-Freigabe in **Actions → ULC K2 Cloudflare read-only account inventory → Run workflow → main** den Bestätigungstext `READ-K2-CLOUDFLARE` eingeben. Es gibt **keinen Zeitplan**, keinen automatischen Providerzugriff und keine Workflows mit Datenbank-Schreibbefehlen.

## Technischer Umfang

Nur Cloudflare-API **GET**:
- `/accounts/{id}/workers/scripts`: Account-Worker inventarisieren (unvollständige Liste blockiert).
- Für jeden Worker: `/settings`, `/secrets` (nur **Name/Typ**), `/deployments` und `/versions/{version_id}` aller **aktiv bedienten** Versionen; keine Skriptinhalte herunterladen.
- `/accounts/{id}/hyperdrive/configs` sowie `/configs/{id}` für tatsächlich referenzierte Konfigurationen; nur **Host und Datenbankname intern vergleichen**, keine Zugangsdaten ausgeben.
- Verknüpfte Service-Worker auf Existenz in der Inventur prüfen. Fehlende Bindings, API-Rechte oder unbekannte Hyperdrive-Ziele ergeben **BLOCK/MANUAL_REVIEW_REQUIRED**, niemals stillschweigendes PASS.

Der Workflow erstellt nur eine **redigierte Zusammenfassung** (Zähler, Status, Befundcodes; keine Rohantworten, Hostnamen, Account-IDs, DB-Benutzernamen, Tokens, Secret- oder Variablenwerte). API-Fehler werden generell redigiert, die Antworten nicht in Artefakte geschrieben. GitHub-Zugriffsrecht: nur `contents: read`. Test-Jobs auf PRs erhalten **keine** Cloudflare-Secrets; Live-Lesejob läuft ausschließlich nach manuellem Bestätigungstext und nur auf `main`.

## Grenzen und zwingende Stop-Regeln

- Der API-Befund `NO_K2_IN_INSPECTED_HYPERDRIVES` bedeutet **nicht**, dass alle möglichen DB-Zugänge ausgeschlossen sind. Insbesondere kann ein **verschlüsseltes Secret** selbst eine K2-Connection-URL enthalten, die anhand des Secret-Namens allein nicht verifizierbar ist.
- Namen mit DB-/Neon-/Postgres-Bezug werden für gezielte **manuelle** Prüfung markiert. **Keine Secret-Werte aufdecken**; falls technisch notwendig, eine sichere interne Verifikation ohne Weitergabe der Zugangsdaten entwerfen.
- Nicht enthalten: zusätzliche Cloudflare-Accounts, alle möglichen Preview-Sonderumgebungen, Zonendomain-/DNS-Routen, externe Worker, Clients außerhalb Cloudflare und neue Änderungen zwischen Inventur und späterem Eingriff.
- K2 darf **nicht** an einen Worker angebunden werden. Alle Rechte- und Owner-Reparaturen bleiben gesondert freigabepflichtig. Die Ergebnisse dieses Workflows führen **niemals** zu `productionReady=true`.
- Bei 403/401, unvollständiger Pagination oder fehlenden aktiven Versionsinformationen lautet das Ergebnis **FAIL/BLOCK**; niemals eigene Permissions erweitern, ohne erneuten Betreiberentscheid.

## Abnahme

1. `node --test tooling/ulc-linz-k2-cloudflare-inventory.test.mjs` vollständig PASS.
2. Code-Review bestätigt ausschließlich GET-Verwendung, keine Provider-Writes, keine unredigierten Fehler-/JSON-Ausgaben.
3. Erst nach separater Freigabe: manual-only Live-Inventory für die **aktuelle** Cloudflare-Worker-Liste. Ergebnis im K2-Issue nur mit Status/Zähler/Befundcodes dokumentieren.
4. Anschließend Entscheidungen über unklare direkte Secrets, Worker-Routen, Restore-Rechte und tatsächlichen isolierten App-/Medien-E2E. Kein Merge/Deploy/DB-Write aus diesem Draft.

Tracking: [#640](https://github.com/martinirrgeher-cloud/appbasis/issues/640), [#642](https://github.com/martinirrgeher-cloud/appbasis/pull/642), [#530](https://github.com/martinirrgeher-cloud/appbasis/issues/530).

API-Referenzen:
- [Workers Scripts List](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/)
- [Worker deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)
- [Worker versions](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/)
- [Worker settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
- [Worker secrets list](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/)
- [Hyperdrive configs](https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/list/)
