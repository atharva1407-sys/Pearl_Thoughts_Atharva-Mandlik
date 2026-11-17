import { eq, inArray, and, gte, lt, sql } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../schema";
import { occupiesSeatSql, appointmentOccupiesSeat } from "@/lib/seat-occupancy";
import type { RepositoryContext } from "./context";
import type { IUserRepository } from "./interfaces";
import type { UserEntity, PatientEntity } from "./types";

export class UserRepository implements IUserRepository {
  constructor(private ctx: RepositoryContext) {}

  public async getUserById(id: string): Promise<UserEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      return rows[0] as UserEntity | undefined;
    }
    return this.ctx.getMem().users.find((u) => u.id === id);
  }

  public async getUserByEmail(email: string): Promise<UserEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, cleanEmail))
        .limit(1);
      return rows[0] as UserEntity | undefined;
    }
    return this.ctx.getMem().users.find((u) => u.email.toLowerCase() === cleanEmail);
  }

  public async createUser(
    user: Omit<UserEntity, "createdAt"> & { createdAt?: Date }
  ): Promise<UserEntity> {
    this.ctx.checkProductionDatabase();
    const cleanUser = {
      ...user,
      email: user.email.trim().toLowerCase(),
      createdAt: user.createdAt || new Date(),
    };

    const db = this.ctx.getDb();
    if (db) {
      const [inserted] = await db
        .insert(schema.users)
        .values({
          id: cleanUser.id,
          email: cleanUser.email,
          passwordHash: cleanUser.passwordHash,
          role: cleanUser.role,
          isActive: cleanUser.isActive,
        })
        .returning();
      return inserted as UserEntity;
    }

    this.ctx.getMem().users.push(cleanUser as UserEntity);
    return cleanUser as UserEntity;
  }

  public async getPatientByUserId(userId: string): Promise<PatientEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.userId, userId))
        .limit(1);
      return rows[0] as PatientEntity | undefined;
    }
    return this.ctx.getMem().patients.find((p) => p.userId === userId);
  }

  public async getPatientById(id: string): Promise<PatientEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.id, id))
        .limit(1);
      return rows[0] as PatientEntity | undefined;
    }
    return this.ctx.getMem().patients.find((p) => p.id === id);
  }

  public async createPatient(patient: PatientEntity): Promise<PatientEntity> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      await db.insert(schema.patients).values({
        id: patient.id,
        userId: patient.userId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth ?? null,
        gender: patient.gender ?? null,
        address: patient.address ?? null,
      });
      return patient;
    }
    this.ctx.getMem().patients.push(patient);
    return patient;
  }

  public async deleteUserComplete(userId: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    const mem = this.ctx.getMem();

    if (db) {
      return await db.transaction(async (tx) => {
        const userRows = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!userRows[0]) return false;

        const doctorRows = await tx.select().from(schema.doctors).where(eq(schema.doctors.userId, userId)).limit(1);
        if (doctorRows[0]) {
          const activeBookings = await tx
            .select()
            .from(schema.appointments)
            .where(
              and(
                eq(schema.appointments.doctorId, doctorRows[0].id),
                occupiesSeatSql()
              )
            )
            .limit(1);

          if (activeBookings.length > 0) {
            throw new Error(
              "Cannot delete doctor account with active upcoming appointments. Please cancel or complete all pending patient consultations first."
            );
          }

          const docAppts = await tx
            .select({ id: schema.appointments.id })
            .from(schema.appointments)
            .where(eq(schema.appointments.doctorId, doctorRows[0].id));
          const apptIds = docAppts.map((a) => a.id);
          if (apptIds.length > 0) {
            await tx.delete(schema.notifications).where(inArray(schema.notifications.appointmentId, apptIds));
            await tx.delete(schema.refunds).where(inArray(schema.refunds.appointmentId, apptIds));
            await tx.delete(schema.payments).where(inArray(schema.payments.appointmentId, apptIds));
          }

          await tx.delete(schema.appointments).where(eq(schema.appointments.doctorId, doctorRows[0].id));
          await tx.delete(schema.availabilities).where(eq(schema.availabilities.doctorId, doctorRows[0].id));
          await tx.delete(schema.doctorLeaves).where(eq(schema.doctorLeaves.doctorId, doctorRows[0].id));
          await tx.delete(schema.doctors).where(eq(schema.doctors.id, doctorRows[0].id));
        }

        const patientRows = await tx.select().from(schema.patients).where(eq(schema.patients.userId, userId)).limit(1);
        if (patientRows[0]) {
          await tx.delete(schema.notifications).where(eq(schema.notifications.userId, userId));
          const patAppts = await tx
            .select({ id: schema.appointments.id })
            .from(schema.appointments)
            .where(eq(schema.appointments.patientId, patientRows[0].id));
          const apptIds = patAppts.map((a) => a.id);
          if (apptIds.length > 0) {
            await tx.delete(schema.notifications).where(inArray(schema.notifications.appointmentId, apptIds));
            await tx.delete(schema.refunds).where(inArray(schema.refunds.appointmentId, apptIds));
            await tx.delete(schema.payments).where(inArray(schema.payments.appointmentId, apptIds));
          }
          await tx.delete(schema.appointments).where(eq(schema.appointments.patientId, patientRows[0].id));
          await tx.delete(schema.patients).where(eq(schema.patients.id, patientRows[0].id));
        }

        await tx.delete(schema.users).where(eq(schema.users.id, userId));
        return true;
      });
    }

    const user = mem.users.find((u) => u.id === userId);
    if (!user) return false;

    const doctor = mem.doctors.find((d) => d.userId === userId);
    if (doctor) {
      const activeBookings = mem.appointments.filter(
        (a) => a.doctorId === doctor.id && appointmentOccupiesSeat(a)
      );
      if (activeBookings.length > 0) {
        throw new Error(
          "Cannot delete doctor account with active upcoming appointments. Please cancel or complete all pending patient consultations first."
        );
      }
      mem.appointments = mem.appointments.filter((a) => a.doctorId !== doctor.id);
      mem.availabilities = mem.availabilities.filter((s) => s.doctorId !== doctor.id);
      mem.doctorLeaves = mem.doctorLeaves.filter((l) => l.doctorId !== doctor.id);
      mem.doctors = mem.doctors.filter((d) => d.id !== doctor.id);
    }

    const patient = mem.patients.find((p) => p.userId === userId);
    if (patient) {
      mem.appointments = mem.appointments.filter((a) => a.patientId !== patient.id);
      mem.patients = mem.patients.filter((p) => p.id !== patient.id);
    }

    mem.users = mem.users.filter((u) => u.id !== userId);
    return true;
  }

  public async getPatientsPage(limit: number, offset: number = 0): Promise<PatientEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.patients).orderBy(schema.patients.id).limit(limit).offset(offset);
      return rows as PatientEntity[];
    }
    return [...this.ctx.getMem().patients].sort((a, b) => a.id.localeCompare(b.id)).slice(offset, offset + limit);
  }

  public async recordFailedLogin(email: string): Promise<void> {
    this.ctx.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const id = `att-${crypto.randomUUID()}`;
    const now = new Date();
    const db = this.ctx.getDb();

    if (db) {
      await db.insert(schema.loginAttempts).values({
        id,
        email: cleanEmail,
        attemptedAt: now,
      });
      return;
    }

    this.ctx.getMem().loginAttempts.push({ id, email: cleanEmail, attemptedAt: now });
  }

  public async getRecentFailedLoginCount(email: string, windowMinutes: number = 15): Promise<number> {
    this.ctx.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const db = this.ctx.getDb();

    if (db) {
      const rows = await db
        .select()
        .from(schema.loginAttempts)
        .where(
          and(
            eq(schema.loginAttempts.email, cleanEmail),
            gte(schema.loginAttempts.attemptedAt, cutoff)
          )
        );
      return rows.length;
    }

    return this.ctx.getMem().loginAttempts.filter(
      (a) => a.email === cleanEmail && a.attemptedAt >= cutoff
    ).length;
  }

  public async clearFailedLogins(email: string): Promise<void> {
    this.ctx.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const db = this.ctx.getDb();

    if (db) {
      await db
        .delete(schema.loginAttempts)
        .where(eq(schema.loginAttempts.email, cleanEmail));
      return;
    }

    const mem = this.ctx.getMem();
    mem.loginAttempts = mem.loginAttempts.filter((a) => a.email !== cleanEmail);
  }

  /**
   * Concurrency-safe atomic rate limiting:
   * Uses transaction-scoped PostgreSQL advisory lock keyed by the rate-limit identity,
   * strictly serializing count-and-insert token consumption on the same key under READ COMMITTED.
   */
  public async consumeRateLimitToken(
    key: string,
    maxLimit: number,
    windowMinutes: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
    this.ctx.checkProductionDatabase();
    const cleanKey = key.trim().toLowerCase();
    const now = new Date();
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const id = `att-${crypto.randomUUID()}`;
    const db = this.ctx.getDb();

    if (db) {
      return await db.transaction(async (tx) => {
        // Transaction-scoped advisory lock strictly serializes token checks on the same key!
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ratelimit:${cleanKey}`}))`);

        const [windowStats] = await tx
          .select({
            cnt: sql<number>`count(*)::int`,
            earliest: sql<Date | string | null>`min(${schema.loginAttempts.attemptedAt})`,
          })
          .from(schema.loginAttempts)
          .where(
            and(
              eq(schema.loginAttempts.email, cleanKey),
              gte(schema.loginAttempts.attemptedAt, cutoff)
            )
          );

        const currentCount = Number(windowStats?.cnt ?? 0);

        if (currentCount < maxLimit) {
          await tx.insert(schema.loginAttempts).values({
            id,
            email: cleanKey,
            attemptedAt: now,
          });

          return {
            allowed: true,
            remaining: Math.max(0, maxLimit - (currentCount + 1)),
            retryAfterSeconds: 0,
          };
        }

        let retryAfterSeconds = windowMinutes * 60;
        if (windowStats?.earliest) {
          const earliestMs = new Date(windowStats.earliest).getTime();
          const elapsed = Date.now() - earliestMs;
          retryAfterSeconds = Math.max(1, Math.ceil((windowMinutes * 60 * 1000 - elapsed) / 1000));
        }

        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
        };
      });
    }

    const mem = this.ctx.getMem();
    const attempts = mem.loginAttempts.filter(
      (a) => a.email === cleanKey && a.attemptedAt >= cutoff
    );
    if (attempts.length < maxLimit) {
      mem.loginAttempts.push({ id, email: cleanKey, attemptedAt: now });
      return {
        allowed: true,
        remaining: Math.max(0, maxLimit - (attempts.length + 1)),
        retryAfterSeconds: 0,
      };
    }
    const earliest = attempts.reduce(
      (min, a) => (a.attemptedAt < min ? a.attemptedAt : min),
      attempts[0].attemptedAt
    );
    const elapsed = Date.now() - earliest.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMinutes * 60 * 1000 - elapsed) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  public async cleanupOldRateLimits(olderThanDays: number = 7): Promise<number> {
    this.ctx.checkProductionDatabase();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const db = this.ctx.getDb();
    if (db) {
      const result = await db.delete(schema.loginAttempts).where(lt(schema.loginAttempts.attemptedAt, cutoff));
      return (result as any).rowCount ?? 0;
    }
    const mem = this.ctx.getMem();
    const beforeCount = mem.loginAttempts.length;
    mem.loginAttempts = mem.loginAttempts.filter((a) => a.attemptedAt >= cutoff);
    return beforeCount - mem.loginAttempts.length;
  }
}
