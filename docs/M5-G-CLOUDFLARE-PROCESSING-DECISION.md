# M5-G – ULC Cloudflare Processing Decision

Stand: 2026-08-17

## Entscheidung

Für **ULC Linz v0.1** gilt verbindlich **Variante A: Standard Cloudflare Workers mit kontrollierter globaler Transient-Verarbeitung**.

## Zielvertrag

- Persistente personenbezogene Primärdaten liegen in der eigenen ULC-Neon-Produktivdatenbank in **EU / Frankfurt**.
- Cloudflare Workers bleiben für ULC v0.1 soweit möglich zustandslos bezüglich personenbezogener Fach-/Identity-Daten.
- Für M5 v0.1 werden keine zusätzlichen Cloudflare-Persistenzdienste für personenbezogene ULC-Daten vorausgesetzt.
- TLS wird verwendet; TLS-Terminierung und Worker-Ausführung dürfen im globalen Cloudflare-Netz stattfinden.
- Cloudflare-Verarbeitung wird ausdrücklich **nicht als EU-only** dokumentiert.
- Cloudflare-DPA, internationale Transfermechanismen und Subprozessorenlage bleiben Teil der M5-G-Evidenz.
- Logs/Observability werden datenminimiert; keine Secrets und keine unnötigen fachlich/personenbezogenen Inhalte.
- Regional Services und Customer Metadata Boundary werden für v0.1 **nicht vorsorglich beschafft oder vorausgesetzt**.

## Gate-Wirkung

Diese Betreiber-/Architekturentscheidung klärt das akzeptierte Cloudflare-Verarbeitungsmodell, setzt `dataRegion` aber **nicht** auf `verified`.

Vor Production Ready müssen weiterhin app-spezifisch und read-only belegt werden:

1. reale ULC-Cloudflare-Runtime und tatsächlich verwendete Bindings/Dienste,
2. keine EU-only-Fehlbehauptung beim Standard-Workers-Modell,
3. reale ULC-Neon-Produktionsressource in EU / Frankfurt,
4. relevante TLS-/Verschlüsselungsnachweise,
5. gültige Cloudflare- und Databricks/Neon-DPA-/Vertragsreferenzen,
6. aktuelle Subprozessorenlage,
7. vollständiges reales Datenfluss-/Telemetry-Inventar,
8. Evidence-Freshness.

Fehlt ein Nachweis oder widerspricht die reale Konfiguration dem Zielvertrag, bleibt M5-G fail-closed `open`.

## Nicht gewählte Variante B

Cloudflare Regional Services EU plus gegebenenfalls Customer Metadata Boundary EU bleibt eine spätere Option, ist für ULC v0.1 aber nicht der gewählte Default. Eine Aktivierung wäre kosten-/vertragsrelevant und benötigt weiterhin eine separate ausdrückliche Freigabe.

Falls später eine rechtliche, vertragliche oder Betreiberanforderung EU-only-TLS-Terminierung/Worker-Ausführung verlangt, muss diese Entscheidung neu geöffnet werden.

## Nächster sicherer Evidence-Slice

Sobald reale ULC-Produktionsressourcen ausdrücklich freigegeben und vorhanden sind, wird ein kleiner **read-only ULC Provider Evidence Consumer** vorbereitet. Er erzeugt oder ändert keine Providerressourcen und bewertet `dataRegion`, `dpa`, `encryption` und `subprocessors` getrennt und fail-closed.