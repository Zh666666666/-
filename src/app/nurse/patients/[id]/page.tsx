import { PatientMedicalRecord } from "@/components/patient-medical-record";
import { GatewayCredentials } from "@/components/gateway-credentials";

export default async function NursePatientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><PatientMedicalRecord role="nurse" patientId={id} backHref="/nurse" standalone /><GatewayCredentials key={id} patientId={id} /></main>;
}
