import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MedicalProfileCard } from "@/components/medical/medical-profile-card";
import { MedicalHistoryLog } from "@/components/medical/medical-history-log";
import { VisitTimeline } from "@/components/medical/visit-timeline";
import { profileToData, splitVisits, compareVisitsNewestFirst } from "@/domain/medical-history";
import {
  ageFromDateOfBirth,
  getPatientRecordAccess,
  loadVisitHistory,
  profileUpdatedLabel,
} from "@/domain/patient-record";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorPatientRecordPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in as a doctor to view patient records.");
  }

  // Doctors may open the record of a patient they treat (or are booked to treat). Anything else looks like "not found",
  // so a patient id cannot be probed.
  const [patient, access] = await Promise.all([dbRepo.getPatientById(patientId), getPatientRecordAccess(user, patientId)]);
  if (!patient || !access.canView) notFound();

  const [profile, log, items] = await Promise.all([
    dbRepo.getMedicalProfile(patientId),
    dbRepo.getMedicalHistoryLog(patientId),
    loadVisitHistory(patientId),
  ]);

  const byId = new Map(items.map((i) => [i.appointment.id, i]));
  const { upcoming, completed, other } = splitVisits(items.map((i) => i.appointment));
  const upcomingItems = upcoming.map((a) => byId.get(a.id)!);
  const previous = [...completed, ...other].sort(compareVisitsNewestFirst).map((a) => byId.get(a.id)!);
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const age = ageFromDateOfBirth(patient.dateOfBirth);

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <Link href="/doctor/patients" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <ArrowLeft size={13} />
            <span>All patients</span>
          </Link>
          <div className="eyebrow">PATIENT RECORD · CONFIDENTIAL</div>
          <h1>{patientName}</h1>
          <p>{[age != null ? `${age} yrs` : null, patient.gender, patient.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="heading-actions">
          <Badge variant="blue">{completed.length} completed visit{completed.length === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      <MedicalProfileCard
        patientId={patientId}
        data={profileToData(profile)}
        version={profile?.version ?? 0}
        canEdit={access.canEdit}
        lastUpdated={profileUpdatedLabel(profile)}
      />

      {upcomingItems.length > 0 && (
        <Card className="space-y-4">
          <div className="card-head">
            <div>
              <h2>Upcoming Appointments</h2>
              <p>{upcomingItems.length} scheduled, soonest first</p>
            </div>
          </div>
          <VisitTimeline items={upcomingItems} patientName={patientName} viewerDoctorId={user.profileId} />
        </Card>
      )}

      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2 className="flex items-center gap-2">
              <CalendarDays size={16} className="text-blue-500" /> Visit History
            </h2>
            <p>
              {previous.length} previous visit{previous.length === 1 ? "" : "s"} across the clinic, newest first
            </p>
          </div>
        </div>
        <VisitTimeline
          items={previous}
          patientName={patientName}
          viewerDoctorId={user.profileId}
          emptyText="This patient has no previous visits yet."
        />
      </Card>

      <MedicalHistoryLog entries={log} patientName={patientName} />
    </div>
  );
}
