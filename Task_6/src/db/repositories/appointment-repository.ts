import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../schema";
import { occupiesSeatSql, appointmentOccupiesSeat } from "@/lib/seat-occupancy";
import { sessionCapacity, sessionAppliesOnDate } from "@/lib/session-schedule";
import { buildInstantFromKolkataTime } from "@/lib/time";
import type { RepositoryContext } from "./context";
import type { IAppointmentRepository } from "./interfaces";
import type {
  AppointmentEntity,
  AppointmentStatus,
  DoctorEntity,
  PatientEntity,
  AvailabilityEntity,
  AgentEventEntity,
  PrescriptionEntity,
  PrescriptionMedicine,
} from "./types";

const DUPLICATE_BOOKING_MESSAGE = "You already have an appointment with this doctor on this day.";

async function lockDoctorDay(tx: any, doctorId: string, date: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointments:${doctorId}:${date}`}))`);
}

async function nextTokenNumber(tx: any, doctorId: string, date: string, sessionId: string | null): Promise<number> {
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
  let highest = 0;
  for (const a of appointments) {
    if (excludeId && a.id === excludeId) continue;
    if (a.doctorId === doctorId && a.appointmentDate === date) {
      if (!sessionId || a.sessionId === sessionId) {
        if (a.tokenNumber > highest) highest = a.tokenNumber;
      }
    }
  }
  return highest + 1;
}

async function hasActiveBookingThatDay(
  tx: any,
  patientId: string,
  doctorId: string,
  date: string,
  excludeId?: string
): Promise<boolean> {
  const conds = [
    eq(schema.appointments.patientId, patientId),
    eq(schema.appointments.doctorId, doctorId),
    eq(schema.appointments.appointmentDate, date),
    occupiesSeatSql(),
  ];
  if (excludeId) conds.push(sql`${schema.appointments.id} != ${excludeId}`);
  const existing = await tx.select().from(schema.appointments).where(and(...conds)).limit(1);
  return existing.length > 0;
}

export class AppointmentRepository implements IAppointmentRepository {
  constructor(private ctx: RepositoryContext) {}

