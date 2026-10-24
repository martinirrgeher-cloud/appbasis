import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
  ATTENDANCE_PREVIEW_GROUP_NAME,
  runUlcAttendancePreviewAcceptance,
} from "./ulc-linz-attendance-preview-acceptance.mjs";

test("attendance preview acceptance provisions an athlete login and proves registration is independent from actual attendance", async () => {
  const password = "protected-preview-password";
  const sessionDate = "2026-10-24";
  const calls = [];
  let temporaryPassword = null;
  let groupCreated = false;
  let athleteCreated = false;
  let membershipCreated = false;
  let athleteProvisioned = false;
  let passwordChanged = false;
  let intention = "unknown";
  let registrationRevision = null;
  let actualStatus = "open";
  let sessionRevision = null;

  const json = (payload, status = 200, headers = {}) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
    });

  const masterdata = () => ({
    trainingGroups: groupCreated
      ? [{
          id: "group-1",
          name: ATTENDANCE_PREVIEW_GROUP_NAME,
          shortName: "PREVIEW",
          description: "Stabiler Preview-Testfall für Selbstanmeldung",
          attendanceMode: "self_registration",
          sortOrder: 9998,
          isActive: true,
        }]
      : [],
    athletes: athleteCreated
      ? [{
          id: "athlete-1",
          firstName: "Preview",
          lastName: "Athlet",
          birthYear: 2010,
          notes: null,
          isActive: true,
        }]
      : [],
    athleteGroupMemberships: membershipCreated
      ? [{
          athleteId: "athlete-1",
          groupId: "group-1",
          startedOn: sessionDate,
          endedOn: null,
        }]
      : [],
  });

  const snapshot = () => ({
    group: {
      id: "group-1",
      name: ATTENDANCE_PREVIEW_GROUP_NAME,
      shortName: "PREVIEW",
      attendanceMode: "self_registration",
    },
    sessionDate,
    session:
      sessionRevision === null
        ? null
        : {
            id: "session-1",
            revision: String(sessionRevision),
            state: "scheduled",
            note: null,
          },
    participants: [{
      athleteId: "athlete-1",
      firstName: "Preview",
      lastName: "Athlet",
      birthYear: 2010,
      intention,
      registrationRevision,
      status: actualStatus,
    }],
  });

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    const body =
      typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });

    if (method === "POST" && url.pathname === "/api/auth/sign-in") {
      if (body.username === "preview.admin") {
        return json(
          { access: "full", identity: { username: "preview.admin" } },
          200,
          { "set-cookie": "session=admin; Path=/; HttpOnly" },
        );
      }
      assert.equal(body.username, ATTENDANCE_PREVIEW_ATHLETE_USERNAME);
      if (!athleteProvisioned) {
        return json({ error: { code: "INVALID_CREDENTIALS" } }, 401);
      }
      if (!passwordChanged && body.password === temporaryPassword) {
        return json(
          {
            access: "password-change-required",
            identity: {
              username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
              mustChangePassword: true,
            },
          },
          200,
          { "set-cookie": "session=athlete-temp; Path=/; HttpOnly" },
        );
      }
      if (passwordChanged && body.password === password) {
        return json(
          {
            access: "full",
            identity: {
              username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
              mustChangePassword: false,
            },
          },
          200,
          { "set-cookie": "session=athlete; Path=/; HttpOnly" },
        );
      }
      return json({ error: { code: "INVALID_CREDENTIALS" } }, 401);
    }

    if (method === "GET" && url.pathname === "/api/modules/athletes/masterdata") {
      return json({ masterdata: masterdata() });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/athletes/masterdata/training-groups"
    ) {
      assert.equal(body.attendanceMode, "self_registration");
      groupCreated = true;
      return json({ trainingGroup: masterdata().trainingGroups[0] }, 201);
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/athletes/masterdata/athletes"
    ) {
      athleteCreated = true;
      return json({ athlete: masterdata().athletes[0] }, 201);
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/athletes/masterdata/athlete-group-memberships"
    ) {
      assert.equal(body.athleteId, "athlete-1");
      assert.equal(body.groupId, "group-1");
      membershipCreated = true;
      return json({ membership: masterdata().athleteGroupMemberships[0] }, 201);
    }

    if (method === "POST" && url.pathname === "/api/admin/athlete-users") {
      assert.equal(body.athleteId, "athlete-1");
      assert.equal(body.username, ATTENDANCE_PREVIEW_ATHLETE_USERNAME);
      temporaryPassword = body.temporaryPassword;
      athleteProvisioned = true;
      return json({ athleteUser: { identityId: "identity-athlete-1" } }, 201);
    }

    if (
      method === "POST" &&
      url.pathname === "/api/auth/change-required-password"
    ) {
      assert.equal(body.currentPassword, temporaryPassword);
      assert.equal(body.newPassword, password);
      passwordChanged = true;
      return json({
        access: "full",
        identity: {
          username: ATTENDANCE_PREVIEW_ATHLETE_USERNAME,
          mustChangePassword: false,
        },
      });
    }

    if (
      method === "GET" &&
      url.pathname === "/api/modules/kindertraining/registration"
    ) {
      return json({
        sessionDate,
        options: [{
          group: {
            id: "group-1",
            name: ATTENDANCE_PREVIEW_GROUP_NAME,
            shortName: "PREVIEW",
          },
          sessionDate,
          sessionState: sessionRevision === null ? null : "scheduled",
          intention,
          revision: registrationRevision,
        }],
      });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/kindertraining/registration"
    ) {
      assert.deepEqual(Object.keys(body).sort(), [
        "expectedRevision",
        "groupId",
        "intention",
        "sessionDate",
      ]);
      assert.equal(body.groupId, "group-1");
      assert.equal(body.expectedRevision, registrationRevision);
      intention = body.intention;
      registrationRevision = (registrationRevision ?? 0) + 1;
      sessionRevision ??= 1;
      return json({
        option: {
          group: {
            id: "group-1",
            name: ATTENDANCE_PREVIEW_GROUP_NAME,
            shortName: "PREVIEW",
          },
          sessionDate,
          sessionState: "scheduled",
          intention,
          revision: registrationRevision,
        },
      });
    }

    if (
      method === "GET" &&
      url.pathname === "/api/modules/kindertraining/session"
    ) {
      return json({ snapshot: snapshot() });
    }

    if (
      method === "POST" &&
      url.pathname === "/api/modules/kindertraining/session"
    ) {
      assert.equal(body.groupId, "group-1");
      assert.equal(body.attendance[0].athleteId, "athlete-1");
      actualStatus = body.attendance[0].status;
      sessionRevision = (sessionRevision ?? 0) + 1;
      return json({ snapshot: snapshot() });
    }

    throw new Error(
      "Unexpected attendance acceptance request: " +
        method + " " + url.pathname,
    );
  };

  const result = await runUlcAttendancePreviewAcceptance(
    {
      baseURL: "https://appbasis-ulc-linz.example.workers.dev",
      adminUsername: "preview.admin",
      password,
    },
    {
      fetchImpl,
      randomUUID: () => "01234567-89ab-cdef-0123-456789abcdef",
      now: () => new Date("2026-10-24T12:00:00.000Z"),
    },
  );

  assert.equal(result.status, "ok");
  assert.equal(result.athleteUsername, ATTENDANCE_PREVIEW_ATHLETE_USERNAME);
  assert.equal(result.groupName, ATTENDANCE_PREVIEW_GROUP_NAME);
  assert.equal(result.sessionDate, sessionDate);
  assert.equal(intention, "attending");
  assert.equal(actualStatus, "open");
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/admin/athlete-users",
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/auth/change-required-password",
    ),
  );
});

test("attendance preview acceptance never sends a client-owned athleteId to self-registration", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(
      new URL("./ulc-linz-attendance-preview-acceptance.mjs", import.meta.url),
      "utf8",
    ),
  );
  const registrationBody = source.slice(
    source.indexOf('"/api/modules/kindertraining/registration",'),
    source.indexOf("const attendingOption"),
  );
  assert.doesNotMatch(registrationBody, /athleteIds*:/);
  assert.match(source, /athleteId: athlete\.id/);
});
