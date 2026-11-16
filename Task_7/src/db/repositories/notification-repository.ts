import { eq, and, desc, lte, sql } from "drizzle-orm";
import * as schema from "../schema";
import type { RepositoryContext } from "./context";
import type { INotificationRepository } from "./interfaces";
import type {
  NotificationEntity,
  NotificationStatus,
  NotificationPreferencesEntity,
} from "./types";

export class NotificationRepository implements INotificationRepository {
  constructor(private ctx: RepositoryContext) {}

  public async createNotification(
    notification: Omit<NotificationEntity, "createdAt"> & { createdAt?: Date }
  ): Promise<NotificationEntity> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const cleanNotification: NotificationEntity = {
      ...notification,
      category: notification.category || "operational",
      createdAt: notification.createdAt || now,
    };

    const db = this.ctx.getDb();
    if (db) {
      if (cleanNotification.dedupeKey) {
        const existing = await db
          .select()
          .from(schema.notifications)
          .where(eq(schema.notifications.dedupeKey, cleanNotification.dedupeKey))
          .limit(1);
        if (existing[0]) {
          return existing[0] as NotificationEntity;
        }
      }

      const [inserted] = await db
        .insert(schema.notifications)
        .values({
          id: cleanNotification.id,
          userId: cleanNotification.userId,
          appointmentId: cleanNotification.appointmentId ?? null,
          channel: cleanNotification.channel,
          category: cleanNotification.category,
          template: cleanNotification.template,
          recipient: cleanNotification.recipient,
          payload: cleanNotification.payload ?? null,
          status: cleanNotification.status,
          scheduledFor: cleanNotification.scheduledFor,
          attempts: cleanNotification.attempts,
          lastError: cleanNotification.lastError ?? null,
          dedupeKey: cleanNotification.dedupeKey ?? null,
          providerMessageId: cleanNotification.providerMessageId ?? null,
          sentAt: cleanNotification.sentAt ?? null,
        })
        .returning();
      return inserted as NotificationEntity;
    }