  public async getAppointmentById(id: string): Promise<AppointmentEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
      return rows[0] as AppointmentEntity | undefined;
    }
    return this.ctx.getMem().appointments.find((a) => a.id === id);
  }

  public async getAllAppointments(): Promise<AppointmentEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.appointments).orderBy(desc(schema.appointments.createdAt));
      return rows as AppointmentEntity[];
    }
    return [...this.ctx.getMem().appointments];
  }

  public async getAppointmentsByPatientId(
    patientId: string
  ): Promise<(AppointmentEntity & { doctor: DoctorEntity })[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
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

    const mem = this.ctx.getMem();
    return mem.appointments
      .filter((a) => a.patientId === patientId)
      .map((a) => ({
        ...a,
        doctor: mem.doctors.find((d) => d.id === a.doctorId)!,
      }))
      .filter((a) => a.doctor !== undefined);
  }

  public async getAppointmentsByDoctorId(
    doctorId: string
  ): Promise<(AppointmentEntity & { patient: PatientEntity })[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
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

    const mem = this.ctx.getMem();
    return mem.appointments
      .filter((a) => a.doctorId === doctorId)
      .map((a) => ({
        ...a,
        patient: mem.patients.find((p) => p.id === a.patientId)!,
      }))
      .filter((a) => a.patient !== undefined);
  }

  public async createAppointment(
    data: Omit<AppointmentEntity, "id" | "createdAt" | "status" | "tokenNumber"> & {
      sessionId?: string | null;
      status?: AppointmentStatus;
      holdExpiresAt?: Date | null;
    }
  ): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }> {
    this.ctx.checkProductionDatabase();
    const id = `apt-${crypto.randomUUID()}`;
    const db = this.ctx.getDb();
    const mem = this.ctx.getMem();

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
          if (sessionRows[0]) capacity = sessionCapacity(sessionRows[0]);
        } else {
          const sessionRows = await tx
            .select()
            .from(schema.availabilities)
            .where(and(eq(schema.availabilities.doctorId, data.doctorId), eq(schema.availabilities.isActive, true)));
          const match = sessionRows.find(
            (s) =>
              sessionAppliesOnDate(s as AvailabilityEntity, data.appointmentDate) &&
              s.startTime <= data.startTime &&
              data.startTime < s.endTime
          );
          if (match) {
            sessionId = match.id;
            capacity = sessionCapacity(match);
          }
        }

        // 3a. One active booking per patient per doctor per day
        if (await hasActiveBookingThatDay(tx, data.patientId, data.doctorId, data.appointmentDate)) {
          return { success: false, message: DUPLICATE_BOOKING_MESSAGE };
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
              occupiesSeatSql()
            )
          );

        if (activeForSlot.length >= capacity) {
          return {
            success: false,
            message:
              capacity > 1
                ? "This slot has reached full capacity. Please choose another slot."
                : "This slot has already been booked by another patient. Please choose another time.",
          };
        }

        const tokenNumber = await nextTokenNumber(tx, data.doctorId, data.appointmentDate, sessionId);

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
            status: data.status ?? "BOOKED",
            tokenNumber,
            reason: data.reason ?? null,
            holdExpiresAt: data.holdExpiresAt ?? null,
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
    const onLeave = mem.doctorLeaves.some((l) => l.doctorId === data.doctorId && l.leaveDate === data.appointmentDate);
    const alreadyBooked = mem.appointments.some(
      (a) =>
        a.patientId === data.patientId &&
        a.doctorId === data.doctorId &&
        a.appointmentDate === data.appointmentDate &&
        appointmentOccupiesSeat(a)
    );
    if (alreadyBooked) {
      return { success: false, message: DUPLICATE_BOOKING_MESSAGE };
    }
    if (onLeave) {
      return { success: false, message: "Doctor is on leave on this date." };
    }

    let capacity = 1;
    let sessionId = data.sessionId || null;
    if (sessionId) {
      const sess = mem.availabilities.find((s) => s.id === sessionId);
      if (sess) capacity = sessionCapacity(sess);
    }

    const activeForSlot = mem.appointments.filter(
      (a) =>
        a.doctorId === data.doctorId &&
        a.appointmentDate === data.appointmentDate &&
        a.startTime === data.startTime &&
        appointmentOccupiesSeat(a)
    );

    if (activeForSlot.length >= capacity) {
      return {
        success: false,
        message:
          capacity > 1
            ? "This slot has reached full capacity. Please choose another slot."
            : "This slot has already been booked by another patient. Please choose another time.",
      };
    }

    const tokenNumber = nextMemoryToken(mem.appointments, data.doctorId, data.appointmentDate, sessionId);

    const newAppointment: AppointmentEntity = {
      ...data,
      id,
      sessionId,
      tokenNumber,
      status: data.status ?? "BOOKED",
      holdExpiresAt: data.holdExpiresAt ?? null,
      createdAt: new Date(),
    };

    mem.appointments.unshift(newAppointment);
    return { success: true, message: "Appointment booked successfully!", appointment: newAppointment };
  }

  public async updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    extra?: {
      cancelledBy?: "PATIENT" | "DOCTOR" | "SYSTEM" | null;
      cancelReason?: string | null;
    }
  ): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const updateValues: Record<string, any> = { status };
      if (extra?.cancelledBy !== undefined) updateValues.cancelledBy = extra.cancelledBy;
      if (extra?.cancelReason !== undefined) updateValues.cancelReason = extra.cancelReason;

      // If cancelling, prevent duplicate cancellations by asserting current status != CANCELLED
      const whereCondition =
        status === "CANCELLED"
          ? and(eq(schema.appointments.id, id), sql`${schema.appointments.status} != 'CANCELLED'`)
          : eq(schema.appointments.id, id);

      const res = await db.update(schema.appointments).set(updateValues).where(whereCondition);
      return ((res as any).rowCount ?? 1) > 0;
    }

    const apt = this.ctx.getMem().appointments.find((a) => a.id === id);
    if (!apt) return false;
    if (status === "CANCELLED" && apt.status === "CANCELLED") return false;

    apt.status = status;
    if (extra?.cancelledBy !== undefined) apt.cancelledBy = extra.cancelledBy;
    if (extra?.cancelReason !== undefined) apt.cancelReason = extra.cancelReason;
    return true;
  }

  public async rescheduleAppointment(data: {
    appointmentId: string;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
    newSessionId?: string | null;
    actorUserId: string;
    actorRole: "PATIENT" | "DOCTOR";
  }): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    const mem = this.ctx.getMem();

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

        if (await hasActiveBookingThatDay(tx, appt.patientId, appt.doctorId, data.newDate, appt.id)) {
          return { success: false, message: DUPLICATE_BOOKING_MESSAGE };
        }

        if (data.actorRole === "PATIENT") {
          const patientRows = await tx
            .select()
            .from(schema.patients)
            .where(eq(schema.patients.userId, data.actorUserId))
            .limit(1);
          if (!patientRows[0] || patientRows[0].id !== appt.patientId) {
            return { success: false, message: "Unauthorized. You may only reschedule your own appointments." };
          }

          const apptDateTime = buildInstantFromKolkataTime(appt.appointmentDate, appt.startTime);
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

        const leaveRows = await tx
          .select()
          .from(schema.doctorLeaves)
          .where(and(eq(schema.doctorLeaves.doctorId, appt.doctorId), eq(schema.doctorLeaves.leaveDate, data.newDate)))
          .limit(1);
        if (leaveRows.length > 0) {
          return { success: false, message: "Doctor is on leave on the selected date. Please choose another date." };
        }

        let capacity = 1;
        let newSessionId = data.newSessionId || null;
        if (newSessionId) {
          const sessionRows = await tx
            .select()
            .from(schema.availabilities)
            .where(eq(schema.availabilities.id, newSessionId))
            .limit(1);
          if (sessionRows[0]) capacity = sessionCapacity(sessionRows[0]);
        }

        const activeForNewSlot = await tx
          .select()
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.doctorId, appt.doctorId),
              eq(schema.appointments.appointmentDate, data.newDate),
              eq(schema.appointments.startTime, data.newStartTime),
              occupiesSeatSql(),
              sql`${schema.appointments.id} != ${appt.id}`
            )
          );

        if (activeForNewSlot.length >= capacity) {
          return {
            success: false,
            message: "The requested new slot is fully booked. Please select another time.",
          };
        }

        const newTokenNumber = await nextTokenNumber(tx, appt.doctorId, data.newDate, newSessionId);

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
    const appt = mem.appointments.find((a) => a.id === data.appointmentId);
    if (!appt) return { success: false, message: "Appointment record not found." };
    if (appt.status !== "BOOKED") return { success: false, message: "Only booked appointments can be rescheduled." };

    if (data.actorRole === "PATIENT") {
      const p = mem.patients.find((pt) => pt.userId === data.actorUserId);
      if (!p || p.id !== appt.patientId) return { success: false, message: "Unauthorized." };
      const apptDateTime = buildInstantFromKolkataTime(appt.appointmentDate, appt.startTime);
      if (apptDateTime.getTime() - Date.now() < 60 * 60 * 1000) {
        return { success: false, message: "Appointments can only be rescheduled at least 1 hour in advance." };
      }
    } else {
      const d = mem.doctors.find((doc) => doc.userId === data.actorUserId);
      if (!d || d.id !== appt.doctorId) return { success: false, message: "Unauthorized." };
    }

    if (
      mem.appointments.some(
        (a) =>
          a.id !== appt.id &&
          a.patientId === appt.patientId &&
          a.doctorId === appt.doctorId &&
          a.appointmentDate === data.newDate &&
          appointmentOccupiesSeat(a)
      )
    ) {
      return { success: false, message: DUPLICATE_BOOKING_MESSAGE };
    }

    if (mem.doctorLeaves.some((l) => l.doctorId === appt.doctorId && l.leaveDate === data.newDate)) {
      return { success: false, message: "Doctor is on leave on the selected date. Please choose another date." };
    }

    const memSession = data.newSessionId ? mem.availabilities.find((a) => a.id === data.newSessionId) : undefined;
    const memCapacity = memSession ? sessionCapacity(memSession) : 1;
    const takenSeats = mem.appointments.filter(
      (a) =>
        a.id !== appt.id &&
        a.doctorId === appt.doctorId &&
        a.appointmentDate === data.newDate &&
        a.startTime === data.newStartTime &&
        appointmentOccupiesSeat(a)
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
    appt.tokenNumber = nextMemoryToken(mem.appointments, appt.doctorId, data.newDate, appt.sessionId ?? null, appt.id);
    appt.rescheduledAt = new Date();
    appt.rescheduledBy = data.actorRole;

    return { success: true, message: "Appointment successfully rescheduled!", appointment: appt };
  }

  public async findActiveHoldsForPatient(patientId: string, doctorId: string, date: string): Promise<{ appointment: AppointmentEntity; payment?: any }[]> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({
          appointment: schema.appointments,
          payment: schema.payments,
        })
        .from(schema.appointments)
        .leftJoin(schema.payments, eq(schema.payments.appointmentId, schema.appointments.id))
        .where(
          and(
            eq(schema.appointments.patientId, patientId),
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.appointmentDate, date),
            eq(schema.appointments.status, "PENDING_PAYMENT"),
            sql`${schema.appointments.holdExpiresAt} > ${now.toISOString()}::timestamp`
          )
        );
      return rows.map((r) => ({
        appointment: r.appointment as AppointmentEntity,
        payment: r.payment ?? undefined,
      }));
    }

    const mem = this.ctx.getMem();
    return mem.appointments
      .filter(
        (a) =>
          a.patientId === patientId &&
          a.doctorId === doctorId &&
          a.appointmentDate === date &&
          a.status === "PENDING_PAYMENT" &&
          a.holdExpiresAt &&
          new Date(a.holdExpiresAt).getTime() > now.getTime()
      )
      .map((appointment) => ({
        appointment,
        payment: mem.payments.find((p) => p.appointmentId === appointment.id),
      }));
  }

  public async getExpiredHolds(now: Date = new Date()): Promise<AppointmentEntity[]> {
    this.ctx.checkProductionDatabase();
    const nowIso = now.toISOString();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.status, "PENDING_PAYMENT"),
            sql`${schema.appointments.holdExpiresAt} <= ${nowIso}::timestamp`
          )
        );
      return rows as AppointmentEntity[];
    }
    return this.ctx.getMem().appointments.filter(
      (a) => a.status === "PENDING_PAYMENT" && a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() <= now.getTime()
    );
  }

  public async expireAppointmentHold(appointmentId: string): Promise<boolean> {
    return this.updateAppointmentStatus(appointmentId, "EXPIRED", {
      cancelledBy: "SYSTEM",
      cancelReason: "Payment hold timed out.",
    });
  }

  // --- Healthcare agent audit trail ---

  public async createAgentEvent(input: Omit<AgentEventEntity, "createdAt">): Promise<AgentEventEntity> {
    this.ctx.checkProductionDatabase();
    const entry: AgentEventEntity = { ...input, createdAt: new Date() };
    const db = this.ctx.getDb();
    if (db) {
      const [row] = await db.insert(schema.agentEvents).values(entry).returning();
      return row as AgentEventEntity;
    }
    this.ctx.getMem().agentEvents.push(entry);
    return entry;
  }

  public async getAgentEventsByUserId(userId: string, limit: number = 50): Promise<AgentEventEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.agentEvents)
        .where(eq(schema.agentEvents.userId, userId))
        .orderBy(desc(schema.agentEvents.createdAt))
        .limit(limit);
      return rows as AgentEventEntity[];
    }
    return this.ctx.getMem().agentEvents
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // --- Prescriptions (one per completed visit) ---

  public async upsertPrescription(input: {
    appointmentId: string;
    doctorId: string;
    patientId: string;
    medicines: PrescriptionMedicine[];
    notes?: string | null;
  }): Promise<PrescriptionEntity> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      const [row] = await db
        .insert(schema.prescriptions)
        .values({
          id: `rx_${crypto.randomUUID()}`,
          appointmentId: input.appointmentId,
          doctorId: input.doctorId,
          patientId: input.patientId,
          medicines: input.medicines,
          notes: input.notes ?? null,
        })
        .onConflictDoUpdate({
          target: schema.prescriptions.appointmentId,
          set: { medicines: input.medicines, notes: input.notes ?? null, updatedAt: now },
        })
        .returning();
      return row as PrescriptionEntity;
    }
    const mem = this.ctx.getMem();
    const existing = mem.prescriptions.find((p) => p.appointmentId === input.appointmentId);
    if (existing) {
      existing.medicines = input.medicines;
      existing.notes = input.notes ?? null;
      existing.updatedAt = now;
      return existing;
    }
    const created: PrescriptionEntity = {
      id: `rx_${crypto.randomUUID()}`,
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      medicines: input.medicines,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    mem.prescriptions.push(created);
    return created;
  }

  public async getPrescriptionByAppointmentId(appointmentId: string): Promise<PrescriptionEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.prescriptions)
        .where(eq(schema.prescriptions.appointmentId, appointmentId))
        .limit(1);
      return rows[0] as PrescriptionEntity | undefined;
    }
    return this.ctx.getMem().prescriptions.find((p) => p.appointmentId === appointmentId);
  }

  public async getPrescriptionsByPatientId(
    patientId: string
  ): Promise<(PrescriptionEntity & { doctor: DoctorEntity; appointment: AppointmentEntity })[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ rx: schema.prescriptions, doctor: schema.doctors, appointment: schema.appointments })
        .from(schema.prescriptions)
        .innerJoin(schema.doctors, eq(schema.prescriptions.doctorId, schema.doctors.id))
        .innerJoin(schema.appointments, eq(schema.prescriptions.appointmentId, schema.appointments.id))
        .where(eq(schema.prescriptions.patientId, patientId))
        .orderBy(desc(schema.prescriptions.createdAt));
      return rows.map((r) => ({
        ...(r.rx as PrescriptionEntity),
        doctor: {
          ...r.doctor,
          consultationFee: Number(r.doctor.consultationFee ?? 500),
          experienceYears: Number(r.doctor.experienceYears ?? 0),
          licenseNumber: r.doctor.licenseNumber ?? "REG-PENDING",
        } as DoctorEntity,
        appointment: r.appointment as AppointmentEntity,
      }));
    }
    const mem = this.ctx.getMem();
    return mem.prescriptions
      .filter((p) => p.patientId === patientId)
      .map((p) => {
        const doctor = mem.doctors.find((d) => d.id === p.doctorId);
        const appointment = mem.appointments.find((a) => a.id === p.appointmentId);
        return doctor && appointment ? { ...p, doctor, appointment } : null;
      })
      .filter((x): x is PrescriptionEntity & { doctor: DoctorEntity; appointment: AppointmentEntity } => x !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async getAppointmentsInRange(
    fromDate: string,
    toDate: string,
    statuses: AppointmentStatus[]
  ): Promise<AppointmentEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            gte(schema.appointments.appointmentDate, fromDate),
            lte(schema.appointments.appointmentDate, toDate),
            inArray(schema.appointments.status, statuses)
          )
        );
      return rows as AppointmentEntity[];
    }
    return this.ctx.getMem().appointments.filter(
      (a) => a.appointmentDate >= fromDate && a.appointmentDate <= toDate && statuses.includes(a.status)
    );
  }
}
