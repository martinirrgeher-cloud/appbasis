# ULC Linz – P06: sicherer Anwesenheits-/Anmelde-Pilot auf bestehender Preview

**B3-Live-Stand 15.11.2026:** P06 ist in `main`, zwei Aktivierungsversuche scheiterten mit HTTP 503. Der rein lesende Guard-Preflight lieferte `PROXY_DATABASE`: Der Cloudflare-Hyperdrive-Proxy-URL-Datenbankname wurde fälschlich als Neon-Origin-Identität behandelt. **Schalter auf `disabled` belassen.** Die folgende Korrektur ist zunächst nur ein separat zu prüfender PR; kein erneuter Aktivierungsversuch vor CI, Merge, Preview-Deploy und `READY`-Diagnose.

## Ziel für ca. 30 Vereinsnutzer

Die bereits vorhandene und in isoliertem PostgreSQL geprüfte P03-I-Sicherung für Anwesenheit und Selbstanmeldung wird nur über einen **bewusst gesetzten Preview-Schalter** aktiviert. Keine neue Benutzeroberfläche, keine zweite Datenbank, keine neuen Feature-Module und keine Änderung bisheriger Trainings-/Speicherabläufe, solange der Schalter fehlt.

**Implementierung:** \`apps/ulc-linz/worker/pilot-training-write-guard.ts\` sowie die bestehende Worker-Runtime-Komposition. Bei deaktiviertem Schalter ist die Runtime-Konfiguration unverändert und \`trainingSessionWriteGuardMode\` bleibt \`legacy\`.

## Enge Freigabebedingungen für spätere Preview-Aktivierung

Nur nach **separater Merge- und Preview-Deployment-Freigabe** kann eine autorisierte Betreiberperson auf dem bestehenden ULC-Test-Worker folgende **nicht geheime** Variablen kontrollieren:

| Name | Einziger akzeptierter Aktivierungswert |
| --- | --- |
| \`APPBASIS_ULC_PILOT_TRAINING_WRITE_GUARD\` | \`p03i-preview\` |
| \`APPBASIS_RUNTIME_ENVIRONMENT\` | \`generated-preview-ulc-linz\` |
| \`APPBASIS_GENERATED_APP_ID\` | \`ulc-linz\` |

Zusätzlich müssen die **zugrunde liegenden Neon-Origin-Verbindungen** beider Hyperdrive-Konfigurationen auf dieselbe Preview-Datenbank `appbasis_ulc_linz_preview`, denselben direkten Neon-Endpunkt und unterschiedliche, nicht privilegierte Rollen `appbasis_ulc_linz_preview_application` und `appbasis_ulc_linz_preview_security_log` zeigen. Der unveränderte E6H-Deployment-Preflight prüft dies sowohl an den drei Original-Origin-URLs als auch an den tatsächlich registrierten Hyperdrive-Konfigurationen und IDs.

**B3-Korrektur:** Die von Cloudflare im Worker gelieferte `HYPERDRIVE.connectionString` ist eine **dynamische Proxy-URL**; daraus können echter DB-Name, Postgres-Rolle oder Neon-Host **nicht** sicher abgelesen werden. Der generierte Preview-Deploy erhält deshalb nur nach bestandenem Origin-Preflight eine nicht geheime, **an `APPBASIS_BUILD_SHA` gebundene Attestierung** (`APPBASIS_ULC_P03I_ORIGIN_ATTESTATION`). Der Worker kontrolliert die exakte Preview-App/Umgebung, diesen Build-Nachweis sowie zwei verschiedene, syntaktisch gültige PostgreSQL-Proxyverbindungen. Der eigentliche P03-I-Writer kontrolliert Trainer-/Athleten-/Gruppenberechtigungen atomar innerhalb derselben PostgreSQL-Transaktion. Diese Maßnahme ist kein kryptographisches Origin-Zertifikat; nachträgliche manuelle Änderungen an Hyperdrive-Origin/Bindings müssen separat überwacht werden.

**Fail-closed:** Fehlender oder explizit `disabled` gesetzter Schalter = unveränderter Legacy-Modus. Aktivierung ohne **Build-passende Origin-Attestierung**, mit falscher Preview-Kennung, falschem Schalterwert, ungültigen oder identischen PostgreSQL-Proxy-Strings = HTTP 503 / `RUNTIME_NOT_CONFIGURED`; keine stille Rückkehr zu Legacy. Falscher Origin-DB-Name/Neon-Host oder falsche Origin-Rolle stoppen bereits die E6H-Deploymentprüfung. Ein Proxy-DB-Pfad wie `/hyperdrive` ist für sich kein Origin-Nachweis und darf nicht als Fehler gewertet werden. Aktiviert wird ausschließlich `require-live-training-actor-transaction`, niemals durch einen HTTP-Request-Parameter.

## Sicherheits- und Bedienungsverhalten

- **U12, U14, Kindertraining und weitere bestehende Nachwuchsmodule:** aktiver Athlet und Gruppen-/Trainerzuordnung werden im selben Schreib-Transaction-Kontext geprüft; der authentifizierte Trainer/Admin wird bei Änderungen von Principal-/Rollenrechten vor dem Schreiben erneut kontrolliert.
- **Selbst- und Proxyanmeldung:** vorhandene aktive Athlete-/Membership-/Scope-Prüfungen und atomarer Registration-/Session-Write werden beibehalten.
- **Fehlermeldungen sind im aktuellen Code schon vorhanden:** 403 \`TRAINING_WRITE_ACCESS_CHANGED\` bei nicht mehr berechtigtem Actor; 409 \`TRAINING_WRITE_SCOPE_CHANGED\` bei veralteter Gruppe/Athlet – ohne Datenbankdetails, mit Hinweis zum erneuten Laden. Beide Zustände dürfen nicht als \`Gespeichert\` dargestellt werden.

## B3-Reaktivierung erst nach doppelter Vorprüfung

1. Cloudflare-Schalter **`disabled`** beibehalten und den geprüften PR erst nach explizitem Merge-/Preview-Deploy-Entscheid über die bestehende E6H-Workflowkette auf **genau diesem main-Commit** deployen.
2. Ohne Anmeldung und ohne Datenbankzugriff `GET /api/health/b3-guard-preflight` abrufen. Erwartet: `{"status":"ready","reasonCode":"READY"}`. `ORIGIN_NOT_ATTESTED` bedeutet fehlende oder veraltete Deploy-Attestierung – **nicht aktivieren**. Jede andere Blockade ebenfalls zuerst untersuchen.
3. Vor Aktivierung prüfen, ob die Anmeldung bei `disabled` weiter funktioniert. Erst nach expliziter Betreiberfreigabe `p03i-preview` aktivieren und sofort Login plus einen synthetischen Speichervorgang kontrollieren; bei 503 unmittelbar `disabled` setzen und keine weiteren Daten schreiben.
4. Nach PASS die kontrollierten Berechtigungs-Negativtests abarbeiten. Bei `p03i-preview` wird der öffentliche Preflight-Endpunkt bewusst mit 404 deaktiviert.

## Einmaliger fokussierter Handytest nach separat genehmigtem Preview-Deploy

1. **Bereits funktionierende Funktionen nicht neu abnehmen:** Login, Anwesenheit in U12/U14/Kindertraining und IRG-Selbstanmeldung nur jeweils kurz speichern/neu laden – mit synthetischen Testidentitäten.
2. **Schutzwirkung:** Nach Gruppenwechsel, deaktiviertem Athleten und nach entzogenem Trainerrecht muss ein veralteter Save abgelehnt werden. Alte Notizen/Anwesenheiten dürfen nicht still überschrieben werden.
3. **Fehleranzeige:** 403 oder 409 zeigt eine verständliche Meldung. Erneutes Laden und anschließendes korrektes Speichern funktioniert; keine verlorenen lokalen Eingaben ohne Hinweis.
4. **Rollback:** Den genannten Flag auf \`disabled\` zurückstellen, Preview erneut überprüfbar aktivieren. Dieser technische Rollback ist **kein** Ersatz für Rückabwicklung bereits persistierter personenbezogener Daten.

## Wichtige Grenzen und nächster Pilotentscheid

Der neue Schalter nimmt **keine** Produktionsänderung vor; er schließt nicht alle direkten SQL-Bypässe, alte Worker, ältere personenbezogene Freitexte oder vollständigen Restore-Replay ab. Der bestehende ULC-Produktionsvertrag bleibt \`blocked\`, insbesondere Datenschutz-/Erasure-Lifecycle und Trainingsdoku. Vor echten Vereinsdaten benötigt der Verein eine kurze verantwortliche Datenschutz-/Fristenentscheidung, zuverlässige automatische verschlüsselte Sicherung und eine sachlich begrenzte Abnahme des tatsächlichen Löschwiederanlage-Schutzes – kein neues großes K2-ACL-Projekt.

**Abnahme dieses Code-Pakets:** Worker- und Schalter-Negativtests, bestehende P03-I PostgreSQL-E2E sowie gesamte Quality Gate/Identity E2E auf exakt einem PR-HEAD. Ohne ausdrückliche Freigabe: kein Merge, kein Cloudflare-Flag, kein Deployment, keine DB-/R2-/Neon-Schreibaktion.
