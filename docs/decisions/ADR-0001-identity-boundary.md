# ADR-0001: Provider-neutrale Identity-Grenze

- Status: Angenommen für Phase 2A
- Datum: 2026-08-11

## Kontext

AppBasis verwendet öffentlich einen Benutzernamen als Login-ID. Eine reale
E-Mail-Adresse ist ein optionales Personenmerkmal und darf weder Voraussetzung
für ein Login noch automatisch eine Kontaktadresse sein. Better Auth benötigt
für seinen E-Mail-/Passwort-Authenticator intern dennoch ein E-Mail-Feld; sein
[Username-Plugin](https://better-auth.com/docs/plugins/username) ergänzt den
Benutzernamen, ersetzt dieses interne Pflichtfeld aber nicht.

Eine Person oder ein Stammdatensatz muss außerdem ohne Login existieren können.
Auth-Konten, AppBasis-Personen und spätere fachliche Rollen haben daher
unterschiedliche Lebenszyklen.

## Entscheidung

1. Fachmodule und Apps verwenden ausschließlich die öffentlichen Verträge aus
   `packages/identity`. Direkte Better-Auth-Aufrufe außerhalb dieser
   Infrastrukturgrenze sind nicht zulässig.
   Phase 2A veröffentlicht keine allgemeine Auth-Provider-Abstraktion. Eine
   solche Abstraktion wird erst bei einem zweiten realen Provider oder einem
   konkreten Wechselbedarf aus den dann belegten Gemeinsamkeiten extrahiert.
2. Der öffentliche Login-Begriff ist `username`. Anzeigename und optionale
   reale E-Mail gehören zum AppBasis-Profil beziehungsweise zur Person.
3. Genau eine zentrale Funktion bildet den normalisierten Benutzernamen auf
   eine gehashte technische Adresse unter `identity.invalid` ab. Die reservierte
   `.invalid`-Domain ist nicht zustellbar. Der Wert wird nie angezeigt und nie
   für Benachrichtigungen verwendet.
4. Better Auth behält seine offiziellen Tabellen- und Feldnamen. Das Schema
   wird mit dem offiziellen Drizzle-Adapter und versionierten Drizzle-
   Migrationen innerhalb von `packages/identity` verwaltet. Das fachneutrale
   `packages/database` stellt nur Datenbankprimitiven und -werkzeuge bereit.
5. Better Auths Admin-Plugin dient nur der technischen Auth-Administration:
   Benutzer anlegen, sperren und Sessions widerrufen. Seine `role` ist keine
   AppBasis-Businessrolle.
6. AppBasis-Businessrollen und -rechte werden später unabhängig in
   `packages/permissions` modelliert und serverseitig erzwungen.
7. `mustChangePassword`, Zuordnung und Audit-Zeitstempel liegen im
   AppBasis-eigenen Sicherheitszustand. Der technische Aktivstatus bleibt beim
   Better-Auth-System. Passwörter und Hashes liegen ausschließlich dort.

## Konsequenzen

- Fachmodule bleiben von Better Auth entkoppelt, ohne dass AppBasis vor einem
  belegten Bedarf einen allgemeinen Providervertrag festschreibt.
- Identity-Schemaänderungen und ihre Migrationen bleiben im Besitz von
  `packages/identity`; `packages/database` bleibt fachneutral nutzbar.
- Personen- und Historiendaten überleben die Deaktivierung eines Logins.
- Die technische E-Mail kann nicht versehentlich als echte Kontaktadresse
  interpretiert werden.
- Der Erstlogin muss serverseitig fachliche Nutzung blockieren, solange
  `mustChangePassword=true` ist.
- Phase 2A prüft PostgreSQL-Schema und Migrationen lokal mit PGlite. Ein echter
  Better-Auth-Lauf wird erst in Phase 2B gegen ausdrücklich provisioniertes
  PostgreSQL/Neon geprüft, weil Better Auth PGlite nicht als Laufzeitadapter
  dokumentiert.

## Verworfene Alternativen

- Technische Auth-E-Mail als reale E-Mail behandeln: verletzt die fachliche
  Optionalität und kann Fehlzustellungen verursachen.
- Better Auth direkt in Apps oder Fachmodulen verwenden: koppelt öffentliche
  Verträge an einen austauschbaren Provider.
- Businessrollen mit Better-Auth-Adminrollen modellieren: vermischt technische
  Auth-Verwaltung mit fachlicher Autorisierung.
- Personen direkt aus Auth-Benutzern ableiten: verhindert Personen ohne Login
  und gefährdet historische Beziehungen bei Account-Deaktivierung.
