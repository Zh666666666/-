import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
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
    await prisma.patientAccessAudit.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { patientId: { in: patientIds } }] } });
    await prisma.patientInvitation.deleteMany({ where: { createdByUserId: { in: userIds } } });
    await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.authAccount.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
