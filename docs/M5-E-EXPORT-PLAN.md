# M5-E – ULC Datenexport-Plan

Stand: 2026-08-17

## Zweck

Dieser Plan konkretisiert das M5-Pflichtkriterium **Datenexport** für die erste reale Ziel-App **ULC Linz**.

Er ist Policy-/Acceptance-Vorbereitung. Er implementiert noch keinen Export-Endpunkt, liest keine Produktivdaten, erzeugt keine Exportdatei und setzt `dataExport` nicht auf `verified`. M5 bleibt all-required und fail-closed.

## Bestätigte Betreiberentscheidung

Für M5 v0.1 gilt:

- **JSON** ist das kanonische vollständige Exportformat.
- **CSV** wird ergänzend für tabellarische Daten angeboten.
- Self-/Managed-Export darf nur Daten der zulässigen eigenen bzw. explizit verwalteten Person enthalten.
- Organisations-Export ist ein separater privilegierter Pfad und nur für berechtigte Administratoren des eigenen Vereins zulässig.
- Cross-Organization-Export ist immer deny-by-default.

## Sicherheitsgrenze

Der Export ist eine Leseoperation mit erhöhtem Datenschutzrisiko. Deshalb gelten mindestens folgende Grenzen:

1. Die aktuelle Identity muss Application Access besitzen; eine offene Passwortwechselpflicht blockiert den Export.
2. Rollen-, Capability-, Organisations- und `self`/`managed`-Grenzen werden serverseitig geprüft.
3. Die angefragte Organisation wird aus dem autorisierten Ressourcenkontext gebunden; ein frei übermittelter Fremdverein darf keinen Zugriff eröffnen.
4. Ein Self-Export darf ausschließlich die eigene explizite Personenverknüpfung auflösen.
5. Ein Managed-Export darf ausschließlich explizit verknüpfte verwaltete Personen auflösen.
6. Ein Organisations-Export darf nur über den kanonischen ULC-Adminpfad des eigenen Vereins erfolgen.
7. Fehlende Membership, unbekannte Rolle/Capability, inkonsistente Scope-Daten oder Resolverfehler bleiben fail-closed.
8. Secrets, Session-Tokens, Passwort-/Credential-Material, Provider-Credentials und interne technische Schlüssel werden nie exportiert.
9. Exportereignisse werden auditiert, der exportierte sensible Inhalt selbst aber nicht in das Audit kopiert.
10. Ein Export darf keine Daten aus einer anderen App-, Preview- oder Organisationseinheit mischen.

## Kanonischer JSON-Vertrag

Der vollständige Export erhält einen stabilen Envelope. Der endgültige Feldumfang der Fachdatensätze wird erst mit realen ULC-Fachmodulen gebunden; der Envelope selbst soll mindestens enthalten:

```json
{
  "schemaVersion": 1,
  "appId": "ulc-linz",
  "generatedAt": "<ISO-8601 UTC>",
  "organizationId": "<authorized organization>",
  "scope": "self | managed | organization",
  "subjectId": "<self/managed subject or null>",
  "datasets": {}
}
```

### Regeln

- `appId` muss exakt `ulc-linz` sein.
- `generatedAt` ist Evidence-/Output-Metadatum und keine Berechtigungsquelle.
- `organizationId` muss mit der serverseitig autorisierten Organisation übereinstimmen.
- `subjectId` ist bei `self`/`managed` verpflichtend und bei `organization` `null`.
- `datasets` enthält nur tatsächlich vorhandene ULC-Datenklassen.
- Neue Fachmodule dürfen nicht stillschweigend im Export fehlen; jede neue personenbezogene Datenklasse braucht eine explizite Exportentscheidung.
- Interne DB-IDs dürfen nur enthalten sein, wenn sie für Datenzuordnung oder Referenzkonsistenz nötig und nicht geheim sind.

## Ergänzender CSV-Vertrag

CSV ist eine Komfortdarstellung, nicht die kanonische Vollständigkeitsquelle.

- UTF-8
- eine Datei je tabellarischem Dataset
- stabile, dokumentierte Spaltenüberschriften
- gleiche Autorisierungs- und Scope-Grenze wie JSON
- keine zusätzlichen Daten, die im kanonischen JSON nicht zulässig wären
- komplexe/nicht-tabellarische Strukturen bleiben im JSON und werden nicht verlustbehaftet in CSV erzwungen

## Geplanter Datenklassenumfang

Sobald die jeweiligen Fachmodule real vorhanden sind, muss M5-E mindestens prüfen:

