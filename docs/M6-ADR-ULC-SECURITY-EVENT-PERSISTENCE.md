# ADR – M6 ULC Security-Event-Persistenz

Stand: 2026-09-01
Status: angenommen
Entscheidung: Variante 2

## Kontext

Für `ulc-linz` muss der M5/M6-Vertrag einen realen persistenten Security-Logging-Sink nachweisen. Die App besitzt bereits eine eigene dedizierte Produktionsdatenbank. Eine zusätzliche Logging-Plattform, eine gemeinsame Audit-Datenbank oder eine öffentliche Log-API würde für den ersten realen Produktionspfad eine neue Plattformgrenze ohne zweiten realen Verbraucher schaffen.

## Entscheidung

ULC-Security-Events werden in der **eigenen dedizierten ULC-Produktionsdatenbank** persistiert.

Der Vertrag ist app-spezifisch:

- Tabelle `ulc_linz_security_event_log` gehört ausschließlich `ulc-linz`.
- Es gibt keine gemeinsame Produktionsdatenbank verschiedener Apps.
- Es gibt keine freie Payload-/JSON-Spalte und keinen vorgesehenen Pfad für Request-Bodies, Cookies, Session-Tokens, Passwörter, Datenbankadressen oder Secrets.
- Die Runtime schreibt nur bereits normalisierte Denial-Events.
- Die Retention beträgt exakt zwölf Monate; operative Löschung bleibt eine geschützte Betreiber-/Control-Plane-Aktion.
- Es entsteht kein öffentlicher Read-/Admin-Endpunkt für Security-Events.

## Generatorvertrag

`createAppSkeleton()` bleibt der kanonische Generator-/Publikationspfad. ULC-spezifische Runtime-, Sink- und Migrationsbestandteile dürfen deshalb nicht als nachträglicher Hand-Patch ausschließlich unter `apps/ulc-linz` existieren.

Der reale ULC-Verbraucher wird als enger app-spezifischer Generator-Vertical-Slice erzeugt. Andere Identity-/Permissions-Apps bleiben unverändert; aus dieser Entscheidung wird noch keine generische Security-Logging-Plattform abgeleitet.

Generator- und eingecheckte ULC-Runtime müssen für die generatorverwalteten Dateien byte-identisch bleiben. Drift ist CI-blockierend.

## Sicherheits- und Release-Grenze

Diese ADR autorisiert keine externe Mutation. Insbesondere nicht enthalten:

- kein Providerwrite,
- keine produktive Migration,
- kein Deployment,
- keine Secret-Änderung,
- keine Produktionsfreigabe.

Repository-Code und Tests allein verifizieren `auditSecurityLogging` noch nicht. Produktions-Evidence bleibt fail-closed, bis Migration und aktuelle Runtime-/Sink-Bindung real nachgewiesen sind, ein kontrollierter Denial-Write im Produktionssink beobachtet wurde, kein öffentlicher Read-Pfad besteht und der geschützte Retention-Vertrag auf der realen Produktionsdatenbank belegt ist. Dieser Retention-Nachweis umfasst die serverseitige 12-Kalendermonats-Grenze, die kanonische geschützte Cleanup-Funktion, Least-Privilege-/ACL-Grenzen und die Bindung an den geprüften Implementierungsdigest.

Ein bereits erfolgreich ausgeführter destruktiver Produktions-Purge ist **kein eigenes M5-Pflichtkriterium**. Der manuelle Purge bleibt ein separat freizugebender operativer Betreiber-/Control-Plane-Nachweis und kann zusätzliche Betriebs-Evidence liefern. Eine spätere automatische oder zeitgesteuerte Cleanup-Aktivierung bleibt eine eigene mutierende Produktionsentscheidung und wird durch M5 nicht autorisiert.

## Verworfen

- separate gemeinsame Audit-/Logging-Datenbank,
- neue R2-/Logpush-/externe Logging-Plattform nur für diesen Slice,
- Persistenz nur in flüchtigen Worker-Logs,
- nachträglicher ULC-Runtime-Patch außerhalb des kanonischen Generators.
