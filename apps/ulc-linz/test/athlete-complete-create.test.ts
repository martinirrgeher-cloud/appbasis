import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

const runtime = readFileSync(new URL("../worker/postgres.ts", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

describe("ULC: full one-step athlete creation", () => {
  it("collects core data, group, start date and multiple contacts before creating", () => {
    for (const id of [
      "athlete-first-name", "athlete-last-name", "athlete-birth-year", "athlete-notes",
      "athlete-create-group", "athlete-create-started-on",
      "athlete-create-contact-add", "athlete-create-contacts",
      "athlete-create-message",
    ]) expect(ULC_LINZ_APP_HTML).toContain('id="' + id + '"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("function addMasterdataNewAthleteContact()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("function readMasterdataNewAthleteContacts()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("host.children.length >= 6");
    expect(ULC_LINZ_APP_SCRIPT).toContain('field("Name", "contactName"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('field("Telefon", "phone"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"isEmergency"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("athleteCreateExtras.disabled = athleteEditing");
  });

  it("persists full creation using one permission-checked database transaction", () => {
    expect(endpoint).toContain('if (route === "athletes/create-complete")');
    expect(endpoint).toContain('authorizeAthletesRequest(request, runtime, url, "edit")');
    expect(endpoint).toContain("createAthleteComplete(");
    expect(endpoint).toContain('"groupId", "startedOn", "contacts"');
    expect(endpoint).toContain("body.contacts.length > 6");
    expect(runtime).toContain("createAthleteComplete(");
    expect(runtime).toContain("return applicationSql.begin(async (transaction) => {");
    expect(runtime).toContain("new PostgresAthleteMasterdataRepository(transaction)");
    expect(runtime).toContain("await repository.createAthlete(organizationId, input.athlete)");
    expect(runtime).toContain("await repository.createAthleteGroupMembership(organizationId");
    expect(runtime).toContain("await repository.createAthleteContact(");
    expect(runtime).toContain('throw new Error("Athlete contact creation failed: rolling back")');
  });

  it("preserves accepted edit route and returns new U12 athlete with the chosen group", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('source: "u12"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("groupId: context.groupId, startedOn: context.startedOn");
    expect(ULC_LINZ_APP_SCRIPT).toContain("elements.athleteCreateGroup.disabled = fromU12;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("elements.athleteCreateStartedOn.disabled = fromU12;");
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/api/modules/athletes/masterdata/athletes/create-complete"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("u12Snapshot = null;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("await loadU12Attendance();");
    expect(ULC_LINZ_APP_SCRIPT).toContain("document.body.append(elements.athleteOverlay);");
    expect(ULC_LINZ_APP_SCRIPT).toContain("parent.insertBefore(");
    expect(ULC_LINZ_APP_SCRIPT).toContain("u12Ui.addAthlete?.focus();");
    const create = ULC_LINZ_APP_SCRIPT.slice(
      ULC_LINZ_APP_SCRIPT.indexOf("async function createMasterdataAthlete(event)"),
      ULC_LINZ_APP_SCRIPT.indexOf("async function createMasterdataTrainer(event)"),
    );
    expect(create).not.toContain('showAppSection("u12")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('encodeURIComponent(editId) + "/update"');
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });
});
