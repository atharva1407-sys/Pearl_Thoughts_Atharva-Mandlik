import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../schema";
import { occupiesSeatSql, appointmentOccupiesSeat } from "@/lib/seat-occupancy";
import {
  firstSharedDate,
  formatDateLabel,
  normalizeSchedule,
  sessionAppliesOnDate,
  sessionCapacity,
  validateScheduleNotInPast,
  validateScheduleShape,
  weekdayOfDate,
  addDaysToDate,
  type DayCode,
  type SessionRecurrence,
} from "@/lib/session-schedule";
import {
  analyzeSessionChange,
  classifyBooking,
  affectedMessage,
  planRelocations,
  SessionChangeBlocked,
  type BookingResolution,
  type ElasticBooking,
  type FreeSlot,
  type SessionChangeImpact,
} from "@/lib/elastic-schedule";
import { istDateString, istMinutesOfDay } from "@/lib/time";
import type { RepositoryContext } from "./context";
import type { IDoctorScheduleRepository } from "./interfaces";
import type {
  DoctorEntity,
  AvailabilityEntity,
  DoctorLeaveEntity,
  SessionScheduleInput,
  AppointmentEntity,
  SessionSlotGroup,
  ComputedSlot,
  NextOpenSlot,
} from "./types";

function doSessionsOverlap(
  s1: { startTime: string; endTime: string },
  s2: { startTime: string; endTime: string }
): boolean {
  return s1.startTime < s2.endTime && s2.startTime < s1.endTime;
}

function toLocalDateString(d: Date): string {
  return istDateString(d);
}

async function lockDoctorDay(tx: any, doctorId: string, date: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointments:${doctorId}:${date}`}))`);
}

/**
 * Pure slot engine shared by the booking page and the landing page: expands each active session
 * for the date into stream slots or wave seats, marking full, past and too-soon (<15 min) slots.
 */
export function buildSessionSlotGroups(
  sessions: AvailabilityEntity[],
  activeAppointments: Pick<AppointmentEntity, "startTime">[],
  dateString: string,
  now: Date = new Date()
): SessionSlotGroup[] {
  const activeSessions = sessions.filter((s) => sessionAppliesOnDate(s, dateString));
  const isToday = dateString === toLocalDateString(now);
  const currentTotalMinutes = istMinutesOfDay(now);

  const groups: SessionSlotGroup[] = [];

  for (const session of activeSessions) {
    const { startTime, endTime, slotDurationMinutes } = session;
    const capacity = sessionCapacity(session);

    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const slots: ComputedSlot[] = [];

    for (let current = startMinutes; current + slotDurationMinutes <= endMinutes; current += slotDurationMinutes) {
      const slotStartH = Math.floor(current / 60).toString().padStart(2, "0");
      const slotStartM = (current % 60).toString().padStart(2, "0");
      const slotStart = `${slotStartH}:${slotStartM}`;

      const slotEndTotal = current + slotDurationMinutes;
      const slotEndH = Math.floor(slotEndTotal / 60).toString().padStart(2, "0");
      const slotEndM = (slotEndTotal % 60).toString().padStart(2, "0");
      const slotEnd = `${slotEndH}:${slotEndM}`;

      const bookedCount = activeAppointments.filter((a) => a.startTime === slotStart).length;
      const seatsLeft = Math.max(0, capacity - bookedCount);

      // Disallow slots in past or within 15 mins for today
      const isPastOrTooSoon = isToday && current < currentTotalMinutes + 15;
      const isBooked = seatsLeft <= 0 || isPastOrTooSoon;

      slots.push({
        sessionId: session.id,
        sessionName: session.name,
        schedulingType: session.schedulingType,
        startTime: slotStart,
        endTime: slotEnd,
        capacity,
        bookedCount,
        seatsLeft: isPastOrTooSoon ? 0 : seatsLeft,
        isBooked,
      });
    }

    groups.push({
      sessionId: session.id,
      sessionName: session.name,
      schedulingType: session.schedulingType,
      patientsPerWave: capacity,
      timeRange: `${startTime}–${endTime}`,
      slots,
    });
  }

  return groups;
}

export class DoctorRepository implements IDoctorScheduleRepository {
  constructor(private ctx: RepositoryContext) {}

