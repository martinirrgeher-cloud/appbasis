# ULC Linz – P05 Erstkonfiguration für den tatsächlichen Vereinsstart

> **Korrektur vom 21.11.2026 (wichtig):** Die vier Gruppen wurden später
> zwar in `neondb` angelegt, aber aufgrund der einzigen aktiven
> `ulc_linz_membership` irrtümlich unter `ulc-linz-m6-smoke`, der
> **separaten Testorganisation** des M6-Smoke-Accounts. Die 3 Modulzuordnungen
> liegen ebenfalls dort. Das ist **keine echte Vereinsinitialisierung**.
> Die nachträgliche Prüfung hat 4 Testorganisations-Gruppen,
> 0 echte Vereinsgruppen und 0 echte App-Admin-Mitgliedschaften bestätigt.
> Das technische Root-Admin-Konto existiert, ist aber keiner echten
> ULC-Mitgliedschaft zugeordnet. **Keine Admin-Rolle an die
> Testorganisation vergeben.** Kein Datenbank- oder Rollen-Write zur
> Korrektur durchgeführt. Vor Reparatur ist eine dauerhafte
> Vereins-`organization_id` fachlich festzulegen; erst danach die
> 4 Gruppen und 3 Zuordnungen in einer geprüften Transaktion umhängen
> und den Root-Admin begrenzt für diese Zielorganisation aktivieren.
> Es gibt derzeit keine Trainingseinheiten, Trainer-/Athleten- oder
> Kalenderdatensätze an diesen Gruppen. Der P05-Kandidat und der
> Go-live-Lesecheck verweigern künftig die Smoke-Organisation.

**21.11.2026 · überprüfbarer Produktions-Einrichtungsentwurf, noch nicht ausgeführt.**

## Umfang und fachliche Herkunft

Die produktive `neondb` enthält derzeit **69** öffentliche Tabellen und
**keine** Trainingsgruppen, Trainer, Athleten oder Modul-Gruppenzuordnungen.
Die UI bietet getrennte Trainingsbereiche Kindertraining, U12, U14 und
Selbstanmeldung (Gruppe Irrgeher). Die vorhandene Preview enthält auch
explizite **Test-/Preview-Gruppen**; diese werden nicht übertragen.

Der Katalog legt genau vier **nicht personenbezogene** Gruppen vor:

| Gruppe | Interne ID | Modus | Trainingsmodul |
|---|---|---|---|
| Kindertraining | `ulc-linz-kindertraining` | Trainer erfasst Anwesenheit | `kindertraining` |
| U12 | `ulc-linz-u12` | Trainer erfasst Anwesenheit | `u12` |
| U14 | `ulc-linz-u14` | Trainer erfasst Anwesenheit | `u14` |
| Gruppe Irrgeher | `ulc-linz-irg` | Selbstanmeldung | keines; normale Gruppe |

Die drei Anwesenheitsmodule brauchen zusätzlich je eine
`ulc_linz_training_module_group`-Zuordnung. Die tatsächlichen
Trainingstage, Leistungsgruppen-Optionen und Trainerzuordnungen
bleiben bewusst unbestimmt, bis sie fachlich bestätigt wurden.

## Fertige, aber noch nicht angewendete Einrichtung

`apps/ulc-linz/proposals/p05-production-first-groups.candidate.sql`

- **Eine atomare Transaktion**: vier Gruppen und drei Modulzuordnungen.
- Nur in der namensgenauen Ziel-DB `neondb`, bei 69 Tabellen,
  genau **einer aktiven Vereinsorganisation** in den vorhandenen
  ULC-Mitgliedschaften und leerem Gruppen-/Modulbestand.
- Bei vorhandenen Trainern, Athleten oder Trainingseinheiten ohne
  Gruppen ist der Erstlauf blockiert.
- Nach vollständiger Erstinstallation ist ein identischer Zweitlauf
  ein **No-op**. Bei manuell veränderten Gruppen, zusätzlicher Gruppe,
  unvollständiger Modulzuordnung oder einer zweiten Organisation:
  **FAIL**, keine stillschweigende Korrektur.
- Kein `DELETE`, `UPDATE`, `GRANT`, `REVOKE`,
  keine Benutzer- oder personenbezogenen Datensätze, keine
  Übernahme alter Preview-Gruppen.
- Kandidat liegt ausschließlich unter `proposals/` und ist weder
  Bestandteil der 44 Datenbankmigrationen noch eines automatischen
  produktiven GitHub-Workflows. **Nicht eigenmächtig deployen.**
- Nach fachlicher Freigabe der vier Namen kann der geprüfte SQL-Block
  über den bereits verbundenen Neon-Produktionszugang mit einem
  einzigen kontrollierten Commit ausgeführt werden. Kein zusätzlicher
  GitHub-Secret- oder Work-Umweg nötig.

## Wirklich noch fehlende Rechte

Read-only Produktionszählung vom 21.11.2026:
ein aktiver ULC-Trainer-Login, eine Rollenverknüpfung mit
`ulc-linz:trainer`, **null zugewiesene Role-Capabilities für diese
Trainerrolle und 27 individuelle Revokes** für genau dieselbe Identität.
Die `ulc-linz:admin`-Rollenvorlage hat 28 Capabilities, es gibt aber
derzeit **keine** passende ULC-Admin-Mitgliedschaft. Der technische
Account `ulc.production.admin` existiert bereits, er ist jedoch
**kein** Nachweis für einen funktionsfähigen ULC-Admin-Login.

Die 27 expliziten Sperren dürfen **nicht blind gelöscht** werden.
Zur Inbetriebnahme braucht es eine absichtliche Rollen-/Scope-Zuordnung
für echte Funktionäre und Trainer im vorhandenen autorisierten
Benutzerverwaltungsweg. Keine erfundenen Profile, Athleten oder
Traineridentitäten.

## Reproduzierbare Abnahme

`node --test tooling/ulc-linz-p05-first-groups.postgres.test.mjs`

Installiert alle kanonischen **44 Migrationen / 69 Tabellen** in einer
wegwerfbaren PostgreSQL-18-Datenbank auf `localhost`. Prüft atomare
Erstanlage, exakte Namen, drei Moduladressen, idempotenten Zweitlauf,
falsches DB-Ziel, geänderte Gruppe, fehlende Zuordnung und eine zweite
Organisation. Die Testdaten sind ausschließlich synthetisch.

## Danach – tatsächlicher Produktivstart

1. Namen und Modi der vier Gruppen **einmalig** fachlich abnehmen;
   kontrolliert auf `neondb` initialisieren.
2. Trainingskalender und Trainerzuordnungen über die reguläre App
   pflegen; keine Default-Tage erfinden.
3. Technischen Admin wiederverwenden, aber einen echten,
   autorisierten ULC-Admin und Trainerzugang herstellen; Revokes nur
   gezielt nach nachvollziehbarer Entscheidung ändern.
4. Vereinsathleten/Trainer nur über autorisierte Stammdaten- oder
   Importwege übernehmen. Kein synthetischer Import.
5. Go-live-Sammelcheck #696 erneut ausführen und je ein reales
   Kindertraining-, U12-, U14-, IRG-Login-/Speicher-Smoke durchführen.
6. Die gesonderten P01-/Lösch-/Medien-/R2-Gates bleiben bis zur
   fachlichen Freigabe unabhängig gesperrt.

**Status:** Gruppen-SQL **Kandidat**, kein produktives DML;
Prototypische Gruppeneinrichtung ist kein Beweis für berechtigte
Trainer, vollständige Stammdaten oder eine Datenschutzfreigabe.
