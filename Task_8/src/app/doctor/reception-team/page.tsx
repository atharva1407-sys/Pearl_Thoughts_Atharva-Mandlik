import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { ArrowLeft } from "lucide-react";
import { ReceptionTeamClient } from "./reception-team-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Where a doctor decides who works their front desk. Receptionists see only the doctors that list them here. */
export default async function ReceptionTeamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in as a doctor to manage your reception team.");
  }

  const [doctor, team] = await Promise.all([
    dbRepo.getDoctorById(user.profileId),
    dbRepo.getReceptionistsForDoctor(user.profileId),
  ]);

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <Link href="/doctor/dashboard" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline mb-1">
            <ArrowLeft size={13} /> Back to agenda
          </Link>
          <div className="eyebrow">FRONT DESK · ASSIGNMENT</div>
          <h1>Reception Team</h1>
          <p>
            Dr. {doctor?.firstName} {doctor?.lastName}: choose who checks in your patients and marks them unavailable.
            They see only your queue, and you keep calling patients in and completing consultations.
          </p>
        </div>
      </div>

      <ReceptionTeamClient
        team={team.map((r) => ({
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
          // Only the doctor who created an account can reset its password.
          canResetPassword: r.createdByDoctorId === user.profileId,
        }))}
      />
    </div>
  );
}