    const mem = this.ctx.getMem();
    if (cleanNotification.dedupeKey) {
      const existing = mem.notifications.find((n) => n.dedupeKey === cleanNotification.dedupeKey);
      if (existing) return existing;
    }
    mem.notifications.push(cleanNotification);
    return cleanNotification;
  }

  public async getNotificationPreferences(userId: string): Promise<NotificationPreferencesEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.userId, userId))
        .limit(1);
      return rows[0] as NotificationPreferencesEntity | undefined;
    }
    return this.ctx.getMem().notificationPreferences.find((p) => p.userId === userId);
  }

  public async upsertNotificationPreferences(
    userIdOrData: string | { userId: string; emailPromotional: boolean; consentedAt?: Date | null },
    emailPromotionalArg?: boolean,
    consentedAtArg?: Date | null
  ): Promise<NotificationPreferencesEntity> {
    this.ctx.checkProductionDatabase();
    let userId: string;
    let emailPromotional: boolean;
    let consentedAt: Date | null | undefined;

    if (typeof userIdOrData === "object" && userIdOrData !== null) {
      userId = userIdOrData.userId;
      emailPromotional = Boolean(userIdOrData.emailPromotional);
      consentedAt = userIdOrData.consentedAt;
    } else {
      userId = userIdOrData;
      emailPromotional = Boolean(emailPromotionalArg);
      consentedAt = consentedAtArg;
    }

    const now = new Date();
    const entry: NotificationPreferencesEntity = {
      userId,
      emailPromotional,
      consentedAt: consentedAt !== undefined ? consentedAt : emailPromotional ? now : null,
      updatedAt: now,
    };

    const db = this.ctx.getDb();
    if (db) {
      const [res] = await db
        .insert(schema.notificationPreferences)
        .values({
          userId: entry.userId,
          emailPromotional: entry.emailPromotional,
          consentedAt: entry.consentedAt,
          updatedAt: entry.updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.notificationPreferences.userId,
          set: {
            emailPromotional: entry.emailPromotional,
            consentedAt: entry.consentedAt,
            updatedAt: entry.updatedAt,
          },
        })
        .returning();
      return res as NotificationPreferencesEntity;
    }

    const mem = this.ctx.getMem();
    const idx = mem.notificationPreferences.findIndex((p) => p.userId === userId);
    if (idx >= 0) {
      mem.notificationPreferences[idx] = entry;
    } else {
      mem.notificationPreferences.push(entry);
    }
    return entry;
  }

  public async claimPendingNotifications(cutoff: Date = new Date(), limit: number = 25): Promise<NotificationEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const query = sql`
        WITH due AS (
          SELECT id
          FROM notifications
          WHERE status = 'PENDING' AND scheduled_for <= ${cutoff}
          ORDER BY scheduled_for ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE notifications
        SET scheduled_for = now() + interval '5 minutes'
        FROM due
        WHERE notifications.id = due.id
        RETURNING notifications.*;
      `;
      const res = await db.execute(query);
      return ((res as any).rows || []) as unknown as NotificationEntity[];
    }

    const mem = this.ctx.getMem();
    const claimed: NotificationEntity[] = [];
    const now = Date.now();
    for (const item of mem.notifications) {
      if (item.status === "PENDING" && item.scheduledFor.getTime() <= cutoff.getTime()) {
        if (mem.inFlightNotificationClaims.has(item.id)) continue;
        mem.inFlightNotificationClaims.add(item.id);
        item.scheduledFor = new Date(now + 5 * 60 * 1000);
        claimed.push(item);
        if (claimed.length >= limit) break;
      }
    }
    return claimed;
  }

  public async getPendingNotifications(cutoff: Date = new Date(), limit: number = 50): Promise<NotificationEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.status, "PENDING"),
            lte(schema.notifications.scheduledFor, cutoff)
          )
        )
        .orderBy(schema.notifications.scheduledFor)
        .limit(limit);
      return rows as NotificationEntity[];
    }

    return this.ctx.getMem().notifications
      .filter((n) => n.status === "PENDING" && n.scheduledFor <= cutoff)
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
      .slice(0, limit);
  }

  public async getNotificationById(id: string): Promise<NotificationEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id)).limit(1);
      return rows[0] as NotificationEntity | undefined;
    }
    return this.ctx.getMem().notifications.find((n) => n.id === id);
  }

  public async getNotificationsByUserId(userId: string): Promise<NotificationEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
      return rows as NotificationEntity[];
    }
    return this.ctx.getMem().notifications.filter((n) => n.userId === userId);
  }

  public async updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    extra?: {
      attempts?: number;
      lastError?: string | null;
      providerMessageId?: string | null;
      sentAt?: Date | null;
      scheduledFor?: Date;
    }
  ): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    this.ctx.getMem().inFlightNotificationClaims.delete(id);

    const db = this.ctx.getDb();
    if (db) {
      const updateValues: Record<string, any> = { status };
      if (extra?.attempts !== undefined) updateValues.attempts = extra.attempts;
      if (extra?.lastError !== undefined) updateValues.lastError = extra.lastError;
      if (extra?.providerMessageId !== undefined) updateValues.providerMessageId = extra.providerMessageId;
      if (extra?.sentAt !== undefined) updateValues.sentAt = extra.sentAt;
      if (extra?.scheduledFor !== undefined) updateValues.scheduledFor = extra.scheduledFor;

      const res = await db.update(schema.notifications).set(updateValues).where(eq(schema.notifications.id, id));
      return ((res as any).rowCount ?? 1) > 0;
    }

    const notif = this.ctx.getMem().notifications.find((n) => n.id === id);
    if (!notif) return false;
    notif.status = status;
    if (extra?.attempts !== undefined) notif.attempts = extra.attempts;
    if (extra?.lastError !== undefined) notif.lastError = extra.lastError;
    if (extra?.providerMessageId !== undefined) notif.providerMessageId = extra.providerMessageId;
    if (extra?.sentAt !== undefined) notif.sentAt = extra.sentAt;
    if (extra?.scheduledFor !== undefined) notif.scheduledFor = extra.scheduledFor;
    return true;
  }

  public async requeueNotification(id: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    this.ctx.getMem().inFlightNotificationClaims.delete(id);
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      const res = await db
        .update(schema.notifications)
        .set({
          status: "PENDING",
          attempts: 0,
          lastError: null,
          scheduledFor: now,
        })
        .where(eq(schema.notifications.id, id));
      return ((res as any).rowCount ?? 1) > 0;
    }

    const notif = this.ctx.getMem().notifications.find((n) => n.id === id);
    if (!notif) return false;
    notif.status = "PENDING";
    notif.attempts = 0;
    notif.lastError = null;
    notif.scheduledFor = now;
    return true;
  }

  public async countNotificationsByStatus(): Promise<Record<NotificationStatus, number>> {
    this.ctx.checkProductionDatabase();
    const counts: Record<NotificationStatus, number> = {
      PENDING: 0,
      SENT: 0,
      FAILED: 0,
      CANCELLED: 0,
    };

    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({
          status: schema.notifications.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.notifications)
        .groupBy(schema.notifications.status);
      for (const row of rows) {
        if (row.status && row.status in counts) {
          counts[row.status as NotificationStatus] = Number(row.count);
        }
      }
      return counts;
    }

    for (const n of this.ctx.getMem().notifications) {
      if (n.status in counts) counts[n.status]++;
    }
    return counts;
  }

  public async getFailedNotifications(limit: number = 50): Promise<NotificationEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.status, "FAILED"))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(limit);
      return rows as NotificationEntity[];
    }
    return this.ctx.getMem().notifications
      .filter((n) => n.status === "FAILED")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  public async getLongPendingNotifications(stuckMinutes: number = 10, limit: number = 50): Promise<NotificationEntity[]> {
    this.ctx.checkProductionDatabase();
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.status, "PENDING"),
            lte(schema.notifications.createdAt, cutoff)
          )
        )
        .orderBy(schema.notifications.createdAt)
        .limit(limit);
      return rows as NotificationEntity[];
    }
    return this.ctx.getMem().notifications
      .filter((n) => n.status === "PENDING" && n.createdAt.getTime() <= cutoff.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  public async cancelPendingNotificationsForAppointment(
    appointmentId: string,
    template?: string
  ): Promise<number> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const conditions = [
        eq(schema.notifications.appointmentId, appointmentId),
        eq(schema.notifications.status, "PENDING"),
      ];
      if (template) {
        conditions.push(eq(schema.notifications.template, template));
      }
      const res = await db
        .update(schema.notifications)
        .set({ status: "CANCELLED" })
        .where(and(...conditions));
      return ((res as any).rowCount ?? 0);
    }

    let count = 0;
    for (const notif of this.ctx.getMem().notifications) {
      if (
        notif.appointmentId === appointmentId &&
        notif.status === "PENDING" &&
        (!template || notif.template === template)
      ) {
        notif.status = "CANCELLED";
        count++;
      }
    }
    return count;
  }
}
