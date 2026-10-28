import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { ScheduleClient } from "./schedule-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only authorized medical staff can view the master clinical schedule matrix.");
  }

  return <ScheduleClient />;
}
