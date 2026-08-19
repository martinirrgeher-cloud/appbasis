# M5-G – Provider Baseline Update 2026-08-19

Stand: 2026-08-19, 14:53 Europe/Vienna

## Status

**Korrektur einer veränderlichen Provider-Baseline; keine Architektur- oder Providerentscheidung.**

Dieses Dokument löst ausschließlich die nachfolgend bezeichneten veralteten Provider-Snapshot-Aussagen in `docs/M5-G-PROVIDER-COMPLIANCE-PLAN.md` ab. Der technische M5-G-Vertrag, ADR-022 und die fail-closed Kriterien bleiben unverändert.

## 1. Gefundener Widerspruch

Die ältere Fassung des Compliance-Plans beschreibt für Neon sinngemäß:

- `neon.com/subprocessors` verweise auf eine Databricks-Subprozessorenstruktur,
- das Neon Product Specific Schedule ergänze dazu einzelne Neon-spezifische Subprozessoren wie Grafana.

Diese Provider-Snapshot-Aussage ist mit den am 2026-08-19 erneut gelesenen offiziellen Neon-Quellen nicht mehr die maßgebliche aktuelle Darstellung.

## 2. Aktuelle offizielle Neon-Baseline

Am 2026-08-19 zeigen die offiziellen Quellen:

1. Das aktuelle **Neon Platform Services Product Specific Schedule** ist weiterhin Teil der Databricks-Vertragsstruktur und ergänzt/ändert das Databricks Master Cloud Services Agreement für Neon Platform Services.
2. Das Schedule erklärt ausdrücklich, dass Verweise auf die `Subprocessor List` für Neon Platform Services auf die **Neon-spezifische Liste unter `https://neon.com/subprocessors`** zu verstehen sind.
3. Die Neon-Seite **List of Neon’s Sub-processors**, aktuell mit `Last updated: 16 April 2026`, führt selbst die für Neon Platform Services verwendeten Subprozessoren und deren Standort/Zweck auf.
4. Diese Neon-spezifische Liste – nicht eine statisch im Repository nachgebildete Kombination aus Databricks-Liste plus Einzelergänzungen – ist daher die primäre aktuelle Subprozessorenquelle für den Neon-Service-Scope.
5. Die Databricks-Vertrags-/DPA-Struktur bleibt trotzdem relevant, weil das Neon Product Specific Schedule auf das Databricks Agreement/DPA aufsetzt.

## 3. Konsequenz für M5-G Evidence

Der bestehende technische Provider-Key `neon-databricks` kann als Repositorybezeichnung für die kombinierte Vertragsbeziehung bestehen bleiben. Für reale Legal-Evidence gilt aber:

- `terms`: aktuelles Neon Product Specific Schedule,
- `dpa`: die durch das Schedule maßgebliche Databricks-DPA-/Agreement-Kette,
- `dpa-account-binding`: konkrete Vertragsbindung des tatsächlichen ULC-Accounts,
- `subprocessors`: **aktuelle Neon-spezifische Liste `neon.com/subprocessors`**, wie durch das Schedule referenziert,
- `security`: aktuelle Neon-Security-Dokumentation bzw. Schedule/Security Addendum im relevanten Service Scope.

Der Evidence-Reader darf keine historische statische Vendor-Liste aus dem Repository als Ersatz für die aktuelle Providerquelle verwenden.

## 4. Weitere aktuell bestätigte Neon-Baseline

Unverändert bestätigt:

- AWS Europe (Frankfurt) / `aws-eu-central-1` ist eine unterstützte Neon-Region.
- Neon dokumentiert TLS 1.2/1.3 für Daten in transit.
- Neon dokumentiert AES-256 für Daten at rest.

Diese öffentlichen Providerfähigkeiten verifizieren weiterhin **keine** konkrete ULC-Produktionsressource. Region, Encryption und Account-Binding bleiben bis zum realen Production-Evidence-Lauf `open`.

## 5. Cloudflare-Baseline

Die erneute Prüfung bestätigt aktuell:

- Cloudflare DPA Version 6.4, wirksam seit 2026-04-03,
- separate aktuelle Cloudflare-Subprozessorenliste für Cloudflare Services,
- internationale Transfer-/SCC-Regeln im DPA,
- vertragliche Security Measures einschließlich Verschlüsselung von Customer Data at rest und in transit.

Auch hier gilt: öffentliche Baseline ist nicht gleich account-spezifische ULC-Production-Evidence.

## 6. Dauerregel

Provider-Dokumente sind veränderliche externe Evidence.

Deshalb künftig:

- unmittelbar vor Production Gate erneut abrufen,
- tatsächliche Version/UpdatedAt erfassen, sofern der Provider sie veröffentlicht,
- `observedAt` und `validUntilOrReviewAt` setzen,
- Service Scope gegen real verwendete Dienste prüfen,
- keine alte Vendor-/Versionsliste als dauerhafte Repositorywahrheit behandeln.

## 7. Externe Wirkung

Keine. Keine Vertragsannahme, kein Providerwrite, kein Account-/Planwechsel und kein M5-Kriterium wurde hierdurch verifiziert.
