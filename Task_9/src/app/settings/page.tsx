import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?message=Please sign in to access your account settings.");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const preferences = await dbRepo.getNotificationPreferences(user.userId);

  return (
    <SettingsClient
      isProduction={isProduction}
      userRole={user.role}
      userEmail={user.email}
      initialPreferences={
        preferences || {
          userId: user.userId,
          emailPromotional: false,
          consentedAt: null,
          updatedAt: new Date(),
        }
      }
    />
  );
}
