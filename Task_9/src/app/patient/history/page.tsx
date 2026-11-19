import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, FileHeart } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { Card } from "@/components/ui/card";
import { MedicalProfileCard } from "@/components/medical/medical-profile-card";
import { MedicalHistoryLog } from "@/components/medical/medical-history-log";
import { VisitTimeline } from "@/components/medical/visit-timeline";
import { profileToData, splitVisits, compareVisitsNewestFirst } from "@/domain/medical-history";
import { loadVisitHistory, profileUpdatedLabel, resolveOwnPatientId } from "@/domain/patient-record";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PatientMedicalHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?message=Please sign in to view your medical history.");
  // Front-desk staff have no patient record and no access to clinical data.
  if (user.role === "RECEPTIONIST") redirect("/reception");

  // A signed-in patient only ever sees their own record: the id comes from the session, never from the URL.
  const patientId = await resolveOwnPatientId(user);
  const patient = patientId ? await dbRepo.getPatientById(patientId) : undefined;

  if (!patientId || !patient) {
    return (
      <Card className="space-y-2 py-10 text-center">
        <FileHeart className="mx-auto text-slate-400" size={28} />
        <p className="text-sm text-slate-600">There is no patient record linked to this account.</p>
      </Card>
    );
  }

  const [profile, log, items] = await Promise.all([
    dbRepo.getMedicalProfile(patientId),
    dbRepo.getMedicalHistoryLog(patientId),
    loadVisitHistory(patientId),
  ]);

  const byId = new Map(items.map((i) => [i.appointment.id, i]));
  const { upcoming, completed, other } = splitVisits(items.map((i) => i.appointment));
  // Previous visits in one chronological list (newest first): consultations done, cancelled or missed.
  const previous = [...completed, ...other].sort(compareVisitsNewestFirst).map((a) => byId.get(a.id)!);
  const patientName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <Link href="/patient/dashboard" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <ArrowLeft size={13} />
            <span>Back to Patient Portal</span>
          </Link>
          <div className="eyebrow">CLINICAL RECORDS · RUBY HALL CLINIC</div>
          <h1>My Medical History</h1>
          <p>Your health details, past consultations and a record of every change made to this information.</p>
        </div>
      </div>

      <MedicalProfileCard
        patientId={patientId}
        data={profileToData(profile)}
        version={profile?.version ?? 0}
        canEdit
        lastUpdated={profileUpdatedLabel(profile)}
      />

      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2 className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-500" /> Visit History
            </h2>
            <p>
              {previous.length} previous visit{previous.length === 1 ? "" : "s"}, newest first
              {upcoming.length > 0 && (
                <>
                  {" · "}
                  {upcoming.length} upcoming on your{" "}
                  <Link href="/patient/dashboard" className="font-semibold text-blue-600 hover:underline">
                    dashboard
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <VisitTimeline
          items={previous}
          patientName={patientName}
          prescriptionsHref="/patient/prescriptions"
          emptyText="You have no previous visits yet. Completed consultations will appear here."
        />
      </Card>

      <MedicalHistoryLog entries={log} patientName={patientName} />
    </div>
  );
}
