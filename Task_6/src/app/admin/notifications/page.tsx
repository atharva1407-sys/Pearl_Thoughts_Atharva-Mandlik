import { notFound } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { isAdminUser } from "@/lib/admin";
import { dbRepo } from "@/db/repo";
import { AdminNotificationsClient } from "./admin-notifications-client";
import { formatKolkataDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "invalid@masked.com";
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

export default async function AdminNotificationsPage() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user.email)) {
    notFound();
  }

  const counts = await dbRepo.countNotificationsByStatus();
  const failedItemsRaw = await dbRepo.getFailedNotifications(50);
  const stuckItemsRaw = await dbRepo.getLongPendingNotifications(15, 50);

  const formatItem = (item: any) => ({
    id: item.id,
    userId: item.userId,
    appointmentId: item.appointmentId,
    channel: item.channel,
    category: item.category || "operational",
    template: item.template,
    recipientMasked: maskEmail(item.recipient),
    status: item.status,
    attempts: item.attempts,
    lastError: item.lastError,
    providerMessageId: item.providerMessageId,
    scheduledForFormatted: formatKolkataDateTime(item.scheduledFor),
    sentAtFormatted: item.sentAt ? formatKolkataDateTime(item.sentAt) : null,
    createdAtFormatted: formatKolkataDateTime(item.createdAt),
  });

  return (
    <AdminNotificationsClient
      userEmail={user.email}
      counts={counts}
      failedItems={failedItemsRaw.map(formatItem)}
      stuckItems={stuckItemsRaw.map(formatItem)}
    />
  );
}
