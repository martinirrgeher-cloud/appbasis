# ULC Linz – P06: sicherer Anwesenheits-/Anmelde-Pilot auf bestehender Preview

**Stand 15.11.2026:** P06-Code ist inzwischen in `main`; **Cloudflare-Pilotflag nach fehlgeschlagenem Aktivierungsversuch vorerst auf `disabled` setzen**. B3-Fix bleibt separat bis CI und Betreiberfreigabe ungemergt.

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

Zusätzlich müssen die **zugrunde liegenden Neon-Origin-Verbindungen** beider Hyperdrive-Konfigurationen auf dieselbe Datenbank `appbasis_ulc_linz_preview`, denselben Neon-Endpunkt und unterschiedliche, nicht privilegierte Rollen zeigen: `appbasis_ulc_linz_preview_application` und `appbasis_ulc_linz_preview_security_log`. Das verifiziert der bestehende E6H-Deploy-Preflight anhand der Original-Origin-URLs und beiden Hyperdrive-Konfigurationen. **Die zwei zur Laufzeit gelieferten Cloudflare-Hyperdrive-Proxyhostnamen dürfen unterschiedlich sein**; ein Proxyhostname ist nicht der Neon-Origin-Hostname. Die Runtime prüft daher weiterhin nur exakte DB-Namen, Rollen, URI-Schema und Port, die App-/Environment-Kennung und die getrennten Bindings. Bei fehlerhafter Aktivierung bleibt `RUNTIME_NOT_CONFIGURED` fail-closed; der Betreiber muss auf `disabled` zurücksetzen.

**Fail-closed:** Fehlender Schalter oder explizit \`disabled\` = unverändertes Legacy-Verhalten. Ein vorhandener aber falscher Schalter, abweichende Rollen, falscher DB-Name oder eine unzulässige Runtime-Kennung = **HTTP 503 / \`RUNTIME_NOT_CONFIGURED\`**, nicht stillschweigend unsichere Legacy-Schreiboperationen. Bei erwarteter Aktivierung verwendet der einzige gemeinsame Session-Writer den bereits implementierten Modus \`require-live-training-actor-transaction\`. Kein HTTP-Client darf den Schalter aus dem Request-Body setzen.

## Sicherheits- und Bedienungsverhalten

- **U12, U14, Kindertraining und weitere bestehende Nachwuchsmodule:** aktiver Athlet und Gruppen-/Trainerzuordnung werden im selben Schreib-Transaction-Kontext geprüft; der authentifizierte Trainer/Admin wird bei Änderungen von Principal-/Rollenrechten vor dem Schreiben erneut kontrolliert.
- **Selbst- und Proxyanmeldung:** vorhandene aktive Athlete-/Membership-/Scope-Prüfungen und atomarer Registration-/Session-Write werden beibehalten.
- **Fehlermeldungen sind im aktuellen Code schon vorhanden:** 403 \`TRAINING_WRITE_ACCESS_CHANGED\` bei nicht mehr berechtigtem Actor; 409 \`TRAINING_WRITE_SCOPE_CHANGED\` bei veralteter Gruppe/Athlet – ohne Datenbankdetails, mit Hinweis zum erneuten Laden. Beide Zustände dürfen nicht als \`Gespeichert\` dargestellt werden.

## Einmaliger fokussierter Handytest nach separat genehmigtem Preview-Deploy

1. **Bereits funktionierende Funktionen nicht neu abnehmen:** Login, Anwesenheit in U12/U14/Kindertraining und IRG-Selbstanmeldung nur jeweils kurz speichern/neu laden – mit synthetischen Testidentitäten.
2. **Schutzwirkung:** Nach Gruppenwechsel, deaktiviertem Athleten und nach entzogenem Trainerrecht muss ein veralteter Save abgelehnt werden. Alte Notizen/Anwesenheiten dürfen nicht still überschrieben werden.
3. **Fehleranzeige:** 403 oder 409 zeigt eine verständliche Meldung. Erneutes Laden und anschließendes korrektes Speichern funktioniert; keine verlorenen lokalen Eingaben ohne Hinweis.
4. **Rollback:** Den genannten Flag auf \`disabled\` zurückstellen, Preview erneut überprüfbar aktivieren. Dieser technische Rollback ist **kein** Ersatz für Rückabwicklung bereits persistierter personenbezogener Daten.

## Wichtige Grenzen und nächster Pilotentscheid

Der neue Schalter nimmt **keine** Produktionsänderung vor; er schließt nicht alle direkten SQL-Bypässe, alte Worker, ältere personenbezogene Freitexte oder vollständigen Restore-Replay ab. Der bestehende ULC-Produktionsvertrag bleibt \`blocked\`, insbesondere Datenschutz-/Erasure-Lifecycle und Trainingsdoku. Vor echten Vereinsdaten benötigt der Verein eine kurze verantwortliche Datenschutz-/Fristenentscheidung, zuverlässige automatische verschlüsselte Sicherung und eine sachlich begrenzte Abnahme des tatsächlichen Löschwiederanlage-Schutzes – kein neues großes K2-ACL-Projekt.

**Abnahme dieses Code-Pakets:** Worker- und Schalter-Negativtests, bestehende P03-I PostgreSQL-E2E sowie gesamte Quality Gate/Identity E2E auf exakt einem PR-HEAD. Ohne ausdrückliche Freigabe: kein Merge, kein Cloudflare-Flag, kein Deployment, keine DB-/R2-/Neon-Schreibaktion.
