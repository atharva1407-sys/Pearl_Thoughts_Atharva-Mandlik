import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { ArrowLeft } from "lucide-react";
import { SessionsClient } from "./sessions-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorAvailabilityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in to access availability management.");
  }

  const [doctor, availabilities, leaves] = await Promise.all([
    dbRepo.getDoctorById(user.profileId),
    dbRepo.getAvailabilitiesByDoctorId(user.profileId),
    dbRepo.getDoctorLeaves(user.profileId),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/doctor/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        <span>Back to Doctor Agenda</span>
      </Link>

      <div className="page-heading">
        <div>
          <div className="eyebrow">PHYSICIAN SCHEDULE · RECURRING SESSIONS & LEAVES</div>
          <h1>OPD Sessions & Availability Management</h1>
          <p>
            Configure multiple daily consultation shifts (e.g. Morning & Evening OPD), slot intervals, stream/wave paradigms, and blocked leave dates for Dr. {doctor?.firstName} {doctor?.lastName}.
          </p>
        </div>
      </div>

      <SessionsClient
        initialSessions={availabilities}
        initialLeaves={leaves}
        doctorId={user.profileId}
      />
    </div>
  );
}
