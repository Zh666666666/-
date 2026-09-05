import { PatientMedicalRecord } from "@/components/patient-medical-record";

export default async function NursePatientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><PatientMedicalRecord role="nurse" patientId={id} backHref="/nurse" standalone /></main>;
}
