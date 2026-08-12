# AppBasis Projektstand

## Phase

Phase 2A – Persistence + Identity Foundation

## Ziel

Von Fachmodulen entkoppeltes, lokal prüfbares Fundament für PostgreSQL-Persistenz und
Benutzername-basierte Identity. Es existiert weiterhin weder ein Deployment
noch eine produktive Datenbank- oder Auth-Konfiguration.

## Aktueller Stand

- `packages/database` enthält ausschließlich fachneutrale PostgreSQL-Primitiven
  auf Basis von Drizzle ORM.
- `packages/identity` besitzt das Better-Auth- und AppBasis-Identity-Schema
  sowie dessen versionierte Drizzle-Migrationen und reproduzierbare Snapshots.
- Die unveränderten Better-Auth-Modelle `user`, `session`, `account` und
  `verification` wurden mit der offiziellen Better-Auth-CLI 1.6.27 für Drizzle
  erzeugt. Username- und technische Admin-Felder sind enthalten.
- `appbasis_person` ist vom Login getrennt und darf ohne Auth-Identity
  existieren.
- `appbasis_identity_security_state` hält ausschließlich AppBasis-eigenen
  Sicherheitszustand: `mustChangePassword`, Zeitstempel und die optionale
  Zuordnung zu einer Person. Better Auths `banned`-Feld bleibt der autoritative
  technische Aktivstatus; AppBasis dupliziert ihn nicht.
- Passwörter oder Passwort-Hashes werden nicht in AppBasis-eigenen Tabellen
  gespeichert. Better Auth hält Credential-Hashes ausschließlich in seiner
  `account`-Tabelle.
- `packages/identity` definiert öffentliche AppBasis-Services für initiale
  Benutzeranlage, Username-Anmeldung, erzwungenen Passwortwechsel, aktuelle
  Identity und Deaktivierung. Better Auth bleibt eine interne Implementierung;
  eine allgemeine Provider-Abstraktion wird ohne zweiten realen Provider oder
  konkreten Wechselbedarf bewusst nicht veröffentlicht.
- Eine einzige zentrale Funktion erzeugt aus dem normalisierten Benutzernamen
  eine gehashte technische Adresse unter der reservierten Domain `.invalid`.
  Diese Adresse ist kein Kontaktmerkmal und darf weder angezeigt noch für
  Nachrichten verwendet werden.
- Öffentliche Selbstregistrierung, E-Mail-Anmeldung und öffentliche
  Username-Verfügbarkeitsprüfung sind in der gekapselten Better-Auth-
  Konfiguration deaktiviert.
- Better Auths Admin-Rolle ist ausschließlich technische Auth-Administration.
  Sie ist keine AppBasis-Businessrolle und gewährt keine fachlichen Rechte.
- Migrationen werden real gegen eine leere PGlite-Datenbank angewendet und
  wiederholt ausgeführt. Fachcode enthält keine PGlite-Spezifika.

## Erstlogin-Vertrag

1. Ein administrativer Serverprozess legt Benutzername, Anzeigename und ein
   temporäres Passwort an.
2. Better Auth erhält intern die zentrale technische E-Mail; eine reale
   Kontaktadresse ist nicht erforderlich.
3. AppBasis erzeugt den Sicherheitszustand mit `mustChangePassword=true`.
4. Nach erfolgreicher Username-Anmeldung sind nur Passwortwechsel und
   Session-Ende zulässig.
5. Der Passwortwechsel widerruft andere Sessions; erst danach setzt AppBasis
   `mustChangePassword=false`.
6. Eine Deaktivierung sperrt die Auth-Identity und erhält Personen- sowie
   spätere Fach- und Historiendaten.

## TypeScript-Prüfung

Eigener App-, Worker-, Database-, Identity- und Testcode bleibt vollständig
unter den strikten Root-Regeln geprüft. Nur in den beiden neuen Infrastruktur-
Paketen ist `skipLibCheck=true` gesetzt, weil die aktuellen stabilen Drizzle-,
PGlite- und Better-Auth-Pakete Deklarationen für optionale Treiber sowie
Emscripten veröffentlichen, die ohne diese Library-only-Ausnahme nicht
kompilieren. Die Ausnahme überspringt keinen AppBasis-Quell- oder Testcode.

## Bewusst noch nicht umgesetzt

- kein Neon-Projekt und keine externe PostgreSQL-Datenbank
- kein Cloudflare-Deployment und keine Cloud-Secrets
- kein Better-Auth-End-to-End-Lauf gegen echtes PostgreSQL; PGlite ist von
  Drizzle offiziell unterstützt, wird von Better Auth aber nicht ausdrücklich
  als Laufzeitdatenbank dokumentiert
- keine Benutzerverwaltungs- oder Login-Oberfläche
- keine produktive Adapter-Komposition in `apps/reference`
- keine AppBasis-Rollen oder Berechtigungen; diese folgen separat und werden
  serverseitig in `packages/permissions` erzwungen

## Nächster technischer Meilenstein

Phase 2B soll eine ausdrücklich freigegebene PostgreSQL-/Neon-Testumgebung
anbinden, die Better-Auth-Adapterintegration und den vollständigen
Admin-Anlage-/Erstlogin-/Passwortwechsel-/Deaktivierungsfluss serverseitig
End-to-End prüfen. Deployment bleibt ein eigener Freigabeschritt.
