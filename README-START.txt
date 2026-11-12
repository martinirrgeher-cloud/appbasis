ULC Linz – Entwicklungsagent: Handy-First (Codex Cloud)

STANDARD OHNE PC UND OHNE ZUSAETZLICHEN API-KEY
=================================================

1. Im Handy-Browser https://chatgpt.com/ oeffnen.
2. Codex / Work in > Cloud waehlen und eine Cloud-Umgebung fuer das
   GitHub-Repository martinirrgeher-cloud/appbasis einrichten.
   Die Cloud-Umgebung laesst sich auch im Browser (Desktopwebsite)
   anlegen und danach ueber die ChatGPT-App verwenden.
3. In GitHub ein neues Issue mit der Vorlage
   "ULC Cloud – Entwicklungspaket" anlegen.
4. Codex Cloud am Handy oeffnen, den Startauftrag aus
   docs/ulc-autodev-cloud.md mit der Issue-Nummer senden.
5. Codex arbeitet in der Cloud. Du pruefst danach Tests, Draft-PR
   und Handy-Abnahme. Keine Merges oder Deployments ohne Freigabe.

WICHTIG: Die kostenlose Variante startet Folgeauftraege nicht automatisch.
GitHub Actions prueft PRs; GitHub-Issues starten Codex Cloud nicht selbst.
Codex Cloud nutzt die im ChatGPT-Tarif verfuegbaren Nutzungslimits.

OPTIONALER WINDOWS-RUNNER
=========================
Falls irgendwann ein PC mit dauerhafter Anmeldung zur Verfuegung steht,
ist weiterhin ein optionaler lokaler Agent im Paket enthalten.
Dafuer gelten die PowerShell-Anweisungen aus docs/ulc-autodev.md.
Er ist KEINE Voraussetzung fuer den Handy-Betrieb.

Vollstaendige Handy-Anleitung: docs/ulc-autodev-cloud.md