1. Mitglieds-/Kontaktstammdaten
2. operative Trainings-/Teilnahmedaten
3. besonders sensible Zusatzdaten, sofern in v0.1 tatsächlich vorhanden
4. Medien-Metadaten bzw. zulässige Datei-Referenzen, sofern Medien real verwendet werden
5. fachlich relevante Beziehungen, die zum Verständnis des exportierten Datensatzes notwendig sind

Audit-/Security-Logs, Backupinhalte und Provider-Metadaten sind keine normale Fachdatenausgabe und benötigen eine eigene explizite Berechtigung, falls sie später exportierbar werden sollen.

## Self-/Managed-Acceptance

### Self

- nur aktive zulässige Identity
- explizite `self`-Relation muss bestehen
- fremde `subjectId` wird abgewiesen
- Cross-Organization-Versuch wird abgewiesen
- fehlende oder mehrdeutige Self-Verknüpfung bleibt fail-closed

### Managed

- nur Rolle/Capability mit zulässigem Managed-Zugriff
- explizite `managed`-Relation muss zur konkreten Zielperson bestehen
- nicht verknüpfte Person wird abgewiesen
- Verknüpfung in anderer Organisation wird nicht akzeptiert
- ein Parent-/Managed-Export darf keine weiteren Kinder/Personen des Vereins enthalten

## Organisations-Export-Acceptance

- ausschließlich kanonische ULC-Adminrolle
- aktive Membership im exakt angefragten Verein
- keine globale oder Cross-Organization-Sonderrolle
- Export enthält ausschließlich Daten des autorisierten Vereins
- Scope und Filter werden serverseitig aufgebaut; Clientfilter dürfen die Organisationsgrenze nicht erweitern
- unbekannte oder nicht exportklassifizierte Datenklassen halten den Vollständigkeitsnachweis offen

## Audit-Anforderungen

Jeder erfolgreiche privilegierte Export protokolliert mindestens:

- Actor/Principal
- Organisation
- Scope (`self`, `managed`, `organization`)
- Zielperson bei Managed/Self, soweit für Audit nötig
- Zeitpunkt
- Export-Schema-Version
- Ergebnisstatus

Nicht in das Audit gehören:

- vollständiger Exportinhalt
- Credentials/Secrets
- Session-Tokens
- sensible Nutzdaten als Kopie

Fehlgeschlagene bzw. verweigerte privilegierte Exportversuche sollen als Security-Ereignis nachvollziehbar sein, ohne unnötige personenbezogene Inhalte zu loggen.

## Fail-closed-Fälle

M5-E bleibt `open` oder der konkrete Export wird verweigert, wenn:

- die reale ULC-Runtime/Identity nicht eindeutig bestimmt ist
- Membership oder Organisation fehlt bzw. nicht aktiv ist
- Rollen-/Capability-Zustand inkonsistent ist
- Self-/Managed-Relation fehlt oder mehrdeutig ist
- eine angeforderte Datenklasse keine bestätigte Exportklassifizierung besitzt
- der Export Daten anderer Organisationen enthalten könnte
- Secrets/Credentials nicht sicher ausgeschlossen werden können
- ein Teilfehler einen scheinbar vollständigen Export erzeugen würde
- Audit des privilegierten Vorgangs nicht zuverlässig möglich ist

## Technische Reihenfolge

1. M5-B Rollen-/Scope-Grenze als Runtime-Vertrag stabilisieren.
2. Reale ULC-Datenklassen aus den tatsächlich vorhandenen Modulen inventarisieren.
3. App-spezifischen Export-Consumer auf bestehende Identity-/Permission-/Audit-Verträge verdrahten.
4. JSON-Envelope und Dataset-Serializer implementieren; CSV nur als ergänzende Darstellung derselben autorisierten Daten.
5. Positive und negative Tests für Self, Managed, Admin, Cross-Org, fehlende Relation, unbekannte Datenklasse und Teilfehler ergänzen.
6. Secret-/Credential-Negativtest und Audit-Acceptance ergänzen.
7. Factory-Evidenz erst setzen, wenn der reale ULC-Consumer die vollständige Acceptance erfüllt.
8. Vollständige Exact-Head-CI und ChatGPT-Diff-/Architektur-/Security-Prüfung.
9. Finalen Codex-Review gemäß aktueller Sammelstrategie später nachholen; bis dahin kein Merge final-review-pflichtiger technischer Consumer.

## Produktionsgrenze

Dieser Plan autorisiert keine produktive Datenabfrage, keinen Export aus bestehenden ULC-Produktivdaten, keine Providerressource und keine Produktionsfreigabe.