  public async getAllDoctors(specialization?: string): Promise<DoctorEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const query = db.select().from(schema.doctors);
      const rows =
        specialization && specialization !== "All"
          ? await query.where(eq(schema.doctors.specialization, specialization))
          : await query;
      return rows.map((r) => ({
        ...r,
        consultationFee: Number(r.consultationFee ?? 500),
        experienceYears: Number(r.experienceYears ?? 0),
        licenseNumber: r.licenseNumber ?? "REG-PENDING",
      })) as DoctorEntity[];
    }
    let docs = [...this.ctx.getMem().doctors];
    if (specialization && specialization !== "All") {
      docs = docs.filter((d) => d.specialization === specialization);
    }
    return docs;
  }

  public async getDoctorById(id: string): Promise<DoctorEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctors)
        .where(eq(schema.doctors.id, id))
        .limit(1);
      if (!rows[0]) return undefined;
      return {
        ...rows[0],
        consultationFee: Number(rows[0].consultationFee ?? 500),
        experienceYears: Number(rows[0].experienceYears ?? 0),
        licenseNumber: rows[0].licenseNumber ?? "REG-PENDING",
      } as DoctorEntity;
    }
    return this.ctx.getMem().doctors.find((d) => d.id === id);
  }

  public async getDoctorByUserId(userId: string): Promise<DoctorEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctors)
        .where(eq(schema.doctors.userId, userId))
        .limit(1);
      if (!rows[0]) return undefined;
      return {
        ...rows[0],
        consultationFee: Number(rows[0].consultationFee ?? 500),
        experienceYears: Number(rows[0].experienceYears ?? 0),
        licenseNumber: rows[0].licenseNumber ?? "REG-PENDING",
      } as DoctorEntity;
    }
    return this.ctx.getMem().doctors.find((d) => d.userId === userId);
  }

  public async createDoctor(doctor: DoctorEntity): Promise<DoctorEntity> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      await db.insert(schema.doctors).values({
        id: doctor.id,
        userId: doctor.userId,
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialization: doctor.specialization,
        phone: doctor.phone,
        licenseNumber: doctor.licenseNumber,
        experienceYears: doctor.experienceYears,
        consultationFee: doctor.consultationFee,
        bio: doctor.bio ?? null,
        profileImage: doctor.profileImage ?? null,
      });
      return doctor;
    }
    this.ctx.getMem().doctors.push(doctor);
    return doctor;
  }

  public async getAvailabilitiesByDoctorId(doctorId: string): Promise<AvailabilityEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.availabilities)
        .where(eq(schema.availabilities.doctorId, doctorId));
      return rows.map((r) => ({
        ...r,
        name: r.name || "OPD Session",
        schedulingType: (r.schedulingType as "STREAM" | "WAVE") || "STREAM",
        patientsPerWave: r.patientsPerWave || 1,
        recurrence: (r.recurrence as SessionRecurrence) || "WEEKLY",
      })) as AvailabilityEntity[];
    }
    return this.ctx.getMem().availabilities.filter((a) => a.doctorId === doctorId);
  }

  private assertNoSessionClash(
    candidate: { startTime: string; endTime: string } & Parameters<typeof normalizeSchedule>[0],
    others: AvailabilityEntity[]
  ): void {
    const today = toLocalDateString(new Date());
    for (const existing of others) {
      if (!existing.isActive) continue;
      if (!doSessionsOverlap(candidate, existing)) continue;
      const shared = firstSharedDate(candidate, existing, today);
      if (shared) {
        throw new Error(
          `Session time (${candidate.startTime}–${candidate.endTime}) overlaps with existing session '${existing.name}' (${existing.startTime}–${existing.endTime}) on ${weekdayOfDate(shared)} ${formatDateLabel(shared)}.`
        );
      }
    }
  }

  public async createAvailabilitySession(
    data: {
      doctorId: string;
      name: string;
      dayOfWeek?: DayCode | null;
      startTime: string;
      endTime: string;
      slotDurationMinutes: number;
      isActive: boolean;
      schedulingType: "STREAM" | "WAVE";
      patientsPerWave: number;
    } & SessionScheduleInput
  ): Promise<AvailabilityEntity> {
    this.ctx.checkProductionDatabase();

    if (data.startTime >= data.endTime) {
      throw new Error("Session start time must be earlier than end time.");
    }

    const schedule = normalizeSchedule(data);
    const shapeError = validateScheduleShape(schedule);
    if (shapeError) throw new Error(shapeError);
    const pastError = validateScheduleNotInPast(schedule, toLocalDateString(new Date()));
    if (pastError) throw new Error(pastError);

    // Overlap validation against this doctor's other sessions that can fall on the same date
    if (data.isActive ?? true) {
      const existingSessions = await this.getAvailabilitiesByDoctorId(data.doctorId);
      this.assertNoSessionClash({ startTime: data.startTime, endTime: data.endTime, ...schedule }, existingSessions);
    }

    const id = `avail-${crypto.randomUUID()}`;
    const session: AvailabilityEntity = {
      id,
      doctorId: data.doctorId,
      name: data.name.trim() || "OPD Session",
      startTime: data.startTime,
      endTime: data.endTime,
      slotDurationMinutes: data.slotDurationMinutes || 30,
      isActive: data.isActive ?? true,
      schedulingType: data.schedulingType || "STREAM",
      patientsPerWave: Math.max(1, Math.floor(data.patientsPerWave || (data.schedulingType === "WAVE" ? 3 : 1))),
      ...schedule,
    };

    const db = this.ctx.getDb();
    if (db) {
      await db.insert(schema.availabilities).values({
        id: session.id,
        doctorId: session.doctorId,
        name: session.name,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        slotDurationMinutes: session.slotDurationMinutes,
        isActive: session.isActive,
        schedulingType: session.schedulingType,
        patientsPerWave: session.patientsPerWave,
        recurrence: schedule.recurrence,
        dayOfMonth: schedule.dayOfMonth,
        specificDate: schedule.specificDate,
        validFrom: schedule.validFrom,
        validUntil: schedule.validUntil,
      });
      return session;
    }

    this.ctx.getMem().availabilities.push(session);
    return session;
  }

  public async createSessionsForDates(
    data: Parameters<DoctorRepository["createAvailabilitySession"]>[0],
    dates: string[]
  ): Promise<AvailabilityEntity[]> {
    this.ctx.checkProductionDatabase();
    const unique = Array.from(new Set(dates.map((d) => d.trim()).filter(Boolean))).sort();
    if (unique.length === 0) throw new Error("Choose at least one date.");
    if (unique.length > 31) throw new Error("You can add at most 31 dates at a time.");

    const today = toLocalDateString(new Date());
    const existing = await this.getAvailabilitiesByDoctorId(data.doctorId);
    for (const date of unique) {
      const schedule = normalizeSchedule({ recurrence: "ONE_TIME", specificDate: date });
      const shapeError = validateScheduleShape(schedule);
      if (shapeError) throw new Error(`${date}: ${shapeError}`);
      const pastError = validateScheduleNotInPast(schedule, today);
      if (pastError) throw new Error(`${date}: ${pastError}`);
      if (data.startTime >= data.endTime) throw new Error("Session start time must be earlier than end time.");
      if (data.isActive ?? true) {
        this.assertNoSessionClash({ startTime: data.startTime, endTime: data.endTime, ...schedule }, existing);
      }
    }

    const created: AvailabilityEntity[] = [];
    try {
      for (const date of unique) {
        created.push(await this.createAvailabilitySession({ ...data, recurrence: "ONE_TIME", specificDate: date }));
      }
    } catch (err) {
      for (const session of created) {
        await this.deleteAvailabilitySession(data.doctorId, session.id).catch(() => undefined);
      }
      throw err;
    }
    return created;
  }

  private async findOwnedSession(doctorId: string, id: string): Promise<AvailabilityEntity | undefined> {
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.availabilities)
        .where(and(eq(schema.availabilities.id, id), eq(schema.availabilities.doctorId, doctorId)))
        .limit(1);
      return rows[0] as AvailabilityEntity | undefined;
    }
    return this.ctx.getMem().availabilities.find((a) => a.id === id && a.doctorId === doctorId);
  }

  private async upcomingSessionBookings(sessionId: string): Promise<ElasticBooking[]> {
    const today = toLocalDateString(new Date());
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({
          id: schema.appointments.id,
          appointmentDate: schema.appointments.appointmentDate,
          startTime: schema.appointments.startTime,
          endTime: schema.appointments.endTime,
          tokenNumber: schema.appointments.tokenNumber,
          firstName: schema.patients.firstName,
          lastName: schema.patients.lastName,
        })
        .from(schema.appointments)
        .leftJoin(schema.patients, eq(schema.patients.id, schema.appointments.patientId))
        .where(
          and(
            eq(schema.appointments.sessionId, sessionId),
            occupiesSeatSql(),
            gte(schema.appointments.appointmentDate, today)
          )
        )
        .orderBy(schema.appointments.appointmentDate, schema.appointments.startTime);
      return rows.map((r) => ({
        id: r.id,
        appointmentDate: r.appointmentDate,
        startTime: r.startTime,
        endTime: r.endTime,
        tokenNumber: r.tokenNumber,
        patientName: r.firstName ? `${r.firstName} ${r.lastName ?? ""}`.trim() : undefined,
      }));
    }
    const mem = this.ctx.getMem();
    return mem.appointments
      .filter((a) => a.sessionId === sessionId && appointmentOccupiesSeat(a) && a.appointmentDate >= today)
      .sort((a, b) => (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime))
      .map((a) => {
        const p = mem.patients.find((pt) => pt.id === a.patientId);
        return {
          id: a.id,
          appointmentDate: a.appointmentDate,
          startTime: a.startTime,
          endTime: a.endTime,
          tokenNumber: a.tokenNumber,
          patientName: p ? `${p.firstName} ${p.lastName}`.trim() : undefined,
        };
      });
  }

  private async previewRelocation(
    doctorId: string,
    updatedSession: AvailabilityEntity,
    affected: ElasticBooking[]
  ): Promise<{ movable: number; stuck: number }> {
    const sessions = (await this.getAvailabilitiesByDoctorId(doctorId)).map((s) =>
      s.id === updatedSession.id ? updatedSession : s
    );
    const dates = new Set<string>();
    const today = toLocalDateString(new Date());
    const lastBookableDate = addDaysToDate(today, 30);
    for (const b of affected) {
      for (let d = b.appointmentDate; d <= addDaysToDate(b.appointmentDate, 14) && d <= lastBookableDate; d = addDaysToDate(d, 1)) {
        dates.add(d);
      }
    }
    const freeByDate = new Map<string, FreeSlot[]>();
    for (const date of dates) {
      const { groups } = await this.computeSessionGroups(doctorId, date, sessions);
      freeByDate.set(
        date,
        groups.flatMap((g) =>
          g.slots
            .filter((s) => !s.isBooked && s.seatsLeft > 0)
            .map((s) => ({ date, sessionId: g.sessionId, startTime: s.startTime, endTime: s.endTime, seatsLeft: s.seatsLeft }))
        )
      );
    }
    return planRelocations(affected, (date) => freeByDate.get(date) ?? [], { today, lastBookableDate });
  }

  public async updateAvailabilitySession(
    doctorId: string,
    id: string,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId">>,
    options: { resolution?: BookingResolution } = {}
  ): Promise<AvailabilityEntity> {
    return (await this.updateAvailabilitySessionWithImpact(doctorId, id, updates, options)).session;
  }

  public async updateAvailabilitySessionWithImpact(
    doctorId: string,
    id: string,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId">>,
    options: { resolution?: BookingResolution } = {}
  ): Promise<{ session: AvailabilityEntity; impact: SessionChangeImpact }> {
    this.ctx.checkProductionDatabase();
    const current = await this.findOwnedSession(doctorId, id);

    if (!current) {
      throw new Error("Availability session not found.");
    }

    const newStartTime = updates.startTime || current.startTime;
    const newEndTime = updates.endTime || current.endTime;

    if (newStartTime >= newEndTime) {
      throw new Error("Session start time must be earlier than end time.");
    }

    const pick = <K extends keyof SessionScheduleInput>(key: K) =>
      (updates[key] !== undefined ? updates[key] : current[key]) as SessionScheduleInput[K];
    const schedule = normalizeSchedule({
      recurrence: pick("recurrence"),
      dayOfWeek: pick("dayOfWeek"),
      dayOfMonth: pick("dayOfMonth"),
      specificDate: pick("specificDate"),
      validFrom: pick("validFrom"),
      validUntil: pick("validUntil"),
    });
    const shapeError = validateScheduleShape(schedule);
    if (shapeError) throw new Error(shapeError);

    const currentSchedule = normalizeSchedule(current);
    const datesChanged =
      schedule.recurrence !== currentSchedule.recurrence ||
      schedule.specificDate !== currentSchedule.specificDate ||
      schedule.validUntil !== currentSchedule.validUntil;
    if (datesChanged) {
      const pastError = validateScheduleNotInPast(schedule, toLocalDateString(new Date()));
      if (pastError) throw new Error(pastError);
    }

    const newIsActive = updates.isActive ?? current.isActive;
    const newSlotDuration = updates.slotDurationMinutes || current.slotDurationMinutes;
    if (newIsActive) {
      const allSessions = await this.getAvailabilitiesByDoctorId(current.doctorId);
      this.assertNoSessionClash(
        { startTime: newStartTime, endTime: newEndTime, ...schedule },
        allSessions.filter((s) => s.id !== id)
      );
    }

    const upcoming = await this.upcomingSessionBookings(id);
    const impact = analyzeSessionChange(
      { startTime: current.startTime, endTime: current.endTime, slotDurationMinutes: current.slotDurationMinutes },
      { startTime: newStartTime, endTime: newEndTime, slotDurationMinutes: newSlotDuration, ...schedule },
      upcoming.filter((b) => classifyBooking(b, current) === "KEPT")
    );

    const newSchedulingType = updates.schedulingType || current.schedulingType || "STREAM";
    const updated: AvailabilityEntity = {
      ...current,
      ...updates,
      startTime: newStartTime,
      endTime: newEndTime,
      isActive: newIsActive,
      schedulingType: newSchedulingType,
      patientsPerWave: Math.max(
        1,
        Math.floor(updates.patientsPerWave || current.patientsPerWave || (newSchedulingType === "WAVE" ? 3 : 1))
      ),
      ...schedule,
    };

    if (newIsActive && impact.affectedBookings.length > 0) {
      impact.relocationPreview = await this.previewRelocation(current.doctorId, updated, impact.affectedBookings);
      if (!options.resolution) {
        throw new SessionChangeBlocked(affectedMessage(impact), impact);
      }
    }

    const db = this.ctx.getDb();
    if (db) {
      await db
        .update(schema.availabilities)
        .set({
          name: updated.name,
          dayOfWeek: updated.dayOfWeek,
          startTime: updated.startTime,
          endTime: updated.endTime,
          slotDurationMinutes: updated.slotDurationMinutes,
          isActive: updated.isActive,
          schedulingType: updated.schedulingType,
          patientsPerWave: updated.patientsPerWave,
          recurrence: schedule.recurrence,
          dayOfMonth: schedule.dayOfMonth,
          specificDate: schedule.specificDate,
          validFrom: schedule.validFrom,
          validUntil: schedule.validUntil,
        })
        .where(and(eq(schema.availabilities.id, id), eq(schema.availabilities.doctorId, doctorId)));
      return { session: updated, impact };
    }

    Object.assign(current, updated);
    return { session: updated, impact };
  }

  public async deleteAvailabilitySession(doctorId: string, id: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const session = await this.findOwnedSession(doctorId, id);
    if (!session) return false;

    const today = toLocalDateString(new Date());
    let upcomingBookings: number;
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.sessionId, id),
            occupiesSeatSql(),
            gte(schema.appointments.appointmentDate, today)
          )
        )
        .limit(1);
      upcomingBookings = rows.length;
    } else {
      upcomingBookings = this.ctx.getMem().appointments.filter(
        (a) => a.sessionId === id && appointmentOccupiesSeat(a) && a.appointmentDate >= today
      ).length;
    }
    if (upcomingBookings > 0) {
      throw new Error(
        "This session still has upcoming booked appointments. Reschedule or cancel them before deleting the session, or switch the session off instead."
      );
    }

    if (db) {
      const res = await db
        .delete(schema.availabilities)
        .where(and(eq(schema.availabilities.id, id), eq(schema.availabilities.doctorId, doctorId)));
      return ((res as any).rowCount ?? 1) > 0;
    }
    const mem = this.ctx.getMem();
    const idx = mem.availabilities.findIndex((a) => a.id === id && a.doctorId === doctorId);
    if (idx !== -1) {
      mem.availabilities.splice(idx, 1);
      return true;
    }
    return false;
  }

  public async updateDoctorAvailability(
    doctorId: string,
    dayOfWeek: DayCode,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId" | "dayOfWeek">>
  ): Promise<AvailabilityEntity> {
    const existing = (await this.getAvailabilitiesByDoctorId(doctorId)).find(
      (s) => (s.recurrence ?? "WEEKLY") === "WEEKLY" && s.dayOfWeek === dayOfWeek
    );
    if (existing) {
      return await this.updateAvailabilitySession(doctorId, existing.id, updates);
    }
    return await this.createAvailabilitySession({
      doctorId,
      name: "OPD Session",
      dayOfWeek,
      startTime: updates.startTime || "09:00",
      endTime: updates.endTime || "17:00",
      slotDurationMinutes: updates.slotDurationMinutes || 30,
      isActive: updates.isActive ?? true,
      schedulingType: updates.schedulingType || "STREAM",
      patientsPerWave: updates.patientsPerWave || 1,
    });
  }

  public async getDoctorLeaves(doctorId: string): Promise<DoctorLeaveEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctorLeaves)
        .where(eq(schema.doctorLeaves.doctorId, doctorId))
        .orderBy(desc(schema.doctorLeaves.leaveDate));
      return rows as DoctorLeaveEntity[];
    }
    return this.ctx.getMem().doctorLeaves.filter((l) => l.doctorId === doctorId);
  }

  public async isDoctorOnLeave(doctorId: string, date: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctorLeaves)
        .where(and(eq(schema.doctorLeaves.doctorId, doctorId), eq(schema.doctorLeaves.leaveDate, date)))
        .limit(1);
      return Boolean(rows[0]);
    }
    return this.ctx.getMem().doctorLeaves.some((l) => l.doctorId === doctorId && l.leaveDate === date);
  }

  public async addDoctorLeave(doctorId: string, leaveDate: string, reason?: string): Promise<DoctorLeaveEntity> {
    this.ctx.checkProductionDatabase();
    if (leaveDate < toLocalDateString(new Date())) {
      throw new Error("Leave can't be added for a past date.");
    }

    const id = `leave-${crypto.randomUUID()}`;
    const leaveItem: DoctorLeaveEntity = {
      id,
      doctorId,
      leaveDate,
      reason: reason ?? null,
      createdAt: new Date(),
    };
    const bookedPatientsError = (count: number) =>
      new Error(
        `${count} patient appointment${count === 1 ? " is" : "s are"} booked on ${leaveDate}. Reschedule or cancel ${count === 1 ? "it" : "them"} before blocking this day.`
      );

    const db = this.ctx.getDb();
    if (db) {
      await db.transaction(async (tx) => {
        await lockDoctorDay(tx, doctorId, leaveDate);
        const booked = await tx
          .select({ id: schema.appointments.id })
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.doctorId, doctorId),
              eq(schema.appointments.appointmentDate, leaveDate),
              occupiesSeatSql()
            )
          );
        if (booked.length > 0) {
          throw bookedPatientsError(booked.length);
        }
        await tx
          .insert(schema.doctorLeaves)
          .values({
            id,
            doctorId,
            leaveDate,
            reason: reason ?? null,
          })
          .onConflictDoNothing();
      });
      return leaveItem;
    }

    const mem = this.ctx.getMem();
    const bookedCount = mem.appointments.filter(
      (a) => a.doctorId === doctorId && a.appointmentDate === leaveDate && appointmentOccupiesSeat(a)
    ).length;
    if (bookedCount > 0) {
      throw bookedPatientsError(bookedCount);
    }

    const existing = mem.doctorLeaves.find((l) => l.doctorId === doctorId && l.leaveDate === leaveDate);
    if (!existing) {
      mem.doctorLeaves.push(leaveItem);
    }
    return leaveItem;
  }

  public async removeDoctorLeave(doctorId: string, date: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const res = await db
        .delete(schema.doctorLeaves)
        .where(and(eq(schema.doctorLeaves.doctorId, doctorId), eq(schema.doctorLeaves.leaveDate, date)));
      return ((res as any).rowCount ?? 1) > 0;
    }
    const mem = this.ctx.getMem();
    const before = mem.doctorLeaves.length;
    mem.doctorLeaves = mem.doctorLeaves.filter((l) => !(l.doctorId === doctorId && l.leaveDate === date));
    return mem.doctorLeaves.length < before;
  }

  public async computeSessionGroups(
    doctorId: string,
    dateString: string,
    sessionsOverride?: AvailabilityEntity[]
  ): Promise<{ isLeave: boolean; leaveReason?: string | null; groups: SessionSlotGroup[] }> {
    this.ctx.checkProductionDatabase();

    const onLeave = await this.isDoctorOnLeave(doctorId, dateString);
    if (onLeave) {
      const leaves = await this.getDoctorLeaves(doctorId);
      const leave = leaves.find((l) => l.leaveDate === dateString);
      return { isLeave: true, leaveReason: leave?.reason || "Doctor on approved clinical leave", groups: [] };
    }

    const allSessions = sessionsOverride ?? (await this.getAvailabilitiesByDoctorId(doctorId));
    if (!allSessions.some((s) => sessionAppliesOnDate(s, dateString))) {
      return { isLeave: false, groups: [] };
    }

    let activeAppointments: AppointmentEntity[] = [];
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.appointmentDate, dateString),
            occupiesSeatSql()
          )
        );
      activeAppointments = rows as AppointmentEntity[];
    } else {
      activeAppointments = this.ctx.getMem().appointments.filter(
        (a) => a.doctorId === doctorId && a.appointmentDate === dateString && appointmentOccupiesSeat(a)
      );
    }

    return { isLeave: false, groups: buildSessionSlotGroups(allSessions, activeAppointments, dateString) };
  }

  public async getNextOpenSlots(doctorIds: string[], dates: string[]): Promise<Map<string, NextOpenSlot>> {
    this.ctx.checkProductionDatabase();
    const result = new Map<string, NextOpenSlot>();
    if (doctorIds.length === 0 || dates.length === 0) return result;

    const now = new Date();
    let sessions: AvailabilityEntity[];
    let leaves: { doctorId: string; leaveDate: string }[];
    let appointments: Pick<AppointmentEntity, "doctorId" | "appointmentDate" | "startTime">[];

    const db = this.ctx.getDb();
    if (db) {
      const [sessionRows, leaveRows, appointmentRows] = await Promise.all([
        db.select().from(schema.availabilities).where(inArray(schema.availabilities.doctorId, doctorIds)),
        db
          .select({ doctorId: schema.doctorLeaves.doctorId, leaveDate: schema.doctorLeaves.leaveDate })
          .from(schema.doctorLeaves)
          .where(and(inArray(schema.doctorLeaves.doctorId, doctorIds), inArray(schema.doctorLeaves.leaveDate, dates))),
        db
          .select({
            doctorId: schema.appointments.doctorId,
            appointmentDate: schema.appointments.appointmentDate,
            startTime: schema.appointments.startTime,
          })
          .from(schema.appointments)
          .where(
            and(
              inArray(schema.appointments.doctorId, doctorIds),
              inArray(schema.appointments.appointmentDate, dates),
              occupiesSeatSql(now)
            )
          ),
      ]);
      sessions = sessionRows as AvailabilityEntity[];
      leaves = leaveRows;
      appointments = appointmentRows;
    } else {
      const mem = this.ctx.getMem();
      sessions = mem.availabilities.filter((s) => doctorIds.includes(s.doctorId));
      leaves = mem.doctorLeaves.filter((l) => doctorIds.includes(l.doctorId) && dates.includes(l.leaveDate));
      appointments = mem.appointments.filter(
        (a) => doctorIds.includes(a.doctorId) && dates.includes(a.appointmentDate) && appointmentOccupiesSeat(a, now)
      );
    }
    for (const doctorId of doctorIds) {
      const doctorSessions = sessions.filter((s) => s.doctorId === doctorId);
      for (const date of dates) {
        if (leaves.some((l) => l.doctorId === doctorId && l.leaveDate === date)) continue;
        const dayAppointments = appointments.filter((a) => a.doctorId === doctorId && a.appointmentDate === date);
        const open = buildSessionSlotGroups(doctorSessions, dayAppointments, date, now)
          .flatMap((g) => g.slots)
          .filter((slot) => !slot.isBooked)
          .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
        if (open) {
          result.set(doctorId, { date, startTime: open.startTime, sessionName: open.sessionName, endTime: open.endTime });
          break;
        }
      }
    }

    return result;
  }

  public async computeAvailableSlots(
    doctorId: string,
    dateString: string
  ): Promise<{ startTime: string; endTime: string; isBooked: boolean }[]> {
    const res = await this.computeSessionGroups(doctorId, dateString);
    const flat: { startTime: string; endTime: string; isBooked: boolean }[] = [];
    res.groups.forEach((g) => {
      g.slots.forEach((s) => {
        flat.push({
          startTime: s.startTime,
          endTime: s.endTime,
          isBooked: s.isBooked,
        });
      });
    });
    return flat;
  }
}
