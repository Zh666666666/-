import type { UserRole } from "./auth";

export type DataAccessContext = {
  role: UserRole;
  userId: string;
  patientId: string | null;
  managedPatientIds: string[];
  unrestricted: boolean;
};

export function canAccessPatient(context: DataAccessContext, patientId: string) {
  return context.unrestricted || context.patientId === patientId || context.managedPatientIds.includes(patientId);
}

export function accessiblePatientIds(context: DataAccessContext) {
  if (context.unrestricted) return undefined;
  if (context.role === "nurse") return context.managedPatientIds;
  return context.patientId ? [context.patientId] : [];
}
