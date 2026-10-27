import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only authorized medical administrators can access facility settings.");
  }

  const isProduction = process.env.NODE_ENV === "production";
  return <SettingsClient isProduction={isProduction} />;
}
