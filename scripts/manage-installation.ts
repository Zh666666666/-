import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword, registrationCompletionSchema } from "../src/lib/registration-auth";

async function main() {
  const [action, id, confirmation] = process.argv.slice(2);
  if (process.env.APP_MODE !== "production" || process.env.AUTH_MODE !== "local") throw new Error("Requires explicit production/local configuration");
  if (action === "inventory") {
    console.log(JSON.stringify(await prisma.device.findMany({ select: {
      id: true, serialNo: true, model: true, firmwareVersion: true, ownerPatientId: true, status: true, lastSeenAt: true,
    } }), null, 2));
    return;
  }
  if (action === "nurses") {
    console.log(JSON.stringify(await prisma.authAccount.findMany({ where: { role: "nurse" }, select: { id: true, email: true, status: true } }), null, 2));
    return;
  }
  if (!id || confirmation !== `confirm:${id}`) throw new Error("Mutation requires an exact ID and confirm:ID argument");
  if (action === "create-nurse") {
    const input = registrationCompletionSchema.parse({ email: id, name: process.env.TKA_NURSE_NAME, password: process.env.TKA_NURSE_PASSWORD, code: "000000" });
    const passwordHash = await hashPassword(input.password);
    const account = await prisma.$transaction(async (tx) => {
      const user = await tx.authAccount.create({ data: { email: input.email, passwordHash, role: "nurse", verifiedAt: new Date() } });
      await tx.profile.create({ data: { userId: user.id, name: input.name, role: "nurse" } });
      return user;
    });
    console.log(JSON.stringify({ action, id: account.id }));
    return;
  }
  if (action === "disable-nurse" || action === "enable-nurse") {
    await prisma.$transaction(async (tx) => {
      const user = await tx.authAccount.findUnique({ where: { id } });
      if (!user || user.role !== "nurse") throw new Error("Nurse account not found");
      if (action === "disable-nurse" && await tx.patient.count({ where: { primaryNurseUserId: id } })) throw new Error("Transfer assigned patients before offboarding");
      await tx.authAccount.update({ where: { id }, data: { status: action === "disable-nurse" ? "DISABLED" : "ACTIVE" } });
      await tx.gatewayCredential.updateMany({ where: { createdBy: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.patientInvitation.updateMany({ where: { createdByUserId: id, status: "PENDING" }, data: { status: "REVOKED", revokedAt: new Date() } });
    }, { isolationLevel: "Serializable" });
    console.log(JSON.stringify({ action, id }));
    return;
  }
  if (action === "release-device") {
    const device = await prisma.device.findUniqueOrThrow({ where: { id } });
    await prisma.$transaction(async (tx) => {
      if (device.ownerPatientId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'patient:' + device.ownerPatientId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'serial:' + device.serialNo}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'device:' + id}))`;
      const current = await tx.device.findUniqueOrThrow({ where: { id } });
      if (current.ownerPatientId !== device.ownerPatientId) throw new Error("Ownership changed; retry after review");
      if (current.ownerPatientId) await tx.sensorSession.updateMany({ where: { patientId: current.ownerPatientId, status: "ACTIVE" }, data: { status: "ABORTED", endedAt: new Date() } });
      await tx.deviceBinding.updateMany({ where: { deviceId: id, active: true }, data: { active: false, unboundAt: new Date() } });
      await tx.gatewayCredential.updateMany({ where: { deviceSerials: { has: device.serialNo }, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.device.update({ where: { id }, data: { ownerPatientId: null, status: "UNBOUND", batteryLevel: null, signalStrength: null, lastSeenAt: null } });
    });
    console.log(JSON.stringify({ action, id }));
    return;
  }
  throw new Error("Actions: inventory, nurses, create-nurse, disable-nurse, enable-nurse, release-device");
}
main().catch(() => { console.error("Installation operation failed. Verify action, confirmation, ownership and private configuration; no secret details printed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
