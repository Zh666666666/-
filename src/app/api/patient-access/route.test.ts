import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { actionRequest, asUser, configureTestEnvironment, recordInput } from "./test-support";

configureTestEnvironment();
const unexpected = async (..._args: unknown[]): Promise<unknown> => { throw new Error("Unexpected database call"); };
const db = {
  gatewayCredential: { updateMany: async () => ({ count: 0 }) },
  authAccount: { findUnique: unexpected },
  profile: { findUnique: unexpected, findFirst: unexpected, findMany: unexpected, updateMany: unexpected },
  patient: { findUnique: unexpected, findFirst: unexpected, findMany: unexpected, update: unexpected, updateMany: unexpected },
  patientInvitation: { findUnique: unexpected, findMany: unexpected, updateMany: unexpected, create: unexpected },
  patientAccessAudit: { findMany: unexpected, create: unexpected },
  $transaction: async (work: (transaction: unknown) => Promise<unknown>, options: unknown): Promise<unknown> => {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    return work(db);
  },
};
Object.assign(globalThis, { prisma: db as unknown as PrismaClient });

test("patient routes enforce production scope and transactional ownership", async (t) => {
  const accessRoute = await import("./route");
  const recordRoute = await import("../patients/[id]/route");
  const listRoute = await import("../patients/route");
  function login(role: "nurse" | "patient", patientId: string | null, managed: string[] = []) {
    t.mock.method(db.authAccount, "findUnique", async () => ({ role, status: "ACTIVE", updatedAt: new Date(0) }));
    t.mock.method(db.profile, "findUnique", async () => ({ id: "profile-a", userId: "user-a", role, patientId }));
    t.mock.method(db.patient, "findMany", async () => managed.map((id) => ({ id })));
  }
  for (const role of ["family", "nurse"] as const) {
    await t.test(`${role} cannot read or edit another patient's record`, async () => {
      login(role === "family" ? "patient" : "nurse", role === "family" ? "patient-a" : null, ["patient-a"]);
      const context = { params: Promise.resolve({ id: "patient-b" }) };
      assert.equal((await asUser(role, "user-a", () => recordRoute.GET(new Request("http://localhost"), context))).status, 403);
      assert.equal((await asUser(role, "user-a", () => recordRoute.PUT(actionRequest("unused", recordInput), context))).status, 403);
      t.mock.restoreAll();
    });
  }
  await t.test("stale nurse context cannot create an invitation after release", async () => {
    login("nurse", null, ["patient-a"]);
    t.mock.method(db.patient, "findUnique", async () => ({ id: "patient-a", primaryNurseUserId: "nurse-b" }));
    assert.equal((await asUser("nurse", "user-a", () => accessRoute.POST(actionRequest("CREATE_INVITE", { patientId: "patient-a" })))).status, 409);
    t.mock.restoreAll();
  });
  await t.test("stale nurse context cannot revoke a family after handoff", async () => {
    login("nurse", null, ["patient-a"]);
    t.mock.method(db.profile, "findFirst", async () => ({ id: "linked-profile", userId: "family-a" }));
    t.mock.method(db.patient, "findUnique", async () => ({ id: "patient-a", primaryNurseUserId: "nurse-b" }));
    assert.equal((await asUser("nurse", "user-a", () => accessRoute.POST(actionRequest("NURSE_REVOKE", { patientId: "patient-a", profileId: "linked-profile" })))).status, 409);
    t.mock.restoreAll();
  });
  await t.test("family unlink rechecks nurse ownership inside the transaction", async () => {
    login("patient", "patient-a");
    t.mock.method(db.patient, "findUnique", async () => ({ primaryNurseUserId: "nurse-b" }));
    assert.equal((await asUser("family", "user-a", () => accessRoute.POST(actionRequest("FAMILY_UNLINK")))).status, 409);
    t.mock.restoreAll();
  });
  await t.test("stale family and nurse scopes cannot write or audit a record", async () => {
    for (const role of ["family", "nurse"] as const) {
      login(role === "family" ? "patient" : "nurse", role === "family" ? "patient-a" : null, ["patient-a"]);
      t.mock.method(db.patient, "findFirst", async (args: unknown) => {
        assert.deepEqual(args, { where: { id: "patient-a", ...(role === "nurse"
          ? { primaryNurseUserId: "user-a" } : { profiles: { some: { userId: "user-a", role: "patient" } } }) } });
        return null;
      });
      assert.equal((await asUser(role, "user-a", () => recordRoute.PUT(actionRequest("unused", recordInput), { params: Promise.resolve({ id: "patient-a" }) }))).status, 409);
      t.mock.restoreAll();
    }
  });
  await t.test("serialization failures are returned as conflicts", async () => {
    login("patient", "patient-a");
    t.mock.method(db, "$transaction", async () => { throw Object.assign(new Error("conflict"), { code: "P2034" }); });
    assert.equal((await asUser("family", "user-a", () => accessRoute.POST(actionRequest("FAMILY_UNLINK")))).status, 409);
    assert.equal((await asUser("family", "user-a", () => recordRoute.PUT(actionRequest("unused", recordInput), { params: Promise.resolve({ id: "patient-a" }) }))).status, 409);
    t.mock.restoreAll();
  });
  await t.test("invitation reads report expiration without writing any tenant's invitations", async () => {
    login("nurse", null);
    t.mock.method(db.patientInvitation, "findMany", async (args: unknown) => {
      assert.equal((args as { where: { createdByUserId: string } }).where.createdByUserId, "user-a");
      return [{ id: "expired", status: "PENDING", expiresAt: new Date(0), createdAt: new Date(0), acceptedAt: null }];
    });
    const response = await asUser("nurse", "user-a", () => accessRoute.GET(new Request("http://localhost/api/patient-access")));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).invitations[0].status, "EXPIRED");
    t.mock.restoreAll();
  });
  await t.test("unauthenticated patient list fails closed", async () => {
    t.mock.method(db.authAccount, "findUnique", async () => null);
    assert.equal((await asUser("family", "unknown", () => listRoute.GET())).status, 401);
    t.mock.restoreAll();
  });
  await t.test("demo missing record does not disclose the first seed patient", async () => {
    process.env.APP_MODE = "demo";
    try {
      const context = { params: Promise.resolve({ id: "missing" }) };
      assert.equal((await asUser("family", "user-a", () => recordRoute.GET(new Request("http://localhost"), context))).status, 404);
      assert.equal((await asUser("family", "user-a", () => recordRoute.PUT(actionRequest("unused", recordInput), context))).status, 404);
    } finally { process.env.APP_MODE = "production"; }
  });
});
