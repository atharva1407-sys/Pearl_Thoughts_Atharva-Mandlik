import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { istDateString } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";
import { QueueView } from "@/app/queue/queue-view";
import { resolveQueueDate } from "@/app/queue/queue-date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ReceptionPageProps {
  searchParams?: Promise<{ date?: string; doctorId?: string }>;
}

/**
 * The receptionist's workspace: the same live queue the doctor sees, scoped to the doctor(s) who assigned this
 * receptionist. A receptionist never sees a doctor who has not assigned them.
 */
export default async function ReceptionPage({ searchParams }: ReceptionPageProps) {
  const user = await getCurrentUser();
  if (user?.role === "DOCTOR") {
    redirect("/queue");
  }
  if (!user || user.role !== "RECEPTIONIST") {
    redirect("/login?portal=reception&message=Please sign in to the receptionist portal.");
  }

  const assignedDoctors = await dbRepo.getAssignedDoctors(user.profileId);

  if (assignedDoctors.length === 0) {
    return (
      <Card className="p-10 text-center space-y-3 shadow-xs">
        <Users size={32} className="mx-auto text-slate-300" />
        <h1 className="text-lg font-bold text-slate-900">You are not assigned to a doctor yet</h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          A doctor adds you to their front-desk team from the doctor portal (Reception Team). Once they do, their live
          queue appears here. Ask the doctor you work with to assign {user.email}.
        </p>
        <Link href="/" className="btn text-xs inline-flex items-center gap-1">
          Back to home
        </Link>
      </Card>
    );
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const today = istDateString(new Date());
  const targetDate = resolveQueueDate(resolvedParams?.date, today);

  // Only a doctor from this receptionist's own assignments can be selected; anything else falls back to the first.
  const activeDoctor =
    assignedDoctors.find((d) => d.id === resolvedParams?.doctorId) ?? assignedDoctors[0];

  return (
    <QueueView
      viewerRole="RECEPTIONIST"
      basePath="/reception"
      activeDoctorId={activeDoctor.id}
      switcherDoctors={assignedDoctors}
      targetDate={targetDate}
      today={today}
    />
  );
}
