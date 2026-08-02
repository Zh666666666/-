import type { UserRole } from "./auth";

export type DataAccessContext = {
  role: UserRole;
  userId: string;
  patientId: string | null;
  unrestricted: boolean;
};

export function canAccessPatient(context: DataAccessContext, patientId: string) {
  return context.unrestricted || context.patientId === patientId;
}
