import { eq, and, desc, sql, gte } from "drizzle-orm";
import crypto from "crypto";
import { db, isPostgresConfigured, assertProductionDatabase } from "./index";
import * as schema from "./schema";
import { hashPassword } from "@/lib/auth-crypto";
import { RUBY_HALL_SPECIALISTS } from "./specialists-catalog";

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
}

export interface AvailabilityEntity {
  id: string;
  doctorId: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  slotDurationMinutes: number;
  isActive: boolean;
}

export interface AppointmentEntity {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  status: "BOOKED" | "COMPLETED" | "CANCELLED";
  reason?: string | null;
  createdAt: Date;
}

/**
 * Production Database Repository for Medrella Healthcare.
 * - Queries Neon PostgreSQL via Drizzle ORM when DATABASE_URL is configured.
 * - Provides an in-memory dev fallback when offline / unconfigured so local tests pass without crash.
 */
class MedrellaRepository {
  private memUsers: UserEntity[] = [];
  private memPatients: PatientEntity[] = [];
  private memDoctors: DoctorEntity[] = [];
  private memAvailabilities: AvailabilityEntity[] = [];
  private memAppointments: AppointmentEntity[] = [];
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

    const defaultPasswordHash = hashPassword("password123");

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
      });

      d.days.forEach((day) => {
        this.memAvailabilities.push({
          id: `avail-${d.id}-${day}`,
          doctorId: d.id,
          dayOfWeek: day,
          startTime: d.start,
          endTime: d.end,
          slotDurationMinutes: d.duration,
          isActive: true,
        });
      });
    });
  }

  // --- User Operations ---
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

  public async getUserById(id: string): Promise<UserEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1);
      return rows[0] as UserEntity | undefined;
    }
    return this.memUsers.find((u) => u.id === id);
  }

  public async createUser(user: Omit<UserEntity, "createdAt">): Promise<UserEntity> {
    this.checkProductionDatabase();
    const newUser: UserEntity = { ...user, email: user.email.toLowerCase(), createdAt: new Date() };
    if (db) {
      try {
        await db.insert(schema.users).values({
          id: newUser.id,
          email: newUser.email,
          passwordHash: newUser.passwordHash,
          role: newUser.role,
          isActive: newUser.isActive,
        });
        return newUser;
      } catch (err: any) {
        if (err?.code === "23505") {
          throw new Error("An account with this email already exists.");
        }
        throw err;
      }
    }
    this.memUsers.push(newUser);
    return newUser;
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

  public async getAllPatients(): Promise<PatientEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db.select().from(schema.patients);
      return rows as PatientEntity[];
    }
    return [...this.memPatients];
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
        consultationFee: Number(rows[0].consultationFee),
      };
    }
    return this.memDoctors.find((d) => d.userId === userId);
  }

  public async getDoctorById(id: string): Promise<DoctorEntity | undefined> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctors)
        .where(eq(schema.doctors.id, id))
        .limit(1);
      if (!rows[0]) return undefined;
      return {
        ...rows[0],
        consultationFee: Number(rows[0].consultationFee),
      };
    }
    return this.memDoctors.find((d) => d.id === id);
  }

  public async getAllDoctors(specialization?: string): Promise<DoctorEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      let query = db.select().from(schema.doctors);
      if (specialization && specialization.toLowerCase() !== "all") {
        const rows = await query.where(eq(schema.doctors.specialization, specialization));
        return rows.map((d) => ({ ...d, consultationFee: Number(d.consultationFee) }));
      }
      const rows = await query;
      return rows.map((d) => ({ ...d, consultationFee: Number(d.consultationFee) }));
    }

    if (!specialization || specialization.toLowerCase() === "all") {
      return [...this.memDoctors];
    }
    return this.memDoctors.filter(
      (d) => d.specialization.toLowerCase() === specialization.toLowerCase()
    );
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
        consultationFee: doctor.consultationFee.toString(),
        bio: doctor.bio ?? null,
      });
      return doctor;
    }
    this.memDoctors.push(doctor);
    return doctor;
  }

  // --- Availability Operations ---
  public async getAvailabilitiesByDoctorId(doctorId: string): Promise<AvailabilityEntity[]> {
    this.checkProductionDatabase();
    if (db) {
      const rows = await db
        .select()
        .from(schema.availabilities)
        .where(eq(schema.availabilities.doctorId, doctorId));
      return rows as AvailabilityEntity[];
    }
    return this.memAvailabilities.filter((a) => a.doctorId === doctorId);
  }

  public async updateDoctorAvailability(
    doctorId: string,
    dayOfWeek: AvailabilityEntity["dayOfWeek"],
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId" | "dayOfWeek">>
  ): Promise<AvailabilityEntity> {
    this.checkProductionDatabase();
    const id = `avail-${doctorId}-${dayOfWeek}`;
    const startTime = updates.startTime || "09:00";
    const endTime = updates.endTime || "17:00";
    const slotDurationMinutes = updates.slotDurationMinutes || 30;
    const isActive = updates.isActive ?? true;

    if (db) {
      await db
        .insert(schema.availabilities)
        .values({
          id,
          doctorId,
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMinutes,
          isActive,
        })
        .onConflictDoUpdate({
          target: [schema.availabilities.doctorId, schema.availabilities.dayOfWeek],
          set: {
            startTime,
            endTime,
            slotDurationMinutes,
            isActive,
          },
        });

      return { id, doctorId, dayOfWeek, startTime, endTime, slotDurationMinutes, isActive };
    }

    let item = this.memAvailabilities.find(
      (a) => a.doctorId === doctorId && a.dayOfWeek === dayOfWeek
    );
    if (!item) {
      item = { id, doctorId, dayOfWeek, startTime, endTime, slotDurationMinutes, isActive };
      this.memAvailabilities.push(item);
    } else {
      Object.assign(item, updates);
    }
    return item;
  }

  // --- Dynamic Slot Computation Engine ---
  public async computeAvailableSlots(
    doctorId: string,
    dateString: string
  ): Promise<{ startTime: string; endTime: string; isBooked: boolean }[]> {
    this.checkProductionDatabase();
    const date = new Date(dateString + "T00:00:00");
    const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday ...
    const dayMap: Array<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"> = [
      "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"
    ];
    const targetDay = dayMap[dayIndex];

    let availability: AvailabilityEntity | undefined;
    let bookedSlots: string[] = [];

    if (db) {
      const availRows = await db
        .select()
        .from(schema.availabilities)
        .where(
          and(
            eq(schema.availabilities.doctorId, doctorId),
            eq(schema.availabilities.dayOfWeek, targetDay),
            eq(schema.availabilities.isActive, true)
          )
        )
        .limit(1);

      availability = availRows[0] as AvailabilityEntity | undefined;

      const apptRows = await db
        .select({ startTime: schema.appointments.startTime })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.appointmentDate, dateString),
            sql`${schema.appointments.status} != 'CANCELLED'`
          )
        );

      bookedSlots = apptRows.map((a) => a.startTime);
    } else {
      availability = this.memAvailabilities.find(
        (a) => a.doctorId === doctorId && a.dayOfWeek === targetDay && a.isActive
      );

      bookedSlots = this.memAppointments
        .filter(
          (apt) =>
            apt.doctorId === doctorId &&
            apt.appointmentDate === dateString &&
            apt.status !== "CANCELLED"
        )
        .map((apt) => apt.startTime);
    }

    if (!availability) {
      return []; // Doctor not working on this day
    }

    const { startTime, endTime, slotDurationMinutes } = availability;
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    const slots: { startTime: string; endTime: string; isBooked: boolean }[] = [];

    for (let current = startMinutes; current + slotDurationMinutes <= endMinutes; current += slotDurationMinutes) {
      const slotStartH = Math.floor(current / 60).toString().padStart(2, "0");
      const slotStartM = (current % 60).toString().padStart(2, "0");
      const slotStart = `${slotStartH}:${slotStartM}`;

      const slotEndTotal = current + slotDurationMinutes;
      const slotEndH = Math.floor(slotEndTotal / 60).toString().padStart(2, "0");
      const slotEndM = (slotEndTotal % 60).toString().padStart(2, "0");
      const slotEnd = `${slotEndH}:${slotEndM}`;

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
        isBooked: bookedSlots.includes(slotStart),
      });
    }

    return slots;
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
    data: Omit<AppointmentEntity, "id" | "createdAt" | "status">
  ): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }> {
    this.checkProductionDatabase();
    const id = `apt-${crypto.randomUUID()}`;

    if (db) {
      try {
        const [inserted] = await db
          .insert(schema.appointments)
          .values({
            id,
            patientId: data.patientId,
            doctorId: data.doctorId,
            appointmentDate: data.appointmentDate,
            startTime: data.startTime,
            endTime: data.endTime,
            status: "BOOKED",
            reason: data.reason ?? null,
          })
          .returning();

        return {
          success: true,
          message: "Appointment booked successfully!",
          appointment: inserted as AppointmentEntity,
        };
      } catch (err: any) {
        // Postgres unique violation code 23505 (triggers when partial index doctor_slot_active_unique matches)
        if (err?.code === "23505" || err?.message?.includes("doctor_slot_active_unique")) {
          return {
            success: false,
            message: "This slot has already been booked by another patient. Please choose another time.",
          };
        }
        throw err;
      }
    }

    // In-memory concurrency check
    const existing = this.memAppointments.find(
      (a) =>
        a.doctorId === data.doctorId &&
        a.appointmentDate === data.appointmentDate &&
        a.startTime === data.startTime &&
        a.status !== "CANCELLED"
    );

    if (existing) {
      return { success: false, message: "This slot has already been booked by another patient." };
    }

    const newAppointment: AppointmentEntity = {
      ...data,
      id,
      status: "BOOKED",
      createdAt: new Date(),
    };

    this.memAppointments.unshift(newAppointment);
    return { success: true, message: "Appointment booked successfully!", appointment: newAppointment };
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
          consultationFee: Number(r.doctor.consultationFee),
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
    status: "BOOKED" | "COMPLETED" | "CANCELLED"
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
      // In Neon Postgres, seed specialists if empty
      const defaultPasswordHash = hashPassword("password123");
      for (const d of RUBY_HALL_SPECIALISTS) {
        await db
          .insert(schema.users)
          .values({
            id: d.userId,
            email: d.email.toLowerCase(),
            passwordHash: defaultPasswordHash,
            role: "DOCTOR",
            isActive: true,
          })
          .onConflictDoNothing();

        await db
          .insert(schema.doctors)
          .values({
            id: d.id,
            userId: d.userId,
            firstName: d.firstName,
            lastName: d.lastName,
            specialization: d.specialization,
            phone: d.phone,
            licenseNumber: d.licenseNumber,
            experienceYears: d.experienceYears,
            consultationFee: d.consultationFee.toString(),
            bio: d.bio,
          })
          .onConflictDoNothing();

        for (const day of d.days) {
          await db
            .insert(schema.availabilities)
            .values({
              id: `avail-${d.id}-${day}`,
              doctorId: d.id,
              dayOfWeek: day,
              startTime: d.start,
              endTime: d.end,
              slotDurationMinutes: d.duration,
              isActive: true,
            })
            .onConflictDoNothing();
        }
      }
      return;
    }
    this.seedMemory();
  }

  public async deleteUserComplete(userId: string): Promise<boolean> {
    this.checkProductionDatabase();
    if (db) {
      return await db.transaction(async (tx) => {
        // Look up user role and corresponding profile
        const userRows = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (!userRows[0]) return false;

        const doctorRows = await tx.select().from(schema.doctors).where(eq(schema.doctors.userId, userId)).limit(1);
        if (doctorRows[0]) {
          // Guard: block deletion if the doctor has active booked appointments
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

    // In-memory removal
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
      this.memDoctors = this.memDoctors.filter((doc) => doc.id !== d.id);
    }

    const p = this.memPatients.find((pt) => pt.userId === userId);
    if (p) {
      this.memAppointments = this.memAppointments.filter((a) => a.patientId !== p.id);
      this.memPatients = this.memPatients.filter((pt) => pt.id !== p.id);
    }

    this.memUsers.splice(uIdx, 1);
    return true;
  }

  public async recordFailedLogin(email: string): Promise<void> {
    this.checkProductionDatabase();
    const normalizedEmail = email.toLowerCase().trim();
    const id = `att-${crypto.randomUUID()}`;
    const now = new Date();

    if (db) {
      await db.insert(schema.loginAttempts).values({
        id,
        email: normalizedEmail,
        attemptedAt: now,
      });
      return;
    }

    this.memLoginAttempts.push({ id, email: normalizedEmail, attemptedAt: now });
  }

  public async getRecentFailedLoginCount(email: string, windowMinutes: number = 15): Promise<number> {
    this.checkProductionDatabase();
    const normalizedEmail = email.toLowerCase().trim();
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    if (db) {
      const rows = await db
        .select()
        .from(schema.loginAttempts)
        .where(
          and(
            eq(schema.loginAttempts.email, normalizedEmail),
            gte(schema.loginAttempts.attemptedAt, cutoff)
          )
        );
      return rows.length;
    }

    return this.memLoginAttempts.filter(
      (att) => att.email === normalizedEmail && att.attemptedAt >= cutoff
    ).length;
  }

  public async clearFailedLogins(email: string): Promise<void> {
    this.checkProductionDatabase();
    const normalizedEmail = email.toLowerCase().trim();

    if (db) {
      await db
        .delete(schema.loginAttempts)
        .where(eq(schema.loginAttempts.email, normalizedEmail));
      return;
    }

    this.memLoginAttempts = this.memLoginAttempts.filter((att) => att.email !== normalizedEmail);
  }

  public async clearAll(): Promise<void> {
    if (db) {
      await db.delete(schema.loginAttempts);
      await db.delete(schema.appointments);
      await db.delete(schema.availabilities);
      await db.delete(schema.patients);
      await db.delete(schema.doctors);
      await db.delete(schema.users);
      return;
    }
    this.memUsers = [];
    this.memPatients = [];
    this.memDoctors = [];
    this.memAvailabilities = [];
    this.memAppointments = [];
    this.memLoginAttempts = [];
  }
}

// Global Singleton
declare global {
  // eslint-disable-next-line no-var
  var __medrella_repository__: MedrellaRepository | undefined;
}

export const dbRepo = globalThis.__medrella_repository__ || new MedrellaRepository();
if (process.env.NODE_ENV !== "production") {
  globalThis.__medrella_repository__ = dbRepo;
}
