import { describe, expect, it } from "vitest";

import {
  ATHLETE_CAPABILITIES,
  MasterdataValidationError,
  createAthlete,
  createAthleteGroupMembership,
  createTrainer,
  createTrainerGroupMembership,
  createTrainingGroup,
  updateAthlete,
  updateTrainer,
  updateTrainingGroup,
} from "../src";

const context = Object.freeze({
  id: "entity-1",
  organizationId: "ulc-linz",
});

describe("Stammdaten domain contract", () => {
  it("exports the canonical athletes view/edit capabilities", () => {
    expect(ATHLETE_CAPABILITIES).toEqual({
      edit: "athletes:edit",
      view: "athletes:view",
    });
  });

  it("normalizes a training group without leaking UI-only module settings into the foundation", () => {
    expect(
      createTrainingGroup(
        {
          name: "  U14  ",
          shortName: " U14 ",
          description: " Nachwuchsgruppe ",
        },
        context,
      ),
    ).toEqual({
      id: "entity-1",
      organizationId: "ulc-linz",
      name: "U14",
      shortName: "U14",
      description: "Nachwuchsgruppe",
      isActive: true,
      sortOrder: 100,
    });
  });

  it("normalizes athlete and trainer master data", () => {
    expect(
      createAthlete(
        {
          firstName: " Emilia ",
          lastName: " Muster ",
          birthYear: 2017,
          notes: " U12 ",
        },
        context,
      ),
    ).toMatchObject({
      firstName: "Emilia",
      lastName: "Muster",
      birthYear: 2017,
      notes: "U12",
      isActive: true,
    });

    expect(
      createTrainer(
        {
          firstName: " Max ",
          lastName: " Trainer ",
          phone: " +43 660 123 ",
          email: " trainer@example.test ",
        },
        context,
      ),
    ).toMatchObject({
      firstName: "Max",
      lastName: "Trainer",
      phone: "+43 660 123",
      email: "trainer@example.test",
      isActive: true,
    });
  });

  it("normalizes complete replacement inputs for active Stammdaten updates", () => {
    expect(
      updateAthlete(
        {
          firstName: " Anna ",
          lastName: " Beispiel ",
          birthYear: null,
          notes: " neu ",
        },
        context,
      ),
    ).toEqual({
      id: "entity-1",
      organizationId: "ulc-linz",
      firstName: "Anna",
      lastName: "Beispiel",
      birthYear: null,
      notes: "neu",
      isActive: true,
    });

    expect(
      updateTrainer(
        {
          firstName: " Max ",
          lastName: " Trainer ",
          phone: null,
          email: " max@example.test ",
          notes: null,
        },
        context,
      ),
    ).toMatchObject({
      firstName: "Max",
      lastName: "Trainer",
      phone: null,
      email: "max@example.test",
      notes: null,
      isActive: true,
    });

    expect(
      updateTrainingGroup(
        {
          name: " U16 ",
          shortName: null,
          description: " Sprint ",
          sortOrder: 20,
        },
        context,
      ),
    ).toMatchObject({
      name: "U16",
      shortName: null,
      description: "Sprint",
      sortOrder: 20,
      isActive: true,
    });
  });

  it("keeps athlete group membership history explicit", () => {
    expect(
      createAthleteGroupMembership({
        organizationId: "ulc-linz",
        athleteId: "athlete-1",
        groupId: "group-1",
        startedOn: "2026-09-01",
        endedOn: "2027-06-30",
      }),
    ).toEqual({
      organizationId: "ulc-linz",
      athleteId: "athlete-1",
      groupId: "group-1",
      startedOn: "2026-09-01",
      endedOn: "2027-06-30",
    });

    expect(() =>
      createAthleteGroupMembership({
        organizationId: "ulc-linz",
        athleteId: "athlete-1",
        groupId: "group-1",
        startedOn: "2026-09-02",
        endedOn: "2026-09-01",
      }),
    ).toThrow(MasterdataValidationError);
  });

  it("defines trainer-to-group assignment independently from user accounts", () => {
    expect(
      createTrainerGroupMembership({
        organizationId: "ulc-linz",
        trainerId: "trainer-1",
        groupId: "group-1",
      }),
    ).toEqual({
      organizationId: "ulc-linz",
      trainerId: "trainer-1",
      groupId: "group-1",
    });
  });

  it("fails closed on invalid required fields and ranges", () => {
    expect(() =>
      createAthlete(
        {
          firstName: "",
          lastName: "Muster",
        },
        context,
      ),
    ).toThrow(MasterdataValidationError);

    expect(() =>
      createAthlete(
        {
          firstName: "Emilia",
          lastName: "Muster",
          birthYear: 2200,
        },
        context,
      ),
    ).toThrow(MasterdataValidationError);

    expect(() =>
      createTrainingGroup(
        {
          name: "A",
        },
        context,
      ),
    ).toThrow(MasterdataValidationError);
  });
});
