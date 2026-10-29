import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import crypto from "crypto";
import { db, isPostgresConfigured, assertProductionDatabase } from "./index";
import * as schema from "./schema";
import { hashPassword } from "@/lib/auth-crypto";
import { RUBY_HALL_SPECIALISTS, specialistSessionId, getSeedDoctorPassword } from "./specialists-catalog";
import { seedSpecialists } from "./seed-specialists";

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  role: "PATIENT" | "DOCTOR";
  isActive: boolean;
  createdAt: Date;
}

export interface PatientEntity {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
}

export interface DoctorEntity {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialization: string;
  phone: string;
  licenseNumber: string;
  experienceYears: number;
  consultationFee: number;
  bio?: string | null;
  profileImage?: string | null;
}

export interface AvailabilityEntity {
  id: string;
  doctorId: string;
  name: string; // e.g. "Morning OPD 09:00–13:00"
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  slotDurationMinutes: number;
  isActive: boolean;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
}

export interface DoctorLeaveEntity {
  id: string;
  doctorId: string;
  leaveDate: string; // YYYY-MM-DD
  reason?: string | null;
  createdAt: Date;
}

export interface AppointmentEntity {
  id: string;
  patientId: string;
  doctorId: string;
  sessionId?: string | null;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  tokenNumber: number;
  reason?: string | null;
  rescheduledAt?: Date | null;
  rescheduledBy?: "PATIENT" | "DOCTOR" | null;
  originalAppointmentDate?: string | null;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  createdAt: Date;
}

export interface ComputedSlot {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  seatsLeft: number;
  isBooked: boolean;
}

export interface SessionSlotGroup {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
  timeRange: string;
  slots: ComputedSlot[];
}

export function doSessionsOverlap(
  s1: { startTime: string; endTime: string },
  s2: { startTime: string; endTime: string }
): boolean {
  return s1.startTime < s2.endTime && s2.startTime < s1.endTime;
}

