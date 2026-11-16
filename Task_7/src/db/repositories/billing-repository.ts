import { eq, and, desc, inArray, lte, sql } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../schema";
import { occupiesSeatSql, appointmentOccupiesSeat } from "@/lib/seat-occupancy";
import { sessionCapacity } from "@/lib/session-schedule";
import type { RepositoryContext } from "./context";
import type { IBillingRepository } from "./interfaces";
import type {
  PaymentEntity,
  PaymentStatus,
  RefundEntity,
  RefundStatus,
  PaymentEventEntity,
  AppointmentEntity,
  DoctorEntity,
} from "./types";

async function lockDoctorDay(tx: any, doctorId: string, date: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`appointments:${doctorId}:${date}`}))`);
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

export class BillingRepository implements IBillingRepository {
  constructor(private ctx: RepositoryContext) {}

  public async getPaymentById(id: string): Promise<PaymentEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).limit(1);
      return rows[0] as PaymentEntity | undefined;
    }
    return this.ctx.getMem().payments.find((p) => p.id === id);
  }

  public async getPaymentByAppointmentId(appointmentId: string): Promise<PaymentEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.appointmentId, appointmentId))
        .orderBy(desc(schema.payments.createdAt))
        .limit(1);
      return rows[0] as PaymentEntity | undefined;
    }
    return this.ctx.getMem().payments.find((p) => p.appointmentId === appointmentId);
  }

  public async createPayment(
    data: Omit<PaymentEntity, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<PaymentEntity> {
    this.ctx.checkProductionDatabase();
    const id = data.id || `pay-${crypto.randomUUID()}`;
    const now = new Date();
    const payment: PaymentEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const db = this.ctx.getDb();
    if (db) {
      const [inserted] = await db
        .insert(schema.payments)
        .values({
          id: payment.id,
          appointmentId: payment.appointmentId,
          patientId: payment.patientId,
          provider: payment.provider,
          providerOrderId: payment.providerOrderId,
          providerPaymentId: payment.providerPaymentId ?? null,
          amountPaise: payment.amountPaise,
          currency: payment.currency || "INR",
          status: payment.status,
          receiptNo: payment.receiptNo,
          failureReason: payment.failureReason ?? null,
          expiresAt: payment.expiresAt ?? null,
          paidAt: payment.paidAt ?? null,
        })
        .returning();
      return inserted as PaymentEntity;
    }

    this.ctx.getMem().payments.push(payment);
    return payment;
  }

  public async updatePaymentStatus(
    id: string,
    status: PaymentStatus,
    extra?: {
      providerPaymentId?: string | null;
      failureReason?: string | null;
      paidAt?: Date | null;
    }
  ): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      const updateValues: Record<string, any> = { status, updatedAt: now };
      if (extra?.providerPaymentId !== undefined) updateValues.providerPaymentId = extra.providerPaymentId;
      if (extra?.failureReason !== undefined) updateValues.failureReason = extra.failureReason;
      if (extra?.paidAt !== undefined) updateValues.paidAt = extra.paidAt;
      const res = await db.update(schema.payments).set(updateValues).where(eq(schema.payments.id, id));
      return ((res as any).rowCount ?? 1) > 0;
    }

    const pay = this.ctx.getMem().payments.find((p) => p.id === id);
    if (!pay) return false;
    pay.status = status;
    pay.updatedAt = now;
    if (extra?.providerPaymentId !== undefined) pay.providerPaymentId = extra.providerPaymentId;
    if (extra?.failureReason !== undefined) pay.failureReason = extra.failureReason;
    if (extra?.paidAt !== undefined) pay.paidAt = extra.paidAt;
    return true;
  }

  public async createRefund(
    data: (Omit<RefundEntity, "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date; updatedAt?: Date }) |
          (Omit<RefundEntity, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date; updatedAt?: Date })
  ): Promise<RefundEntity> {
    this.ctx.checkProductionDatabase();
    const id = data.id || `ref-${crypto.randomUUID()}`;
    const now = new Date();
    const refund: RefundEntity = {
      ...data,
      id,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };

    const db = this.ctx.getDb();
    if (db) {
      try {
        const [inserted] = await db
          .insert(schema.refunds)
          .values({
            id: refund.id,
            paymentId: refund.paymentId,
            appointmentId: refund.appointmentId,
            amountPaise: refund.amountPaise,
            reason: refund.reason ?? null,
            status: refund.status,
            providerRefundId: refund.providerRefundId ?? null,
            idempotencyKey: refund.idempotencyKey,
            failureReason: refund.failureReason ?? null,
          })
          .returning();
        return inserted as RefundEntity;
      } catch (err: any) {
        if (err?.code === "23505" || err?.message?.includes("refunds_idempotency_key_unique") || err?.message?.includes("unique constraint")) {
          const existing = await this.getRefundByIdempotencyKey(refund.idempotencyKey);
          if (existing) return existing;
        }
        throw err;
      }
    }

    const mem = this.ctx.getMem();
    const existing = mem.refunds.find((r) => r.idempotencyKey === refund.idempotencyKey);
    if (existing) {
      return existing;
    }
    mem.refunds.push(refund);
    return refund;
  }

  public async getRefundsByPaymentId(paymentId: string): Promise<RefundEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.paymentId, paymentId))
        .orderBy(desc(schema.refunds.createdAt));
      return rows as RefundEntity[];
    }
    return this.ctx.getMem().refunds.filter((r) => r.paymentId === paymentId);
  }

  public async getRefundByIdempotencyKey(key: string): Promise<RefundEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.idempotencyKey, key))
        .limit(1);
      return rows[0] as RefundEntity | undefined;
    }
    return this.ctx.getMem().refunds.find((r) => r.idempotencyKey === key);
  }

  public async updateRefundStatus(
    id: string,
    status: RefundStatus,
    extra?: {
      providerRefundId?: string | null;
      failureReason?: string | null;
    }
  ): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      const updateValues: Record<string, any> = { status, updatedAt: now };
      if (extra?.providerRefundId !== undefined) updateValues.providerRefundId = extra.providerRefundId;
      if (extra?.failureReason !== undefined) updateValues.failureReason = extra.failureReason;
      const res = await db.update(schema.refunds).set(updateValues).where(eq(schema.refunds.id, id));
      return ((res as any).rowCount ?? 1) > 0;
    }

    const ref = this.ctx.getMem().refunds.find((r) => r.id === id);
    if (!ref) return false;
    ref.status = status;
    ref.updatedAt = now;
    if (extra?.providerRefundId !== undefined) ref.providerRefundId = extra.providerRefundId;
    if (extra?.failureReason !== undefined) ref.failureReason = extra.failureReason;
    return true;
  }

  public async recordPaymentEvent(
    event: Omit<PaymentEventEntity, "processedAt">
  ): Promise<{ duplicate: boolean; event: PaymentEventEntity }> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const newEvent: PaymentEventEntity = {
      ...event,
      processedAt: now,
    };

    const db = this.ctx.getDb();
    if (db) {
      const existing = await db
        .select()
        .from(schema.paymentEvents)
        .where(
          and(
            eq(schema.paymentEvents.provider, event.provider),
            eq(schema.paymentEvents.providerEventId, event.providerEventId)
          )
        )
        .limit(1);
      if (existing[0]) {
        return { duplicate: true, event: existing[0] as PaymentEventEntity };
      }

      try {
        const [inserted] = await db
          .insert(schema.paymentEvents)
          .values({
            id: newEvent.id,
            provider: newEvent.provider,
            providerEventId: newEvent.providerEventId,
            type: newEvent.type,
            payload: newEvent.payload ?? null,
            outcome: newEvent.outcome ?? null,
          })
          .returning();
        return { duplicate: false, event: inserted as PaymentEventEntity };
      } catch (err: any) {
        const fallback = await db
          .select()
          .from(schema.paymentEvents)
          .where(
            and(
              eq(schema.paymentEvents.provider, event.provider),
              eq(schema.paymentEvents.providerEventId, event.providerEventId)
            )
          )
          .limit(1);
        if (fallback[0]) {
          return { duplicate: true, event: fallback[0] as PaymentEventEntity };
        }
        throw err;
      }
    }

    const mem = this.ctx.getMem();
    const existing = mem.paymentEvents.find(
      (e) => e.provider === event.provider && e.providerEventId === event.providerEventId
    );
    if (existing) {
      return { duplicate: true, event: existing };
    }
    mem.paymentEvents.push(newEvent);
    return { duplicate: false, event: newEvent };
  }

  public async confirmPaymentAndBookAppointment(params: {
    paymentId: string;
    providerPaymentId?: string;
    appointmentId: string;
  }): Promise<{
    success: boolean;
    message: string;
    appointment?: AppointmentEntity;
    payment?: PaymentEntity;
    wasExpired?: boolean;
    refundNeeded?: boolean;
  }> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    const mem = this.ctx.getMem();

    if (db) {
      return await db.transaction(async (tx) => {
        const [appt] = await tx
          .select()
          .from(schema.appointments)
          .where(eq(schema.appointments.id, params.appointmentId))
          .limit(1);

        if (!appt) {
          return { success: false, message: "Appointment not found." };
        }

        const [payment] = await tx
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, params.paymentId))
          .limit(1);

        if (!payment) {
          return { success: false, message: "Payment record not found." };
        }

        if (appt.status === "BOOKED" && payment.status === "PAID") {
          return {
            success: true,
            message: "Appointment already confirmed.",
            appointment: appt as AppointmentEntity,
            payment: payment as PaymentEntity,
          };
        }

        await lockDoctorDay(tx, appt.doctorId, appt.appointmentDate);

        if (appt.status === "CANCELLED") {
          const [paidPayment] = await tx
            .update(schema.payments)
            .set({
              status: "PAID",
              providerPaymentId: params.providerPaymentId ?? payment.providerPaymentId,
              paidAt: payment.paidAt ?? now,
              updatedAt: now,
            })
            .where(eq(schema.payments.id, payment.id))
            .returning();
          return {
            success: false,
            message: "This booking was cancelled before the payment completed. A full refund is required.",
            appointment: appt as AppointmentEntity,
            payment: paidPayment as PaymentEntity,
            refundNeeded: true,
          };
        }

        const isHoldExpired = Boolean(
          appt.status === "EXPIRED" ||
          (appt.status === "PENDING_PAYMENT" && appt.holdExpiresAt && appt.holdExpiresAt <= now)
        );

        if (isHoldExpired) {
          let capacity = 1;
          if (appt.sessionId) {
            const [sess] = await tx
              .select()
              .from(schema.availabilities)
              .where(eq(schema.availabilities.id, appt.sessionId))
              .limit(1);
            if (sess) capacity = sessionCapacity(sess);
          }

          const activeForSlot = await tx
            .select()
            .from(schema.appointments)
            .where(
              and(
                eq(schema.appointments.doctorId, appt.doctorId),
                eq(schema.appointments.appointmentDate, appt.appointmentDate),
                eq(schema.appointments.startTime, appt.startTime),
                occupiesSeatSql(now),
                sql`${schema.appointments.id} != ${appt.id}`
              )
            );

          const hasDuplicate = await hasActiveBookingThatDay(
            tx,
            appt.patientId,
            appt.doctorId,
            appt.appointmentDate,
            appt.id
          );

          const [leave] = await tx
            .select()
            .from(schema.doctorLeaves)
            .where(
              and(
                eq(schema.doctorLeaves.doctorId, appt.doctorId),
                eq(schema.doctorLeaves.leaveDate, appt.appointmentDate)
              )
            )
            .limit(1);

          if (activeForSlot.length >= capacity || hasDuplicate || leave) {
            const [paidPayment] = await tx
              .update(schema.payments)
              .set({
                status: "PAID",
                providerPaymentId: params.providerPaymentId ?? payment.providerPaymentId,
                paidAt: payment.paidAt ?? now,
                updatedAt: now,
              })
              .where(eq(schema.payments.id, payment.id))
              .returning();

            await tx
              .update(schema.appointments)
              .set({ status: "EXPIRED" })
              .where(eq(schema.appointments.id, appt.id));

            return {
              success: false,
              message: "Payment received, but your reserved seat has expired and is no longer available. A full refund has been initiated.",
              appointment: { ...appt, status: "EXPIRED" } as AppointmentEntity,
              payment: paidPayment as PaymentEntity,
              wasExpired: true,
              refundNeeded: true,
            };
          }
        }

        const [confirmedAppt] = await tx
          .update(schema.appointments)
          .set({
            status: "BOOKED",
            holdExpiresAt: null,
          })
          .where(eq(schema.appointments.id, appt.id))
          .returning();

        const [paidPayment] = await tx
          .update(schema.payments)
          .set({
            status: "PAID",
            providerPaymentId: params.providerPaymentId ?? payment.providerPaymentId,
            paidAt: payment.paidAt ?? now,
            updatedAt: now,
          })
          .where(eq(schema.payments.id, payment.id))
          .returning();

        return {
          success: true,
          message: isHoldExpired ? "Hold was expired, but seat was still free! Booking confirmed." : "Booking and payment confirmed successfully!",
          appointment: confirmedAppt as AppointmentEntity,
          payment: paidPayment as PaymentEntity,
          wasExpired: isHoldExpired,
        };
      });
    }

    // In-memory fallback
    const appt = mem.appointments.find((a) => a.id === params.appointmentId);
    if (!appt) return { success: false, message: "Appointment not found." };
    const payment = mem.payments.find((p) => p.id === params.paymentId);
    if (!payment) return { success: false, message: "Payment record not found." };

    if (appt.status === "BOOKED" && payment.status === "PAID") {
      return { success: true, message: "Appointment already confirmed.", appointment: appt, payment };
    }

    if (appt.status === "CANCELLED") {
      payment.status = "PAID";
      payment.providerPaymentId = params.providerPaymentId ?? payment.providerPaymentId;
      payment.paidAt = payment.paidAt ?? now;
      payment.updatedAt = now;
      return {
        success: false,
        message: "This booking was cancelled before the payment completed. A full refund is required.",
        appointment: appt,
        payment,
        refundNeeded: true,
      };
    }

    const isHoldExpired = Boolean(
      appt.status === "EXPIRED" ||
      (appt.status === "PENDING_PAYMENT" && appt.holdExpiresAt && new Date(appt.holdExpiresAt).getTime() <= now.getTime())
    );

    if (isHoldExpired) {
      const activeForSlot = mem.appointments.filter(
        (a) =>
          a.id !== appt.id &&
          a.doctorId === appt.doctorId &&
          a.appointmentDate === appt.appointmentDate &&
          a.startTime === appt.startTime &&
          appointmentOccupiesSeat(a, now)
      );

      const hasDuplicate = mem.appointments.some(
        (a) =>
          a.id !== appt.id &&
          a.patientId === appt.patientId &&
          a.doctorId === appt.doctorId &&
          a.appointmentDate === appt.appointmentDate &&
          appointmentOccupiesSeat(a, now)
      );

      const leave = mem.doctorLeaves.some((l) => l.doctorId === appt.doctorId && l.leaveDate === appt.appointmentDate);

      let capacity = 1;
      if (appt.sessionId) {
        const sess = mem.availabilities.find((s) => s.id === appt.sessionId);
        if (sess) capacity = sessionCapacity(sess);
      }

      if (activeForSlot.length >= capacity || hasDuplicate || leave) {
        payment.status = "PAID";
        payment.providerPaymentId = params.providerPaymentId ?? payment.providerPaymentId;
        payment.paidAt = payment.paidAt ?? now;
        payment.updatedAt = now;
        appt.status = "EXPIRED";

        return {
          success: false,
          message: "Payment received, but your reserved seat has expired and is no longer available. A full refund has been initiated.",
          appointment: appt,
          payment,
          wasExpired: true,
          refundNeeded: true,
        };
      }
    }

    appt.status = "BOOKED";
    appt.holdExpiresAt = null;

    payment.status = "PAID";
    payment.providerPaymentId = params.providerPaymentId ?? payment.providerPaymentId;
    payment.paidAt = payment.paidAt ?? now;
    payment.updatedAt = now;

    return {
      success: true,
      message: isHoldExpired ? "Hold was expired, but seat was still free! Booking confirmed." : "Booking and payment confirmed successfully!",
      appointment: appt,
      payment,
      wasExpired: isHoldExpired,
    };
  }

  public async getPaymentByProviderOrderId(
    provider: "RAZORPAY" | "MOCK",
    orderId: string
  ): Promise<PaymentEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.provider, provider),
            eq(schema.payments.providerOrderId, orderId)
          )
        )
        .limit(1);
      return rows[0] as PaymentEntity | undefined;
    }
    return this.ctx.getMem().payments.find(
      (p) => p.provider === provider && p.providerOrderId === orderId
    );
  }

  public async getPaymentsByPatientId(
    patientId: string
  ): Promise<(PaymentEntity & { appointment: AppointmentEntity; doctor: DoctorEntity })[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({
          payment: schema.payments,
          appointment: schema.appointments,
          doctor: schema.doctors,
        })
        .from(schema.payments)
        .innerJoin(schema.appointments, eq(schema.payments.appointmentId, schema.appointments.id))
        .innerJoin(schema.doctors, eq(schema.appointments.doctorId, schema.doctors.id))
        .where(eq(schema.payments.patientId, patientId))
        .orderBy(desc(schema.payments.createdAt));

      return rows.map((r) => ({
        ...(r.payment as PaymentEntity),
        appointment: r.appointment as AppointmentEntity,
        doctor: {
          ...r.doctor,
          consultationFee: Number(r.doctor.consultationFee ?? 500),
          experienceYears: Number(r.doctor.experienceYears ?? 0),
          licenseNumber: r.doctor.licenseNumber ?? "REG-PENDING",
        } as DoctorEntity,
      }));
    }

    const mem = this.ctx.getMem();
    return mem.payments
      .filter((p) => p.patientId === patientId)
      .map((p) => {
        const appointment = mem.appointments.find((a) => a.id === p.appointmentId);
        if (!appointment) return null;
        const doctor = mem.doctors.find((d) => d.id === appointment.doctorId);
        if (!doctor) return null;
        return {
          ...p,
          appointment,
          doctor,
        };
      })
      .filter((item): item is PaymentEntity & { appointment: AppointmentEntity; doctor: DoctorEntity } => item !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async getPaymentByProviderPaymentId(
    provider: "RAZORPAY" | "MOCK",
    providerPaymentId: string
  ): Promise<PaymentEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.provider, provider),
            eq(schema.payments.providerPaymentId, providerPaymentId)
          )
        )
        .limit(1);
      return rows[0] as PaymentEntity | undefined;
    }
    return this.ctx.getMem().payments.find(
      (p) => p.provider === provider && p.providerPaymentId === providerPaymentId
    );
  }

  public async updatePaymentEventOutcome(id: string, outcome: string): Promise<void> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    if (db) {
      await db
        .update(schema.paymentEvents)
        .set({ outcome, processedAt: now })
        .where(eq(schema.paymentEvents.id, id));
      return;
    }
    const evt = this.ctx.getMem().paymentEvents.find((e) => e.id === id);
    if (evt) {
      evt.outcome = outcome;
      evt.processedAt = now;
    }
  }

  public async findActiveHoldsForPatient(
    patientId: string,
    doctorId: string,
    appointmentDate: string,
    now: Date = new Date()
  ): Promise<{ appointment: AppointmentEntity; payment?: PaymentEntity }[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ appointment: schema.appointments, payment: schema.payments })
        .from(schema.appointments)
        .leftJoin(schema.payments, eq(schema.payments.appointmentId, schema.appointments.id))
        .where(
          and(
            eq(schema.appointments.patientId, patientId),
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.appointmentDate, appointmentDate),
            eq(schema.appointments.status, "PENDING_PAYMENT"),
            sql`${schema.appointments.holdExpiresAt} > ${now}`
          )
        )
        .orderBy(desc(schema.appointments.createdAt));
      return rows.map((r) => ({
        appointment: r.appointment as AppointmentEntity,
        payment: (r.payment ?? undefined) as PaymentEntity | undefined,
      }));
    }
    const mem = this.ctx.getMem();
    return mem.appointments
      .filter(
        (a) =>
          a.patientId === patientId &&
          a.doctorId === doctorId &&
          a.appointmentDate === appointmentDate &&
          a.status === "PENDING_PAYMENT" &&
          a.holdExpiresAt &&
          a.holdExpiresAt > now
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((appointment) => ({
        appointment,
        payment: mem.payments.find((p) => p.appointmentId === appointment.id),
      }));
  }

  public async getRefundByProviderRefundId(providerRefundId: string): Promise<RefundEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.providerRefundId, providerRefundId))
        .limit(1);
      return rows[0] as RefundEntity | undefined;
    }
    return this.ctx.getMem().refunds.find((r) => r.providerRefundId === providerRefundId);
  }

  public async getRefundsByStatuses(statuses: RefundStatus[], olderThan?: Date): Promise<RefundEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.refunds)
        .where(
          and(
            inArray(schema.refunds.status, statuses),
            olderThan ? sql`${schema.refunds.updatedAt} <= ${olderThan}` : sql`true`
          )
        );
      return rows as RefundEntity[];
    }
    return this.ctx.getMem().refunds.filter(
      (r) => statuses.includes(r.status) && (!olderThan || r.updatedAt <= olderThan)
    );
  }

  public async getRefundsByAppointmentId(appointmentId: string): Promise<RefundEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.refunds)
        .where(eq(schema.refunds.appointmentId, appointmentId))
        .orderBy(desc(schema.refunds.createdAt));
      return rows as RefundEntity[];
    }
    return this.ctx.getMem().refunds
      .filter((r) => r.appointmentId === appointmentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async getExpiredHolds(cutoff: Date = new Date()): Promise<AppointmentEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.status, "PENDING_PAYMENT"),
            lte(schema.appointments.holdExpiresAt, cutoff)
          )
        );
      return rows as AppointmentEntity[];
    }

    return this.ctx.getMem().appointments.filter(
      (a) => a.status === "PENDING_PAYMENT" && a.holdExpiresAt && a.holdExpiresAt <= cutoff
    );
  }

  public async expireAppointmentHold(appointmentId: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const res = await db
        .update(schema.appointments)
        .set({ status: "EXPIRED" })
        .where(
          and(
            eq(schema.appointments.id, appointmentId),
            eq(schema.appointments.status, "PENDING_PAYMENT")
          )
        );
      return ((res as any).rowCount ?? 0) > 0;
    }

    const apt = this.ctx.getMem().appointments.find(
      (a) => a.id === appointmentId && a.status === "PENDING_PAYMENT"
    );
    if (!apt) return false;
    apt.status = "EXPIRED";
    return true;
  }
}
