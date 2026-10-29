import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { EncountersClient } from "./encounters-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EncountersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only licensed medical physicians can access patient encounters and vitals charting.");
  }

  return <EncountersClient />;
}
