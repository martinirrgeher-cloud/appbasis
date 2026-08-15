# Reference Role Admin Secret Bootstrap

Der interne Worker `appbasis-reference-role-admin` benötigt denselben bestehenden Better-Auth-Sessionvertrag wie die öffentliche Reference-App.

Wenn der Secret-Wert dem Operator nicht verfügbar ist, darf kein neuer Wert erfunden und der bestehende Reference-Secret nicht rotiert werden. Stattdessen kann der manuelle GitHub-Workflow `Reference Role Admin Secret Bootstrap` den bereits geschützten GitHub-Actions-Wert `APPBASIS_BETTER_AUTH_SECRET` direkt als Cloudflare-Worker-Secret `BETTER_AUTH_SECRET` auf den bereits vorbereiteten internen Worker übertragen.

Sicherheitsgrenzen:

- nur manueller `workflow_dispatch`
- zusätzliches explizites `apply`-Gate
- Worker muss bereits existieren
- kein automatisches Provider-Create
- `workers.dev`, Preview URLs, Routes und Custom Domains müssen vor dem Secret-Schritt weiterhin deaktiviert sein
- Ingress wird vor und nach der Secret-Änderung fail-closed geprüft
- kein Hyperdrive-, Datenbank- oder Produktionsschritt
- Secret-Wert erscheint weder im Repository noch in normalen Logs

Nach erfolgreichem Bootstrap bleibt der normale `Reference Preview Deploy` der maßgebliche M1-Deploy- und Acceptance-Pfad.
