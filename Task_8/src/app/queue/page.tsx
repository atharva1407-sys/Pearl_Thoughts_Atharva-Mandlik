import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { istDateString } from "@/lib/time";
import { QueueView } from "./queue-view";
import { resolveQueueDate } from "./queue-date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface QueuePageProps {
  searchParams?: Promise<{ date?: string }>;
}

/** The doctor's live queue. Receptionists work the same view from /reception. */
export default async function QueuePage({ searchParams }: QueuePageProps) {
  const user = await getCurrentUser();
  if (user?.role === "RECEPTIONIST") {
    redirect("/reception");
  }
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only authorized medical staff can access the outpatient triage queue.");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const today = istDateString(new Date());
  const targetDate = resolveQueueDate(resolvedParams?.date, today);

  return (
    <QueueView
      viewerRole="DOCTOR"
      basePath="/queue"
      activeDoctorId={user.profileId}
      targetDate={targetDate}
      today={today}
    />
  );
}
