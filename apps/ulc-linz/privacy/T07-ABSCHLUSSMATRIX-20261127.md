# T07 – konsolidierte Abschlussmatrix und fachliche Entscheidungsreste

**Stand 27.11.2026 | Keine automatische Gatesetzung, keine Produktivfreigabe.** Verbindliches Ticket [#716](https://github.com/martinirrgeher-cloud/appbasis/issues/716); keine neue zentrale Liste. Diese Matrix dient nur als nachweisbezogene **Abnahmebeilage** und verweist auf bestehende Dokumente.

| Prüfung | Anerkannter Nachweis | Noch wirklich offen |
| --- | --- | --- |
| Dateninventur | 69 Tabellen, 8 Owner; read-only Postgres-Inventur, Trigger und 0 Trainings-/Athleten-Fachdaten; Details #716 und P05-Fakten | Nullbestand ist kein Vollerasure-PASS |
| Erasure-Technik | PRs #724, #726–#731 mit PG-/CI/Review; geschützte Owner-Operationen und Freitext-/Audit-Inventar | Keine durchgängige produktiv aktivierte 8-Owner-Transaktion; echte Einzelfall-Nachkontrolle, kein künstlicher Echtfall |
| **Fachliche Löschpraxis** | P01-Ziele 14.11. bestätigt; [T07-Betriebsanweisung](./T07-LOESCHPRAXIS-BETRIEBSANWEISUNG-20261127.md) bündelt Verfahren | Verantwortliche Vereinsfunktion nimmt die Anweisung rechts-/fachlich ab; Freitext-/Actor-/Audit-Redaktion technisch nur dort ausführen, wo Berechtigung/Ownerweg tatsächlich existieren |
| **Backups und Restore** | [T07-Sicherungsregister](./T07-SICHERUNGEN-EXPORTE-RESTORE-20261127.md); Cloudflare EU-R2/30d, Neon Frankfurt/6h, Snapshot/4 Branches; T09 PASS | Unbefristeter Parent bis terminierter TTL-Folgeprüfung, manuelle Exporte, providerinterne Kopien und Quarantäne-/Re-Deletion-Grenzen |
| **DPA/AVV und Transfers** | #716: Cloudflare Konto-DPA-Link und öffentliche DPA v6.4, Self-Serve-Mechanismus, Subprozessoren; Neon Org/Billing, Neon Schedule → MCSA → DPA, AWS Frankfurt | Kontospezifische abweichende Vereinbarungen/individueller Vertragsannahme- und tatsächlicher Datenflussbeleg in nichtöffentlicher Vereinsakte, soweit verfügbar |
| **Betroffeneninformation** | [T02-Datenschutzhinweis](./T02-APP-DATENSCHUTZINFORMATION-ENTWURF.md) und [Informationsverfahren](./T02-INFORMATION-VEROEFFENTLICHUNG-UND-VERSAND.md) vorbereitet; App-Kontakt und Versandweg bestätigt | Finale Recht-/Provider-/Fristenprüfung; reale App-Veröffentlichung und die gesondert genehmigte Erstinformation mit Versandnachweis |
| **Release-Gates** | Drei Modulstatus früher ready, Katalog/Blöcke/Doku technisch weit fortgeschritten; funktionale Mobiltests T08/T09 nicht wiederholen | `apps/ulc-linz/appbasis.production.json`: `status`, `applicationLifecycle`, `privacy` noch blocked; drei Modul-Lifecycles nicht READY; `--require-ready` nicht als PASS behaupten |

## Entscheidungspaket statt zahlreicher Rückfragen

1. **Nichtöffentlich fachlich zu entscheiden:** Gilt das oben dokumentierte manuelle Verfahren einschließlich Ausnahmen, Fristen, konkreter Zuständigkeit und Löschprüfung für den begrenzten Vereinsbetrieb? Die bereits am 14.11. bestätigten **Zielwerte nicht neu abstimmen**.
2. **Nichtöffentlich zu inventarisieren:** zusätzliche manuelle Exporte vorhanden? Falls ja, Kategorie/Frist/Zugriff/Löschweg. Keine pauschale Negativbehauptung ohne Kenntnis.
3. **Datenschutz-/Providerabnahme:** per Zweck Art.-6-Begründung, Interessen von Kindern/Eltern und Rechts-/Transfer-/Providerreferenzen der tatsächlich genutzten Accounts in zugriffsbeschränkter Akte ablegen. Keine persönlichen Verträge in öffentlicher GitHub-Doku.
4. **Technische Restarbeit:** sichere, datensatzbezogene Freitext-/Audit-Owner-Bereinigung und die tatsächlichen Modul-/App-Lifecycle-Belege ohne Sicherheits-Statusfiktion vervollständigen, mit einem gezielten Testpaket statt vollständiger Wiederholung der vergangenen App-Tests.
5. **Erst dann** einmalige Betreiberentscheidung gemäß [T10-Blatt](../release/T10-EINMALENTSCHEID-20261123.md), separat genehmigter T11-Deploy/Ingress. Bis dahin **T07 OPEN, T10 NO-GO** und alte Restore-Promotion absolut STOP.

**Dieses Dokument schließt den Dokumentationsrest, nicht den Erasure-, Vertrags-, Live-Privacy- oder Deployrest.** Es setzt keinerlei produktive Daten-, Provider-, Secret-, Rollen-, Policy- oder Retentionänderung um.
