# P03-I – atomare Trainer-/Admin-Actor-Berechtigung beim echten Anwesenheitsschreiben

**14.11.2026 – opt-in Draft, keine Preview-/Produktionsaktivierung, kein Merge.**

## Bestandslücke

P03-G und P03-H prüfen atomar den aktuellen Athleten- und Gruppenstand, aber die **Identität des Trainierenden**, seine kanonische Rolle und eine aktuell entzogene individuelle Modulberechtigung wurden beim eigentlichen `saveSession` **nicht** unter PostgreSQL-Locks nachgeprüft. Ein Client mit veralteter Trainerberechtigung konnte nach dem Laden einer Trainingsliste im SQL-Writer noch speichern. Die bestehenden HTTP-Access-Prüfungen sind vorgelagert und schließen parallele Revokes nicht von selbst aus.

## Reale Integration, ohne bestehende Funktionen zu überschreiben

- Neuer, ausschließlich explizit opt-in Modus `require-live-training-actor-transaction` auf der bestehenden, gemeinsam genutzten `PostgresUlcTrainingSessionRepository`. Er erbt die Athleten- und Gruppen-/Trainerprüfungen von P03-G/H.
- Der **authentifizierte HTTP-Access-Scope** (nicht ein Request-JSON-Feld) liefert `actorPrincipalId` über die existierenden U12-, U14-, Kids- und ältere Kindertraining-Servicemethoden bis zur `saveSession`-Transaktion. Der identische Codepfad für `kindertraining`, `u12`, `u14` bleibt erhalten. Ein fehlender/widersprüchlicher Actor wird im neuen Modus vor jedem Write abgelehnt.
- In der Datenbank wird zunächst `appbasis_permission_principal` für genau die angemeldete Identität unter `FOR SHARE` gesperrt. Der vorhandene `PostgresPrincipalPermissionAdministration`- und `PostgresRoleAdministration`-Pfad verwendet auf derselben Principal-Zeile `FOR UPDATE`, also können autorisierte Grant-/Revoke-/Role-Replacements den laufenden Trainingswrite nicht überholen.
- Ebenfalls unter `FOR SHARE`: aktive Vereins-`ulc_linz_membership` (genau `trainer` oder `admin`), **genau eine** zum Source-Role passende `appbasis_permission_principal_role`, aktiver Role-Eintrag, bekannte Edit-Capability `ulc-linz:module:{u12|u14|kindertraining}:edit` und vorhandene Grant-/Revoke-/Role-Capability-Quellen. Effektive Entscheidung wie `PostgresPermissionStore.can`: **Revoke vor Grant vor aktiver Rollen-Capability**.
- Trainer zusätzlich: aktueller, aktiver `appbasis_trainer` im selben Verein und eine Trainer-Gruppenzuordnung. Admin benötigt keine Trainer-Gruppenmitgliedschaft. Eine erfolgreich geprüfte Athletenliste in anderer Organisation darf nicht durch fremde Identitäten gespeichert werden.
- Der Opt-in-Modus besitzt weiterhin die transaktionale Selbst-/Proxyregistrierungsprüfung aus P03-H; deren tatsächliche API bleibt unverändert.

**Default = legacy, kein Worker-Entrypoint aktiviert den neuen Modus**. Dieses Paket ändert weder Manifest noch produktive Migrationen, Cloudflare-Variablen, Release-Verträge, UI oder bestehende Berechtigungstemplates.

## Tests und Abnahmekriterien

Die zusätzliche PostgreSQL-Datei `test/p03-live-training-session-actor-permission.postgres.e2e.test.ts` läuft gegen **nur die 41 bestehenden Migrationen** in einer eigenen Wegwerf-Datenbank. Prüft gültige Trainer-/Admin-Schreibpfade, fehlende/fremde Identität, Role-Mismatch, Trainergruppen- und Identity-Revoke, tatsächlichen kanonischen `PostgresPrincipalPermissionAdministration`-Revoke, explizite Grants, zwei echte 2-Connection-SQL-Races (Writer zuerst und Revoke zuerst), keine teilgespeicherte Anwesenheit. Vor PASS sind Typecheck, gesamtes Quality Gate und Identity PostgreSQL E2E auf exakter HEAD-SHA erforderlich.

## Weiterhin BLOCKED

- Die Prüfung setzt die **Authentifizierung am HTTP-Rand** voraus; der Repo-Parameter `trustedActorIdentityId` ist intern, darf nie aus JSON des Clients übernommen werden. Repository allein ist kein Authenticator.
- Der nachgewiesene Lock wirkt gegen die **bestehende kanonische** Principal-/Role-/Override-Administration, die den Principal zuerst `FOR UPDATE` sperrt. Direkte SQL-Änderungen von Grant-/Revoke-/Role-Capability-Kindtabellen ohne diesen Parent-Lock, externe Adminwege, INSERT-Phantome und Restore sind nicht garantiert serialisiert. Solche Wege benötigen einen separaten DB-seitigen Enforcement-/Owner-Fence.
- Die aktuelle Worker-HTTP-Fehlerzuordnung für den neuen, standardmäßig nicht aktivierten Actor-Blocker ist vor einer gesonderten Preview-Aktivierung zu definieren und zu testen. Es gibt keine neue öffentliche API-Antwort.
- Traineranwesenheits-Historie/Freitext über Dritte, Wiederanlage bei Restore, P01-D2/8-Owner-/Backups-/rechtliche Löschfreigaben, P02-Medien-Provider-Nachweis und vollständige App-Lifecycle-Abnahme fehlen weiterhin. `privacy=blocked`, `applicationLifecycle=blocked`, 35 Tage und `postExpiryRetry=deny` bleiben unberührt.

**Kein Merge, keine Datenbankmigration, kein Provider-/Google-Drive-/Neon-/R2-Write, kein Deployment.** Nach grünem exact-HEAD-CI muss dieser PR ohne Commitänderung auf P03-H #628 gestapelt werden. Danach nicht weiter Sicherheitsdemos unbegrenzt anhäufen, sondern eine klare, begrenzte Preview-/Go-live-Entscheidungsvorlage aus den verbleibenden tatsächlichen Risiken ableiten.
