import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { actionRequest, asUser, configureTestEnvironment, recordInput } from "./test-support";

// Requires a migrated, disposable local database. Never fall back to DATABASE_URL.
const databaseUrl = process.env.PATIENT_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Patient integration tests require a loopback database");
  assert.match(url.pathname, /^\/tka_patient_test(?:_[a-zA-Z0-9]+)?$/, "Use a dedicated tka_patient_test database");
  assert.equal(url.search, "", "Database URL overrides are not permitted");
  configureTestEnvironment(databaseUrl);
}

test("PostgreSQL patient ownership, records, isolation and concurrent actions", { skip: !databaseUrl && "Set PATIENT_TEST_DATABASE_URL to a migrated local tka_patient_test database" }, async (t) => {
  const { prisma } = await import("@/lib/prisma");
  const access = await import("./route");
  const records = await import("../patients/[id]/route");
  const patients = await import("../patients/route");
  const prefix = `patient-test-${randomUUID()}`;
  const patientIds: string[] = [];
  const userIds: string[] = [];
  const deviceIds: string[] = [];
  const registrationEmails: string[] = [];
  async function user(role: "nurse" | "patient", patientId: string | null = null) {
    const id = `${prefix}-${userIds.length}`;
    userIds.push(id);
    await prisma.authAccount.create({ data: { id, email: `${id}@example.test`, passwordHash: "not-a-login-password", role, verifiedAt: new Date() } });
    await prisma.profile.create({ data: { userId: id, name: id, role, patientId } });
    return id;
  }
  async function patient(primaryNurseUserId: string | null = null) {
    const created = await prisma.patient.create({ data: {
      medicalRecordNo: `${prefix}-${patientIds.length}`, name: "Test Patient", age: 60,
      dateOfBirth: new Date("1966-01-01"), surgeryDate: new Date("2026-01-01"), surgicalSide: "LEFT", primaryNurseUserId,
    } });
    patientIds.push(created.id);
    return created.id;
  }
  const post = (role: "family" | "nurse", id: string, action: string, values = {}) =>
    asUser(role, id, () => access.POST(actionRequest(action, values)));
  async function invite(nurse: string, patientId?: string) {
    const response = await post("nurse", nurse, "CREATE_INVITE", patientId ? { patientId } : {});
    assert.equal(response.status, 201);
    return response.json() as Promise<{ code: string; invitationId: string }>;
  }
  const getRecord = (role: "family" | "nurse", userId: string, id: string) =>
    asUser(role, userId, () => records.GET(new Request("http://localhost"), { params: Promise.resolve({ id }) }));
  try {
    const nurseA = await user("nurse");
    const nurseB = await user("nurse");
    const patientA = await patient(nurseA);
    const patientB = await patient(nurseB);
    const familyA = await user("patient", patientA);
    const familyB = await user("patient", patientB);

    await t.test("email verification creates only a family account and the invitation binds it to one nurse", async (context) => {
      const send = await import("../auth/register/send-code/route");
      const complete = await import("../auth/register/complete/route");
      const email = `${prefix}-registration@example.test`;
      registrationEmails.push(email);
      const priorKey = process.env.RESEND_API_KEY;
      const priorFrom = process.env.EMAIL_FROM;
      process.env.RESEND_API_KEY = "re_synthetic-test-only";
      process.env.EMAIL_FROM = "test@example.test";
      let code = "";
      const delivery = context.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
        assert.equal(String(url), "https://api.resend.com/emails");
        const message = JSON.parse(String(init?.body));
        assert.deepEqual(message.to, [email]);
        code = String(message.text).match(/\b\d{6}\b/)?.[0] ?? "";
        return Response.json({ id: "synthetic-mail" });
      });
      try {
        const sent = await asUser("family", familyB, () => send.POST(actionRequest("unused", { email })));
        assert.equal(sent.status, 200);
        assert.match(code, /^\d{6}$/);
        const input = { email, code, name: "Synthetic Family", password: "Synthetic-password-123", role: "nurse" };
        const created = await asUser("family", familyB, () => complete.POST(actionRequest("unused", input)));
        assert.equal(created.status, 201);
        const account = await prisma.authAccount.findUniqueOrThrow({ where: { email } });
        userIds.push(account.id);
        assert.equal(account.role, "patient");
        assert.equal((await prisma.profile.findUniqueOrThrow({ where: { userId: account.id } })).patientId, null);
        assert.equal((await asUser("family", familyB, () => complete.POST(actionRequest("unused", input)))).status, 400);
        assert.equal((await post("family", account.id, "SELF_CREATE", {
          patientName: "Synthetic Patient", age: 60, surgeryDate: "2026-01-01", surgicalSide: "LEFT", relationToPatient: "self",
        })).status, 201);
        const onboardingNurse = await user("nurse");
        const codeFromNurse = await invite(onboardingNurse);
        assert.equal((await post("family", account.id, "ACCEPT_INVITE", { code: codeFromNurse.code })).status, 200);
        const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: account.id } });
        assert.ok(profile.patientId);
        patientIds.push(profile.patientId);
        assert.equal((await getRecord("nurse", onboardingNurse, profile.patientId)).status, 200);
        assert.equal((await getRecord("nurse", nurseB, profile.patientId)).status, 403);
      } finally {
        delivery.mock.restore();
        if (priorKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = priorKey;
        if (priorFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = priorFrom;
      }
    });

    await t.test("lists and records isolate two nurses and two families", async () => {
      for (const [role, id, own, other] of [
        ["nurse", nurseA, patientA, patientB], ["nurse", nurseB, patientB, patientA],
        ["family", familyA, patientA, patientB], ["family", familyB, patientB, patientA],
      ] as const) {
        const response = await asUser(role, id, () => patients.GET());
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).map((item: { id: string }) => item.id), [own]);
        assert.equal((await getRecord(role, id, own)).status, 200);
        assert.equal((await getRecord(role, id, other)).status, 403);
        assert.equal((await asUser(role, id, () => records.PUT(actionRequest("unused", recordInput), { params: Promise.resolve({ id: other }) }))).status, 403);
      }
      assert.equal(await prisma.patientAccessAudit.count({ where: { patientId: { in: [patientA, patientB] } } }), 0);
    });

    await t.test("record writes preserve omitted birth date and audit field names only", async () => {
      const response = await asUser("family", familyA, () => records.PUT(actionRequest("unused", recordInput), { params: Promise.resolve({ id: patientA }) }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).dateOfBirth, "1966-01-01T00:00:00.000Z");
      assert.equal((await (await getRecord("nurse", nurseA, patientA)).json()).name, recordInput.name);
      const audit = await prisma.patientAccessAudit.findFirstOrThrow({ where: { patientId: patientA, action: "PATIENT_UPDATED" } });
      assert.deepEqual(audit.details, { changedFields: Object.keys(recordInput) });
    });

    await t.test("gateway issuance, hashed storage, device ownership and revocation work in PostgreSQL", async () => {
      const deviceRoute = await import("../devices/route");
      const bindingRoute = await import("../device-bindings/route");
      const credentials = await import("../gateway/credentials/route");
      const ready = await import("../gateway/ready/route");
      const json = (body: unknown, method = "POST") => new Request("http://localhost/api/test", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const serialNo = `${prefix}-sensor`;
      const registered = await asUser("family", familyA, () => deviceRoute.POST(json({ patientId: patientA, serialNo, name: "Test Sensor" })));
      assert.equal(registered.status, 200);
      const device = await registered.json();
      deviceIds.push(device.id);
      assert.equal("deviceToken" in device, false);
      const assigned = await asUser("family", familyA, () => bindingRoute.POST(json({ patientId: patientA, deviceId: device.id, placement: "THIGH" })));
      assert.equal(assigned.status, 200);
      const stolen = await asUser("family", familyB, () => bindingRoute.POST(json({ patientId: patientB, deviceId: device.id, placement: "THIGH" })));
      assert.equal(stolen.status, 409);
      assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: device.id } })).ownerPatientId, patientA);
      assert.equal((await asUser("family", familyB, () => deviceRoute.POST(json({ patientId: patientB, serialNo, name: "stolen" })))).status, 409);
      const issued = await asUser("family", familyA, () => credentials.POST(json({ patientId: patientA, label: "Test phone" })));
      assert.equal(issued.status, 201);
      const credential = await issued.json();
      assert.match(credential.token, /^tka_gw_/);
      const stored = await prisma.gatewayCredential.findUniqueOrThrow({ where: { id: credential.id } });
      assert.notEqual(stored.tokenHash, credential.token);
      const preflight = (patientId: string) => new Request(`http://localhost/api/gateway/ready?patientId=${patientId}`, { headers: { authorization: `Bearer ${credential.token}` } });
      assert.equal((await ready.GET(preflight(patientA))).status, 200);
      assert.equal((await ready.GET(preflight(patientB))).status, 403);
      const listed = await asUser("nurse", nurseA, () => credentials.GET(new Request(`http://localhost/api/gateway/credentials?patientId=${patientA}`)));
      const list = await listed.json();
      assert.equal("tokenHash" in list[0], false);
      assert.equal("token" in list[0], false);
      assert.equal((await asUser("family", familyB, () => credentials.DELETE(json({ id: credential.id, patientId: patientA }, "DELETE")))).status, 403);
      assert.equal((await asUser("family", familyA, () => credentials.DELETE(json({ id: credential.id, patientId: patientA }, "DELETE")))).status, 200);
      assert.equal((await ready.GET(preflight(patientA))).status, 401);
    });

    await t.test("operator lifecycle provisions accounts and releases only the explicitly named device", async () => {
      const email = `${prefix}-operator@example.test`;
      const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", "scripts/manage-installation.ts", ...args], {
        encoding: "utf8", timeout: 30_000,
        env: { ...process.env, TKA_NURSE_NAME: "Test Nurse", TKA_NURSE_PASSWORD: "Synthetic-test-password-2026" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const created = JSON.parse(run(["create-nurse", email, `confirm:${email}`]));
      userIds.push(created.id);
      const nurse = await prisma.authAccount.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(nurse.role, "nurse");
      assert.match(nurse.passwordHash, /^pbkdf2_sha256\$/);
      run(["disable-nurse", nurse.id, `confirm:${nurse.id}`]);
      assert.equal((await prisma.authAccount.findUniqueOrThrow({ where: { id: nurse.id } })).status, "DISABLED");
      run(["enable-nurse", nurse.id, `confirm:${nurse.id}`]);
      assert.equal((await prisma.authAccount.findUniqueOrThrow({ where: { id: nurse.id } })).status, "ACTIVE");
      assert.throws(() => run(["disable-nurse", nurseA, `confirm:${nurseA}`]));
      assert.equal((await prisma.authAccount.findUniqueOrThrow({ where: { id: nurseA } })).status, "ACTIVE");
      const deviceId = deviceIds[0];
      assert.throws(() => run(["release-device", deviceId, "confirm:wrong"]));
      assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })).ownerPatientId, patientA);
      run(["release-device", deviceId, `confirm:${deviceId}`]);
      assert.equal((await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })).ownerPatientId, null);
      assert.equal(await prisma.deviceBinding.count({ where: { deviceId, active: true } }), 0);
    });

    await t.test("history, guidance, family acknowledgement, appointments and alerts close the care loop", async () => {
      const nursing = await import("../nursing-records/route");
      const read = await import("../nursing-records/[id]/route");
      const appointments = await import("../appointments/route");
      const respond = await import("../appointments/[id]/route");
      const resolve = await import("../alerts/[id]/route");
      const dashboard = await import("../dashboard/route");
      const history = await import("../sensor-sessions/route");
      const params = (id: string) => ({ params: Promise.resolve({ id }) });
      const guidance = { patientId: patientA, nurseName: "Forged author", guidance: "Synthetic follow-up guidance", soap: { plan: "Synthetic plan" } };
      assert.equal((await asUser("family", familyA, () => nursing.POST(actionRequest("unused", guidance)))).status, 403);
      assert.equal((await asUser("nurse", nurseB, () => nursing.POST(actionRequest("unused", guidance)))).status, 403);
      const created = await asUser("nurse", nurseA, () => nursing.POST(actionRequest("unused", guidance)));
      assert.equal(created.status, 200);
      const note = await created.json();
      assert.equal(note.nurseName, nurseA);
      assert.equal(note.readAt, null);
      const snapshot = async (role: "family" | "nurse", id: string) => (await asUser(role, id, () => dashboard.GET())).json();
      assert.ok((await snapshot("family", familyA)).nursingRecords.some((item: { id: string }) => item.id === note.id));
      assert.ok(!(await snapshot("family", familyB)).nursingRecords.some((item: { id: string }) => item.id === note.id));
      const markRead = (role: "family" | "nurse", userId: string) => asUser(role, userId, () => read.PATCH(new Request("http://localhost"), params(note.id)));
      assert.equal((await markRead("nurse", nurseA)).status, 403);
      assert.equal((await markRead("family", familyB)).status, 404);
      const firstRead = await (await markRead("family", familyA)).json();
      assert.ok(firstRead.readAt);
      assert.equal((await (await markRead("family", familyA)).json()).readAt, firstRead.readAt);
      assert.equal((await snapshot("nurse", nurseA)).nursingRecords.find((item: { id: string }) => item.id === note.id).readAt, firstRead.readAt);

      const appointment = await (await asUser("family", familyA, () => appointments.POST(actionRequest("unused", {
        patientId: patientA, patientName: "Synthetic Patient", expectedTime: new Date(Date.now() + 86400_000).toISOString(), description: "Synthetic appointment",
      })))).json();
      const reply = { status: "CONFIRMED", nurseName: "Forged author", responseNote: "Synthetic confirmation" };
      const answer = (role: "family" | "nurse", id: string) => asUser(role, id, () => respond.PATCH(actionRequest("unused", reply), params(appointment.id)));
      assert.equal((await answer("family", familyA)).status, 403);
      assert.equal((await answer("nurse", nurseB)).status, 404);
      assert.equal((await answer("nurse", nurseA)).status, 200);
      const familyAppointments = await (await asUser("family", familyA, () => appointments.GET())).json();
      assert.equal(familyAppointments.find((item: { id: string }) => item.id === appointment.id).nurseName, nurseA);
      assert.equal(familyAppointments.find((item: { id: string }) => item.id === appointment.id).status, "CONFIRMED");
      assert.equal((await (await asUser("family", familyB, () => appointments.GET())).json()).length, 0);

      const alert = await prisma.alertLog.create({ data: { patientId: patientA, type: "ROM_LOW", title: "Synthetic alert", message: "Not a clinical assessment" } });
      const resolveAlert = (role: "family" | "nurse", id: string) => asUser(role, id, () => resolve.PATCH(new Request("http://localhost"), params(alert.id)));
      assert.equal((await resolveAlert("family", familyA)).status, 403);
      assert.equal((await resolveAlert("nurse", nurseB)).status, 404);
      assert.equal((await resolveAlert("nurse", nurseA)).status, 200);
      assert.equal((await snapshot("family", familyA)).alerts.find((item: { id: string }) => item.id === alert.id).status, "RESOLVED");

      const session = await prisma.sensorSession.create({ data: { patientId: patientA, status: "COMPLETED", endedAt: new Date(), summary: { synthetic: true } } });
      const listHistory = (role: "family" | "nurse", id: string, patientId: string) => asUser(role, id, () => history.GET(new Request(`http://localhost/api/sensor-sessions?patientId=${patientId}`)));
      for (const [role, id] of [["family", familyA], ["nurse", nurseA]] as const) {
        const response = await listHistory(role, id, patientA);
        assert.equal(response.status, 200);
        assert.ok((await response.json()).some((item: { id: string }) => item.id === session.id));
      }
      assert.equal((await listHistory("family", familyB, patientA)).status, 403);
      assert.equal((await listHistory("nurse", nurseB, patientA)).status, 403);
    });

    await t.test("only the current nurse may release, then the new nurse takes over", async () => {
      const pending = await invite(nurseA, patientA);
      assert.equal((await post("nurse", nurseB, "NURSE_RELEASE", { patientId: patientA })).status, 403);
      assert.equal((await post("family", familyA, "FAMILY_UNLINK")).status, 409);
      assert.equal((await post("nurse", nurseA, "NURSE_RELEASE", { patientId: patientA })).status, 200);
      assert.equal((await prisma.patientInvitation.findUniqueOrThrow({ where: { id: pending.invitationId } })).status, "REVOKED");
      assert.equal((await getRecord("nurse", nurseA, patientA)).status, 403);
      const next = await invite(nurseB);
      assert.equal((await post("family", familyA, "ACCEPT_INVITE", { code: next.code })).status, 200);
      assert.equal((await getRecord("nurse", nurseB, patientA)).status, 200);
      assert.equal((await getRecord("family", familyA, patientB)).status, 403);
    });

    await t.test("simultaneous claims consume a one-time invitation exactly once", async () => {
      const target = await patient(nurseA);
      const first = await user("patient");
      const second = await user("patient");
      const code = await invite(nurseA, target);
      const responses = await Promise.all([first, second].map((id) => post("family", id, "ACCEPT_INVITE", { code: code.code })));
      assert.equal(responses.filter((response) => response.status === 200).length, 1);
      assert.ok(responses.every((response) => [200, 400, 409].includes(response.status)));
      assert.equal(await prisma.profile.count({ where: { userId: { in: [first, second] }, patientId: target } }), 1);
      assert.equal(await prisma.patientAccessAudit.count({ where: { patientId: target, action: "INVITE_ACCEPTED" } }), 1);
    });

    await t.test("two nurses competing for one patient cannot both win", async () => {
      const target = await patient();
      const first = await user("patient", target);
      const second = await user("patient", target);
      const codes = [await invite(nurseA), await invite(nurseB)];
      const responses = await Promise.all([first, second].map((id, index) => post("family", id, "ACCEPT_INVITE", { code: codes[index].code })));
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      const winner = responses.findIndex((response) => response.status === 200);
      assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: target } })).primaryNurseUserId, [nurseA, nurseB][winner]);
      assert.equal(await prisma.patientInvitation.count({ where: { id: { in: codes.map((code) => code.invitationId) }, status: "ACCEPTED" } }), 1);
      assert.equal(await prisma.patientAccessAudit.count({ where: { patientId: target, action: "NURSE_ASSIGNED" } }), 1);
    });

    await t.test("duplicate self-create rolls back the losing patient's row and audit", async () => {
      const family = await user("patient");
      const before = await prisma.patient.count();
      const values = { patientName: "Self Patient", age: 60, surgeryDate: "2026-01-01", surgicalSide: "LEFT", relationToPatient: "self" };
      const responses = await Promise.all([post("family", family, "SELF_CREATE", values), post("family", family, "SELF_CREATE", values)]);
      const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: family } });
      if (profile.patientId) patientIds.push(profile.patientId);
      assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
      assert.equal(await prisma.patient.count(), before + 1);
      assert.equal(await prisma.patientAccessAudit.count({ where: { userId: family, action: "SELF_CREATED" } }), 1);
    });

    await t.test("unlink racing assignment cannot leave an assigned patient without its family", async () => {
      for (let index = 0; index < 6; index += 1) {
        const target = await patient();
        const family = await user("patient", target);
        const code = await invite(nurseA);
        const responses = await Promise.all([
          post("family", family, "FAMILY_UNLINK"),
          post("family", family, "ACCEPT_INVITE", { code: code.code }),
        ]);
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        const current = await prisma.patient.findUniqueOrThrow({ where: { id: target } });
        const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: family } });
        assert.ok(!current.primaryNurseUserId || profile.patientId === target);
        assert.equal(await prisma.patientAccessAudit.count({ where: { patientId: target } }), 1);
      }
    });
  } finally {
    await prisma.emailVerification.deleteMany({ where: { email: { in: registrationEmails } } });
    await prisma.device.deleteMany({ where: { id: { in: deviceIds } } });
    await prisma.patientAccessAudit.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { patientId: { in: patientIds } }] } });
    await prisma.patientInvitation.deleteMany({ where: { createdByUserId: { in: userIds } } });
    await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.authAccount.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
