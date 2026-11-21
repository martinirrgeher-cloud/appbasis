# ULC Linz P05 – U14 im Rechteeditor sichtbar machen

**21.11.2026 – technischer Code-Patch, keine Rechtevergabe, kein Deployment.**

Die kanonische `apps/ulc-linz/worker/role-data-scope.json` sieht
`u14` für den Kindertrainer ausdrücklich als lesbar und bearbeitbar vor;
auch `assertUlcLiveTrainingWriterActor` benötigt bereits die
`ulc-linz:module:u14:edit`-Capability.

Bislang fehlte `u14` jedoch in
`ULC_USER_ACCESS_MODULES` des Benutzermoduls. Dadurch konnte ein
berechtigter Administrator die U14-Ansicht/Bearbeitung nicht regulär
im mobilen Rechteeditor freigeben und das Kindertrainer-Profil nahm
diese Berechtigung trotz des kanonischen Role-Scope-Vertrags nicht auf.

## Korrektur

- Neues, exakt abgegrenztes Modul `u14` im bestehenden Rechteeditor.
- `kindertrainer` und `administrator`: U14 auf `edit`;
  `leistungstrainer`, `funktionaer`, `athlet`, `eltern`: keine
  pauschale Rechteaufweitung.
- Der vorhandene serverseitige Benutzerrechte-Dienst wertet die
  erweiterte exakte Modulliste unverändert aus: ausschließlich ein
  authentifizierter, berechtigter Admin kann Benutzerrechte ändern,
  mit optimistischer Versionskontrolle und erhaltener Principal-Rolle.
- `user-admin-access-roles.test.ts` prüft, dass U14 sichtbar ist
  und eine gezielte Freigabe ausschließlich die beiden eigenen
  `u14:view`-/`u14:edit`-Principal-Capabilities vorbereitet,
  ohne U12-/Stammdaten-/Administratorrolle zu öffnen.

## Echte Produktion weiterhin gesperrt

Die `neondb`-Capability-Tabelle kennt die beiden U14-Capabilities;
die bestehende Adminrolle besitzt `u14:edit`. In Produktion ist aber
weiterhin **keine aktive fachliche ULC-Admin-Mitgliedschaft**
eingerichtet. Die eine vorhandene aktive Traineridentität hat
**27 explizite Revokes** und die Trainerrolle selbst aktuell
keine Modul-Capabilities. Keines dieser Rechte wird von diesem PR
verändert.

Die vier freigegebenen Produktionsgruppen einschließlich U14 wurden
bereits in `neondb` angelegt und kontrolliert, aber es gibt noch keine
echten Trainer-/Athletenstammdaten. Vor dem Live-Schreibtest müssen ein
berechtigter ULC-Admin und die individuellen Trainer-/Gruppenrechte
über den bestehenden autorisierten Verwaltungspfad eingerichtet werden.

**Kein** SQL-Write, Gruppen-/Rechte-/Personenimport,
Neon-/Cloudflare-Refresh, Migration oder Privacy-Go durch diesen PR.
Ein technischer CI-PASS ist keine Freigabe für echte Kinder-/Vereinsdaten.