const DAY_CODES: Array<AvailabilityEntity["dayOfWeek"]> = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** YYYY-MM-DD in local time (never UTC, so early-morning IST dates don't shift a day). */
export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayOfWeekFor(dateString: string): AvailabilityEntity["dayOfWeek"] {
  return DAY_CODES[new Date(dateString + "T00:00:00").getDay()];
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
  const targetDay = dayOfWeekFor(dateString);
  const activeSessions = sessions.filter((s) => s.dayOfWeek === targetDay && s.isActive);
  const isToday = dateString === toLocalDateString(now);
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

  const groups: SessionSlotGroup[] = [];

  for (const session of activeSessions) {
    const { startTime, endTime, slotDurationMinutes, schedulingType, patientsPerWave } = session;
    const capacity = schedulingType === "WAVE" ? Math.max(1, patientsPerWave) : 1;

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

export interface NextOpenSlot {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  sessionName: string;
}

type DbTransaction = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0];

/**
 * Serialises every booking change for one doctor on one date. Concurrent bookings or reschedules
 * into that day wait here, so the seat count and token number they read can't go stale before
 * their insert. The lock is released automatically when the transaction ends.
 */
async function lockDoctorDay(tx: DbTransaction, doctorId: string, date: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointments:${doctorId}:${date}`}))`);
}

/**
 * Next token for a session (or the whole day when there is no session). Uses the highest token
 * ever issued, cancelled ones included, so a cancellation never causes a token to be handed out twice.
 */
async function nextTokenNumber(tx: DbTransaction, doctorId: string, date: string, sessionId: string | null): Promise<number> {
  const [row] = await tx
    .select({ maxToken: sql<number>`coalesce(max(${schema.appointments.tokenNumber}), 0)` })
    .from(schema.appointments)
    .where(
      and(
        eq(schema.appointments.doctorId, doctorId),
        eq(schema.appointments.appointmentDate, date),
        sessionId ? eq(schema.appointments.sessionId, sessionId) : sql`true`
      )
    );
  return Number(row?.maxToken ?? 0) + 1;
}

function nextMemoryToken(
  appointments: AppointmentEntity[],
  doctorId: string,
  date: string,
  sessionId: string | null,
  excludeId?: string
): number {
  const tokens = appointments
    .filter(
      (a) =>
        a.id !== excludeId &&
        a.doctorId === doctorId &&
        a.appointmentDate === date &&
        (!sessionId || a.sessionId === sessionId)
    )
    .map((a) => a.tokenNumber);
  return (tokens.length ? Math.max(...tokens) : 0) + 1;
}

/**
 * Production Database Repository for Medrella Healthcare.
 */
class MedrellaRepository {
  private memUsers: UserEntity[] = [];
  private memPatients: PatientEntity[] = [];
  private memDoctors: DoctorEntity[] = [];
  private memAvailabilities: AvailabilityEntity[] = [];
  private memAppointments: AppointmentEntity[] = [];
  private memDoctorLeaves: DoctorLeaveEntity[] = [];
  private memLoginAttempts: { id: string; email: string; attemptedAt: Date }[] = [];

  constructor() {
    if (!isPostgresConfigured() && process.env.ENABLE_SEED_DATA !== "false" && process.env.NODE_ENV !== "production") {
      this.seedMemory();
    }
  }

  private checkProductionDatabase() {
    assertProductionDatabase();
  }

  private seedMemory() {
    this.memUsers = [];
    this.memPatients = [];
    this.memDoctors = [];
    this.memAvailabilities = [];
    this.memAppointments = [];
    this.memDoctorLeaves = [];

    const defaultPasswordHash = hashPassword(getSeedDoctorPassword({ allowDevFallback: true }));

    RUBY_HALL_SPECIALISTS.forEach((d) => {
      this.memUsers.push({
        id: d.userId,
        email: d.email,
        passwordHash: defaultPasswordHash,
        role: "DOCTOR",
        isActive: true,
        createdAt: new Date(),
      });

      this.memDoctors.push({
        id: d.id,
        userId: d.userId,
        firstName: d.firstName,
        lastName: d.lastName,
        specialization: d.specialization,
        phone: d.phone,
        licenseNumber: d.licenseNumber,
        experienceYears: d.experienceYears,
        consultationFee: d.consultationFee,
        bio: d.bio,
        profileImage: d.profileImage,
      });

      for (const session of d.sessions) {
        for (const day of session.days) {
          this.memAvailabilities.push({
            id: specialistSessionId(d.id, session.key, day),
            doctorId: d.id,
            name: session.name,
            dayOfWeek: day,
            startTime: session.start,
            endTime: session.end,
            slotDurationMinutes: session.duration,
            isActive: true,
            schedulingType: session.schedulingType,
            patientsPerWave: session.patientsPerWave,
          });
        }
      }
    });
  }

  // --- User Operations ---
  public async getUserById(id: string): Promise<UserEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      return rows[0] as UserEntity | undefined;
    }
    return this.memUsers.find((u) => u.id === id);
  }

  public async getUserByEmail(email: string): Promise<UserEntity | undefined> {
    this.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, cleanEmail))
        .limit(1);
      return rows[0] as UserEntity | undefined;
    }
    return this.memUsers.find((u) => u.email.toLowerCase() === cleanEmail);
  }

  public async createUser(
    user: Omit<UserEntity, "createdAt"> & { createdAt?: Date }
  ): Promise<UserEntity> {
    this.checkProductionDatabase();
    const cleanUser = {
      ...user,
      email: user.email.trim().toLowerCase(),
      createdAt: user.createdAt || new Date(),
    };

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

    this.memUsers.push(cleanUser as UserEntity);
    return cleanUser as UserEntity;
  }

  // --- Patient Operations ---
  public async getPatientByUserId(userId: string): Promise<PatientEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.userId, userId))
        .limit(1);
      return rows[0] as PatientEntity | undefined;
    }
    return this.memPatients.find((p) => p.userId === userId);
  }

  public async getPatientById(id: string): Promise<PatientEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.id, id))
        .limit(1);
      return rows[0] as PatientEntity | undefined;
    }
    return this.memPatients.find((p) => p.id === id);
  }

  public async createPatient(patient: PatientEntity): Promise<PatientEntity> {
    this.checkProductionDatabase();
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
    this.memPatients.push(patient);
    return patient;
  }

  // --- Doctor Operations ---
  public async getAllDoctors(specialization?: string): Promise<DoctorEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      let query = db.select().from(schema.doctors);
      const rows = specialization && specialization !== "All"
        ? await query.where(eq(schema.doctors.specialization, specialization))
        : await query;
      return rows.map((r) => ({
        ...r,
        consultationFee: Number(r.consultationFee ?? 500),
        experienceYears: Number(r.experienceYears ?? 0),
        licenseNumber: r.licenseNumber ?? "REG-PENDING",
      })) as DoctorEntity[];
    }
    let docs = [...this.memDoctors];
    if (specialization && specialization !== "All") {
      docs = docs.filter((d) => d.specialization === specialization);
    }
    return docs;
  }

  public async getDoctorById(id: string): Promise<DoctorEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db.select().from(schema.doctors).where(eq(schema.doctors.id, id)).limit(1);
      if (!rows[0]) return undefined;
      return {
        ...rows[0],
        consultationFee: Number(rows[0].consultationFee ?? 500),
        experienceYears: Number(rows[0].experienceYears ?? 0),
        licenseNumber: rows[0].licenseNumber ?? "REG-PENDING",
      } as DoctorEntity;
    }
    return this.memDoctors.find((d) => d.id === id);
  }

  public async getDoctorByUserId(userId: string): Promise<DoctorEntity | undefined> {
    this.checkProductionDatabase();
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
    return this.memDoctors.find((d) => d.userId === userId);
  }

  public async createDoctor(doctor: DoctorEntity): Promise<DoctorEntity> {
    this.checkProductionDatabase();
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
    this.memDoctors.push(doctor);
    return doctor;
  }

  // --- Doctor Sessions (Availabilities) Operations ---
  public async getAvailabilitiesByDoctorId(doctorId: string): Promise<AvailabilityEntity[]> {
    this.checkProductionDatabase();
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
      })) as AvailabilityEntity[];
    }
    return this.memAvailabilities.filter((a) => a.doctorId === doctorId);
  }

  public async createAvailabilitySession(data: {
    doctorId: string;
    name: string;
    dayOfWeek: AvailabilityEntity["dayOfWeek"];
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    isActive: boolean;
    schedulingType: "STREAM" | "WAVE";
    patientsPerWave: number;
  }): Promise<AvailabilityEntity> {
    this.checkProductionDatabase();

    if (data.startTime >= data.endTime) {
      throw new Error("Session start time must be earlier than end time.");
    }

    // Overlap validation across existing sessions on the same day for this doctor
    const existingSessions = await this.getAvailabilitiesByDoctorId(data.doctorId);
    const daySessions = existingSessions.filter((s) => s.dayOfWeek === data.dayOfWeek && s.isActive);
    for (const existing of daySessions) {
      if (doSessionsOverlap({ startTime: data.startTime, endTime: data.endTime }, existing)) {
        throw new Error(
          `Session time (${data.startTime}–${data.endTime}) overlaps with existing session '${existing.name}' (${existing.startTime}–${existing.endTime}) on ${data.dayOfWeek}.`
        );
      }
    }

    const id = `avail-${crypto.randomUUID()}`;
    const session: AvailabilityEntity = {
      id,
      doctorId: data.doctorId,
      name: data.name.trim() || "OPD Session",
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      slotDurationMinutes: data.slotDurationMinutes || 30,
      isActive: data.isActive ?? true,
      schedulingType: data.schedulingType || "STREAM",
      patientsPerWave: data.schedulingType === "WAVE" ? Math.max(1, data.patientsPerWave || 3) : 1,
    };

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
      });
      return session;
    }

    this.memAvailabilities.push(session);
    return session;
  }

  /** Only the owning doctor's session is found; another doctor's id behaves exactly like a missing one. */
  private async findOwnedSession(doctorId: string, id: string): Promise<AvailabilityEntity | undefined> {
    if (db) {
      const rows = await db
        .select()
        .from(schema.availabilities)
        .where(and(eq(schema.availabilities.id, id), eq(schema.availabilities.doctorId, doctorId)))
        .limit(1);
      return rows[0] as AvailabilityEntity | undefined;
    }
    return this.memAvailabilities.find((a) => a.id === id && a.doctorId === doctorId);
  }

  public async updateAvailabilitySession(
    doctorId: string,
    id: string,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId">>
  ): Promise<AvailabilityEntity> {
    this.checkProductionDatabase();
    const current = await this.findOwnedSession(doctorId, id);

    if (!current) {
      throw new Error("Availability session not found.");
    }

    const newStartTime = updates.startTime || current.startTime;
    const newEndTime = updates.endTime || current.endTime;
    const newDay = updates.dayOfWeek || current.dayOfWeek;

    if (newStartTime >= newEndTime) {
      throw new Error("Session start time must be earlier than end time.");
    }

    // Overlap validation against other sessions on the same day
    const allSessions = await this.getAvailabilitiesByDoctorId(current.doctorId);
    const daySessions = allSessions.filter((s) => s.id !== id && s.dayOfWeek === newDay && (updates.isActive ?? s.isActive));
    for (const existing of daySessions) {
      if (doSessionsOverlap({ startTime: newStartTime, endTime: newEndTime }, existing)) {
        throw new Error(
          `Session time (${newStartTime}–${newEndTime}) overlaps with existing session '${existing.name}' (${existing.startTime}–${existing.endTime}) on ${newDay}.`
        );
      }
    }

    const updated: AvailabilityEntity = {
      ...current,
      ...updates,
      startTime: newStartTime,
      endTime: newEndTime,
      dayOfWeek: newDay,
      schedulingType: updates.schedulingType || current.schedulingType || "STREAM",
      patientsPerWave: (updates.schedulingType || current.schedulingType) === "WAVE"
        ? Math.max(1, updates.patientsPerWave || current.patientsPerWave || 3)
        : 1,
    };

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
        })
        .where(and(eq(schema.availabilities.id, id), eq(schema.availabilities.doctorId, doctorId)));
      return updated;
    }

    Object.assign(current, updated);
    return updated;
  }

  /**
   * Deletes one of the doctor's own sessions. Refuses while patients still hold upcoming
   * bookings in it, so no appointment is left pointing at a session that no longer exists.
   */
  public async deleteAvailabilitySession(doctorId: string, id: string): Promise<boolean> {
    this.checkProductionDatabase();
    const session = await this.findOwnedSession(doctorId, id);
    if (!session) return false;

    const today = toLocalDateString(new Date());
    let upcomingBookings: number;
    if (db) {
      const rows = await db
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.sessionId, id),
            eq(schema.appointments.status, "BOOKED"),
            gte(schema.appointments.appointmentDate, today)
          )
        )
        .limit(1);
      upcomingBookings = rows.length;
    } else {
      upcomingBookings = this.memAppointments.filter(
        (a) => a.sessionId === id && a.status === "BOOKED" && a.appointmentDate >= today
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
      return (res.rowCount ?? 1) > 0;
    }
    const idx = this.memAvailabilities.findIndex((a) => a.id === id && a.doctorId === doctorId);
    if (idx !== -1) {
      this.memAvailabilities.splice(idx, 1);
      return true;
    }
    return false;
  }

  public async updateDoctorAvailability(
    doctorId: string,
    dayOfWeek: AvailabilityEntity["dayOfWeek"],
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId" | "dayOfWeek">>
  ): Promise<AvailabilityEntity> {
    const existing = (await this.getAvailabilitiesByDoctorId(doctorId)).find((s) => s.dayOfWeek === dayOfWeek);
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

  // --- Doctor Leave Operations ---
  public async getDoctorLeaves(doctorId: string): Promise<DoctorLeaveEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctorLeaves)
        .where(eq(schema.doctorLeaves.doctorId, doctorId))
        .orderBy(desc(schema.doctorLeaves.leaveDate));
      return rows as DoctorLeaveEntity[];
    }
    return this.memDoctorLeaves.filter((l) => l.doctorId === doctorId);
  }

  public async addDoctorLeave(doctorId: string, leaveDate: string, reason?: string): Promise<DoctorLeaveEntity> {
    this.checkProductionDatabase();
    const id = `leave-${crypto.randomUUID()}`;
    const leaveItem: DoctorLeaveEntity = {
      id,
      doctorId,
      leaveDate,
      reason: reason ?? null,
      createdAt: new Date(),
    };

    if (db) {
      await db
        .insert(schema.doctorLeaves)
        .values({
          id,
          doctorId,
          leaveDate,
          reason: reason ?? null,
        })
        .onConflictDoNothing();
      return leaveItem;
    }

    const existing = this.memDoctorLeaves.find((l) => l.doctorId === doctorId && l.leaveDate === leaveDate);
    if (!existing) {
      this.memDoctorLeaves.push(leaveItem);
    }
    return leaveItem;
  }

  public async removeDoctorLeave(doctorId: string, leaveDate: string): Promise<boolean> {
    this.checkProductionDatabase();
    if (db) {
      const res = await db
        .delete(schema.doctorLeaves)
        .where(and(eq(schema.doctorLeaves.doctorId, doctorId), eq(schema.doctorLeaves.leaveDate, leaveDate)));
      return (res.rowCount ?? 1) > 0;
    }
    const idx = this.memDoctorLeaves.findIndex((l) => l.doctorId === doctorId && l.leaveDate === leaveDate);
    if (idx !== -1) {
      this.memDoctorLeaves.splice(idx, 1);
      return true;
    }
    return false;
  }

  public async isDoctorOnLeave(doctorId: string, leaveDate: string): Promise<boolean> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctorLeaves)
        .where(and(eq(schema.doctorLeaves.doctorId, doctorId), eq(schema.doctorLeaves.leaveDate, leaveDate)))
        .limit(1);
      return Boolean(rows[0]);
    }
    return this.memDoctorLeaves.some((l) => l.doctorId === doctorId && l.leaveDate === leaveDate);
  }

  // --- Dynamic Slot Computation Engine (Wave & Sessions Aware) ---
  public async computeSessionGroups(
    doctorId: string,
    dateString: string
  ): Promise<{ isLeave: boolean; leaveReason?: string | null; groups: SessionSlotGroup[] }> {
    this.checkProductionDatabase();

    // Check if doctor is on leave
    const onLeave = await this.isDoctorOnLeave(doctorId, dateString);
    if (onLeave) {
      const leaves = await this.getDoctorLeaves(doctorId);
      const leave = leaves.find((l) => l.leaveDate === dateString);
      return { isLeave: true, leaveReason: leave?.reason || "Doctor on approved clinical leave", groups: [] };
    }

    const allSessions = await this.getAvailabilitiesByDoctorId(doctorId);
    const targetDay = dayOfWeekFor(dateString);
    if (!allSessions.some((s) => s.dayOfWeek === targetDay && s.isActive)) {
      return { isLeave: false, groups: [] };
    }

    // Fetch existing active appointments on this date
    let activeAppointments: AppointmentEntity[] = [];
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.appointmentDate, dateString),
            sql`${schema.appointments.status} != 'CANCELLED'`
          )
        );
      activeAppointments = rows as AppointmentEntity[];
    } else {
      activeAppointments = this.memAppointments.filter(
        (a) => a.doctorId === doctorId && a.appointmentDate === dateString && a.status !== "CANCELLED"
      );
    }

    return { isLeave: false, groups: buildSessionSlotGroups(allSessions, activeAppointments, dateString) };
  }

  /**
   * First bookable slot per doctor across the given dates, using three queries in total
   * (sessions, leaves, appointments) instead of one slot computation per doctor per day.
   * Doctors with nothing open in the window are absent from the returned map.
   */
  public async getNextOpenSlots(doctorIds: string[], dates: string[]): Promise<Map<string, NextOpenSlot>> {
    this.checkProductionDatabase();
    const result = new Map<string, NextOpenSlot>();
    if (doctorIds.length === 0 || dates.length === 0) return result;

    let sessions: AvailabilityEntity[];
    let leaves: { doctorId: string; leaveDate: string }[];
    let appointments: Pick<AppointmentEntity, "doctorId" | "appointmentDate" | "startTime">[];

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
              sql`${schema.appointments.status} != 'CANCELLED'`
            )
          ),
      ]);
      sessions = sessionRows as AvailabilityEntity[];
      leaves = leaveRows;
      appointments = appointmentRows;
    } else {
      sessions = this.memAvailabilities.filter((s) => doctorIds.includes(s.doctorId));
      leaves = this.memDoctorLeaves.filter((l) => doctorIds.includes(l.doctorId) && dates.includes(l.leaveDate));
      appointments = this.memAppointments.filter(
        (a) => doctorIds.includes(a.doctorId) && dates.includes(a.appointmentDate) && a.status !== "CANCELLED"
      );
    }

    const now = new Date();
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
          result.set(doctorId, { date, startTime: open.startTime, sessionName: open.sessionName });
          break;
        }
      }
    }

    return result;
  }

  // --- Legacy helper for backwards compatibility ---
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

  // --- Appointment Operations ---
  public async getAppointmentById(id: string): Promise<AppointmentEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.id, id))
        .limit(1);
      return rows[0] as AppointmentEntity | undefined;
    }
    return this.memAppointments.find((a) => a.id === id);
  }

  public async createAppointment(
    data: Omit<AppointmentEntity, "id" | "createdAt" | "status" | "tokenNumber"> & {
      sessionId?: string | null;
    }
  ): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }> {
    this.checkProductionDatabase();
    const id = `apt-${crypto.randomUUID()}`;

    if (db) {
      return await db.transaction(async (tx) => {
        await lockDoctorDay(tx, data.doctorId, data.appointmentDate);

        // 1. Verify doctor leave
        const leaveRows = await tx
          .select()
          .from(schema.doctorLeaves)
          .where(and(eq(schema.doctorLeaves.doctorId, data.doctorId), eq(schema.doctorLeaves.leaveDate, data.appointmentDate)))
          .limit(1);
        if (leaveRows.length > 0) {
          return { success: false, message: "Doctor is on leave on this date. Please choose another date." };
        }

        // 2. Identify session and determine capacity
        let capacity = 1;
        let sessionId = data.sessionId || null;
        if (sessionId) {
          const sessionRows = await tx
            .select()
            .from(schema.availabilities)
            .where(eq(schema.availabilities.id, sessionId))
            .limit(1);
          if (sessionRows[0] && sessionRows[0].schedulingType === "WAVE") {
            capacity = Math.max(1, sessionRows[0].patientsPerWave);
          }
        } else {
          // Find matching session by doctor and time
          const date = new Date(data.appointmentDate + "T00:00:00");
          const dayMap: Array<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"> = [
            "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"
          ];
          const targetDay = dayMap[date.getDay()];
          const sessionRows = await tx
            .select()
            .from(schema.availabilities)
            .where(
              and(
                eq(schema.availabilities.doctorId, data.doctorId),
                eq(schema.availabilities.dayOfWeek, targetDay),
                eq(schema.availabilities.isActive, true)
              )
            );
          const match = sessionRows.find((s) => s.startTime <= data.startTime && data.startTime < s.endTime);
          if (match) {
            sessionId = match.id;
            if (match.schedulingType === "WAVE") {
              capacity = Math.max(1, match.patientsPerWave);
            }
          }
        }

        // 3. Concurrency check inside transaction
        const activeForSlot = await tx
          .select()
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.doctorId, data.doctorId),
              eq(schema.appointments.appointmentDate, data.appointmentDate),
              eq(schema.appointments.startTime, data.startTime),
              sql`${schema.appointments.status} != 'CANCELLED'`
            )
          );

        if (activeForSlot.length >= capacity) {
          return {
            success: false,
            message: capacity > 1
              ? "This wave slot has reached full capacity. Please choose another wave."
              : "This slot has already been booked by another patient. Please choose another time.",
          };
        }

        // 4. Token number for this session / date (max issued + 1, never reused)
        const tokenNumber = await nextTokenNumber(tx, data.doctorId, data.appointmentDate, sessionId);

        // 5. Insert appointment
        const [inserted] = await tx
          .insert(schema.appointments)
          .values({
            id,
            patientId: data.patientId,
            doctorId: data.doctorId,
            sessionId,
            appointmentDate: data.appointmentDate,
            startTime: data.startTime,
            endTime: data.endTime,
            status: "BOOKED",
            tokenNumber,
            reason: data.reason ?? null,
          })
          .returning();

        return {
          success: true,
          message: "Appointment booked successfully!",
          appointment: inserted as AppointmentEntity,
        };
      });
    }

    // In-memory fallback
    const onLeave = this.memDoctorLeaves.some((l) => l.doctorId === data.doctorId && l.leaveDate === data.appointmentDate);
    if (onLeave) {
      return { success: false, message: "Doctor is on leave on this date." };
    }

    let capacity = 1;
    let sessionId = data.sessionId || null;
    if (sessionId) {
      const sess = this.memAvailabilities.find((s) => s.id === sessionId);
      if (sess && sess.schedulingType === "WAVE") capacity = Math.max(1, sess.patientsPerWave);
    }

    const activeForSlot = this.memAppointments.filter(
      (a) =>
        a.doctorId === data.doctorId &&
        a.appointmentDate === data.appointmentDate &&
        a.startTime === data.startTime &&
        a.status !== "CANCELLED"
    );

    if (activeForSlot.length >= capacity) {
      return {
        success: false,
        message: "This slot is already full. Please choose another slot.",
      };
    }

    const tokenNumber = nextMemoryToken(this.memAppointments, data.doctorId, data.appointmentDate, sessionId);

    const newAppointment: AppointmentEntity = {
      ...data,
      id,
      sessionId,
      tokenNumber,
      status: "BOOKED",
      createdAt: new Date(),
    };

    this.memAppointments.unshift(newAppointment);
    return { success: true, message: "Appointment booked successfully!", appointment: newAppointment };
  }

  // --- Rescheduling (Patient & Doctor) ---
  public async rescheduleAppointment(data: {
    appointmentId: string;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
    newSessionId?: string | null;
    actorUserId: string;
    actorRole: "PATIENT" | "DOCTOR";
  }): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }> {
    this.checkProductionDatabase();

    if (db) {
      return await db.transaction(async (tx) => {
        const apptRows = await tx
          .select()
          .from(schema.appointments)
          .where(eq(schema.appointments.id, data.appointmentId))
          .limit(1);

        const appt = apptRows[0];
        if (!appt) {
          return { success: false, message: "Appointment record not found." };
        }

        if (appt.status !== "BOOKED") {
          return {
            success: false,
            message: `Only active booked appointments can be rescheduled. Current status is ${appt.status}.`,
          };
        }

        await lockDoctorDay(tx, appt.doctorId, data.newDate);

        // Authorization & cutoff checks
        if (data.actorRole === "PATIENT") {
          const patientRows = await tx
            .select()
            .from(schema.patients)
            .where(eq(schema.patients.userId, data.actorUserId))
            .limit(1);
          if (!patientRows[0] || patientRows[0].id !== appt.patientId) {
            return { success: false, message: "Unauthorized. You may only reschedule your own appointments." };
          }

          // 1-hour cancellation/reschedule policy enforcement
          const apptDateTime = new Date(`${appt.appointmentDate}T${appt.startTime}:00`);
          const diffMs = apptDateTime.getTime() - Date.now();
          if (diffMs < 60 * 60 * 1000) {
            return {
              success: false,
              message: "Appointments can only be rescheduled at least 1 hour in advance.",
            };
          }
        } else if (data.actorRole === "DOCTOR") {
          const doctorRows = await tx
            .select()
            .from(schema.doctors)
            .where(eq(schema.doctors.userId, data.actorUserId))
            .limit(1);
          if (!doctorRows[0] || doctorRows[0].id !== appt.doctorId) {
            return { success: false, message: "Unauthorized. You may only reschedule appointments assigned to you." };
          }
        }

        // Doctor leave check on new date
        const leaveRows = await tx
          .select()
          .from(schema.doctorLeaves)
          .where(and(eq(schema.doctorLeaves.doctorId, appt.doctorId), eq(schema.doctorLeaves.leaveDate, data.newDate)))
          .limit(1);
        if (leaveRows.length > 0) {
          return { success: false, message: "Doctor is on leave on the selected date. Please choose another date." };
        }

        // Capacity check on new slot
        let capacity = 1;
        let newSessionId = data.newSessionId || null;
        if (newSessionId) {
          const sessionRows = await tx
            .select()
            .from(schema.availabilities)
            .where(eq(schema.availabilities.id, newSessionId))
            .limit(1);
          if (sessionRows[0] && sessionRows[0].schedulingType === "WAVE") {
            capacity = Math.max(1, sessionRows[0].patientsPerWave);
          }
        }

        const activeForNewSlot = await tx
          .select()
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.doctorId, appt.doctorId),
              eq(schema.appointments.appointmentDate, data.newDate),
              eq(schema.appointments.startTime, data.newStartTime),
              sql`${schema.appointments.status} != 'CANCELLED'`,
              sql`${schema.appointments.id} != ${appt.id}` // Exclude self
            )
          );

        if (activeForNewSlot.length >= capacity) {
          return {
            success: false,
            message: "The requested new slot is fully booked. Please select another time.",
          };
        }

        // Token in the new session / date (max issued + 1, never reused)
        const newTokenNumber = await nextTokenNumber(tx, appt.doctorId, data.newDate, newSessionId);

        // Atomic slot move: frees old slot and claims new one in a single update
        const [updated] = await tx
          .update(schema.appointments)
          .set({
            originalAppointmentDate: appt.originalAppointmentDate || appt.appointmentDate,
            originalStartTime: appt.originalStartTime || appt.startTime,
            originalEndTime: appt.originalEndTime || appt.endTime,
            appointmentDate: data.newDate,
            startTime: data.newStartTime,
            endTime: data.newEndTime,
            sessionId: newSessionId,
            tokenNumber: newTokenNumber,
            rescheduledAt: new Date(),
            rescheduledBy: data.actorRole,
          })
          .where(eq(schema.appointments.id, data.appointmentId))
          .returning();

        return {
          success: true,
          message: "Appointment successfully rescheduled!",
          appointment: updated as AppointmentEntity,
        };
      });
    }

    // In-memory fallback
    const appt = this.memAppointments.find((a) => a.id === data.appointmentId);
    if (!appt) return { success: false, message: "Appointment record not found." };
    if (appt.status !== "BOOKED") return { success: false, message: "Only booked appointments can be rescheduled." };

    if (data.actorRole === "PATIENT") {
      const p = this.memPatients.find((pt) => pt.userId === data.actorUserId);
      if (!p || p.id !== appt.patientId) return { success: false, message: "Unauthorized." };
      const apptDateTime = new Date(`${appt.appointmentDate}T${appt.startTime}:00`);
      if (apptDateTime.getTime() - Date.now() < 60 * 60 * 1000) {
        return { success: false, message: "Appointments can only be rescheduled at least 1 hour in advance." };
      }
    } else {
      const d = this.memDoctors.find((doc) => doc.userId === data.actorUserId);
      if (!d || d.id !== appt.doctorId) return { success: false, message: "Unauthorized." };
    }

    if (this.memDoctorLeaves.some((l) => l.doctorId === appt.doctorId && l.leaveDate === data.newDate)) {
      return { success: false, message: "Doctor is on leave on the selected date. Please choose another date." };
    }

    const memSession = data.newSessionId ? this.memAvailabilities.find((a) => a.id === data.newSessionId) : undefined;
    const memCapacity = memSession?.schedulingType === "WAVE" ? Math.max(1, memSession.patientsPerWave) : 1;
    const takenSeats = this.memAppointments.filter(
      (a) =>
        a.id !== appt.id &&
        a.doctorId === appt.doctorId &&
        a.appointmentDate === data.newDate &&
        a.startTime === data.newStartTime &&
        a.status !== "CANCELLED"
    ).length;
    if (takenSeats >= memCapacity) {
      return { success: false, message: "The requested new slot is fully booked. Please select another time." };
    }

    appt.originalAppointmentDate = appt.originalAppointmentDate || appt.appointmentDate;
    appt.originalStartTime = appt.originalStartTime || appt.startTime;
    appt.originalEndTime = appt.originalEndTime || appt.endTime;
    appt.appointmentDate = data.newDate;
    appt.startTime = data.newStartTime;
    appt.endTime = data.newEndTime;
    appt.sessionId = data.newSessionId || appt.sessionId;
    appt.tokenNumber = nextMemoryToken(this.memAppointments, appt.doctorId, data.newDate, appt.sessionId ?? null, appt.id);
    appt.rescheduledAt = new Date();
    appt.rescheduledBy = data.actorRole;

    return { success: true, message: "Appointment successfully rescheduled!", appointment: appt };
  }

  public async getAllAppointments(): Promise<AppointmentEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .orderBy(desc(schema.appointments.createdAt));
      return rows as AppointmentEntity[];
    }
    return [...this.memAppointments];
  }

  public async getAppointmentsByPatientId(
    patientId: string
  ): Promise<(AppointmentEntity & { doctor: DoctorEntity })[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select({
          appointment: schema.appointments,
          doctor: schema.doctors,
        })
        .from(schema.appointments)
        .innerJoin(schema.doctors, eq(schema.appointments.doctorId, schema.doctors.id))
        .where(eq(schema.appointments.patientId, patientId))
        .orderBy(desc(schema.appointments.appointmentDate));

      return rows.map((r) => ({
        ...(r.appointment as AppointmentEntity),
        doctor: {
          ...r.doctor,
          consultationFee: Number(r.doctor.consultationFee ?? 500),
          experienceYears: Number(r.doctor.experienceYears ?? 0),
          licenseNumber: r.doctor.licenseNumber ?? "REG-PENDING",
        } as DoctorEntity,
      }));
    }

    return this.memAppointments
      .filter((a) => a.patientId === patientId)
      .map((a) => ({
        ...a,
        doctor: this.memDoctors.find((d) => d.id === a.doctorId)!,
      }))
      .filter((a) => a.doctor !== undefined);
  }

  public async getAppointmentsByDoctorId(
    doctorId: string
  ): Promise<(AppointmentEntity & { patient: PatientEntity })[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select({
          appointment: schema.appointments,
          patient: schema.patients,
        })
        .from(schema.appointments)
        .innerJoin(schema.patients, eq(schema.appointments.patientId, schema.patients.id))
        .where(eq(schema.appointments.doctorId, doctorId))
        .orderBy(desc(schema.appointments.appointmentDate));

      return rows.map((r) => ({
        ...(r.appointment as AppointmentEntity),
        patient: r.patient as PatientEntity,
      }));
    }

    return this.memAppointments
      .filter((a) => a.doctorId === doctorId)
      .map((a) => ({
        ...a,
        patient: this.memPatients.find((p) => p.id === a.patientId)!,
      }))
      .filter((a) => a.patient !== undefined);
  }

  public async updateAppointmentStatus(
    id: string,
    status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
  ): Promise<boolean> {
    this.checkProductionDatabase();
    if (db) {
      const res = await db
        .update(schema.appointments)
        .set({ status })
        .where(eq(schema.appointments.id, id));
      return (res.rowCount ?? 1) > 0;
    }

    const apt = this.memAppointments.find((a) => a.id === id);
    if (!apt) return false;
    apt.status = status;
    return true;
  }

  public async seed(): Promise<void> {
    if (db) {
      await seedSpecialists(db, getSeedDoctorPassword({ allowDevFallback: false }));
      return;
    }
    this.seedMemory();
  }

  public async deleteUserComplete(userId: string): Promise<boolean> {
    this.checkProductionDatabase();
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
                eq(schema.appointments.status, "BOOKED")
              )
            )
            .limit(1);

          if (activeBookings.length > 0) {
            throw new Error(
              "Cannot delete doctor account with active upcoming appointments. Please cancel or complete all pending patient consultations first."
            );
          }

          await tx.delete(schema.appointments).where(eq(schema.appointments.doctorId, doctorRows[0].id));
          await tx.delete(schema.availabilities).where(eq(schema.availabilities.doctorId, doctorRows[0].id));
          await tx.delete(schema.doctorLeaves).where(eq(schema.doctorLeaves.doctorId, doctorRows[0].id));
          await tx.delete(schema.doctors).where(eq(schema.doctors.id, doctorRows[0].id));
        }

        const patientRows = await tx.select().from(schema.patients).where(eq(schema.patients.userId, userId)).limit(1);
        if (patientRows[0]) {
          await tx.delete(schema.appointments).where(eq(schema.appointments.patientId, patientRows[0].id));
          await tx.delete(schema.patients).where(eq(schema.patients.id, patientRows[0].id));
        }

        await tx.delete(schema.users).where(eq(schema.users.id, userId));
        return true;
      });
    }

    const uIdx = this.memUsers.findIndex((u) => u.id === userId);
    if (uIdx === -1) return false;

    const d = this.memDoctors.find((doc) => doc.userId === userId);
    if (d) {
      const hasActive = this.memAppointments.some(
        (a) => a.doctorId === d.id && a.status === "BOOKED"
      );
      if (hasActive) {
        throw new Error(
          "Cannot delete doctor account with active upcoming appointments. Please cancel or complete all pending patient consultations first."
        );
      }
      this.memAppointments = this.memAppointments.filter((a) => a.doctorId !== d.id);
      this.memAvailabilities = this.memAvailabilities.filter((av) => av.doctorId !== d.id);
      this.memDoctorLeaves = this.memDoctorLeaves.filter((l) => l.doctorId !== d.id);
      this.memDoctors = this.memDoctors.filter((doc) => doc.id !== d.id);
    }

    const p = this.memPatients.find((pat) => pat.userId === userId);
    if (p) {
      this.memAppointments = this.memAppointments.filter((a) => a.patientId !== p.id);
      this.memPatients = this.memPatients.filter((pat) => pat.id !== p.id);
    }

    this.memUsers.splice(uIdx, 1);
    return true;
  }

  public async clearAll(): Promise<void> {
    this.checkProductionDatabase();
    if (db) {
      await db.delete(schema.appointments);
      await db.delete(schema.availabilities);
      await db.delete(schema.doctorLeaves);
      await db.delete(schema.doctors);
      await db.delete(schema.patients);
      await db.delete(schema.users);
      return;
    }
    this.memAppointments = [];
    this.memAvailabilities = [];
    this.memDoctorLeaves = [];
    this.memDoctors = [];
    this.memPatients = [];
    this.memUsers = [];
  }

  // --- Login Attempts / Rate Limiting Operations ---
  public async recordFailedLogin(email: string): Promise<void> {
    this.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const id = `att-${crypto.randomUUID()}`;
    const now = new Date();

    if (db) {
      await db.insert(schema.loginAttempts).values({
        id,
        email: cleanEmail,
        attemptedAt: now,
      });
      return;
    }

    this.memLoginAttempts.push({ id, email: cleanEmail, attemptedAt: now });
  }

  public async getRecentFailedLoginCount(email: string, windowMinutes: number = 15): Promise<number> {
    this.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

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

    return this.memLoginAttempts.filter(
      (a) => a.email === cleanEmail && a.attemptedAt >= cutoff
    ).length;
  }

  public async clearFailedLogins(email: string): Promise<void> {
    this.checkProductionDatabase();
    const cleanEmail = email.trim().toLowerCase();

    if (db) {
      await db
        .delete(schema.loginAttempts)
        .where(eq(schema.loginAttempts.email, cleanEmail));
      return;
    }

    this.memLoginAttempts = this.memLoginAttempts.filter((a) => a.email !== cleanEmail);
  }
}

// In development, share one repository across route bundles and hot reloads; otherwise each compiled
// route gets its own in-memory store and, for example, a patient who just signed up "doesn't exist" on the next page.
declare global {
  // eslint-disable-next-line no-var
  var __medrellaRepository: MedrellaRepository | undefined;
}

export const dbRepo = globalThis.__medrellaRepository ?? new MedrellaRepository();
if (process.env.NODE_ENV !== "production") {
  globalThis.__medrellaRepository = dbRepo;
}
