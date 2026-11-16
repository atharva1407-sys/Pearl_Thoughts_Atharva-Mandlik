import { db, isPostgresConfigured, assertProductionDatabase } from "./index";
import * as schema from "./schema";
import { hashPassword } from "@/lib/auth-crypto";
import { RUBY_HALL_SPECIALISTS, specialistSessionId, getSeedDoctorPassword } from "./specialists-catalog";
import { seedSpecialists } from "./seed-specialists";
import { istDateString } from "@/lib/time";
import { weekdayOfDate, type DayCode } from "@/lib/session-schedule";
import type {
  IUserRepository,
  IDoctorScheduleRepository,
  IAppointmentRepository,
  IBillingRepository,
  INotificationRepository,
} from "./repositories/interfaces";
import {
  UserRepository,
  DoctorRepository,
  AppointmentRepository,
  BillingRepository,
  NotificationRepository,
  buildSessionSlotGroups,
  type MemoryStore,
  type RepositoryContext,
} from "./repositories";
import type {
  UserEntity,
  PatientEntity,
  DoctorEntity,
  AvailabilityEntity,
  DoctorLeaveEntity,
  AppointmentEntity,
  AppointmentStatus,
  PaymentEntity,
  PaymentStatus,
  RefundEntity,
  RefundStatus,
  NotificationEntity,
  NotificationStatus,
  PrescriptionEntity,
  PrescriptionMedicine,
  AgentEventEntity,
  NextOpenSlot,
  SessionSlotGroup,
  ComputedSlot,
} from "./repositories/types";

export * from "./repositories";

export function doSessionsOverlap(
  s1: { startTime: string; endTime: string },
  s2: { startTime: string; endTime: string }
): boolean {
  return s1.startTime < s2.endTime && s2.startTime < s1.endTime;
}

/** YYYY-MM-DD in hospital time (Asia/Kolkata), whatever timezone the server runs in. */
export function toLocalDateString(d: Date): string {
  return istDateString(d);
}

export function dayOfWeekFor(dateString: string): DayCode {
  return weekdayOfDate(dateString);
}

export { buildSessionSlotGroups };

/** A fresh, empty in-memory store (used only when no real database is configured). */
function createEmptyMemoryStore(): MemoryStore {
  return {
    users: [],
    patients: [],
    doctors: [],
    availabilities: [],
    appointments: [],
    doctorLeaves: [],
    loginAttempts: [],
    payments: [],
    paymentEvents: [],
    refunds: [],
    notifications: [],
    notificationPreferences: [],
    agentEvents: [],
    prescriptions: [],
    inFlightNotificationClaims: new Set<string>(),
  };
}

export class MedrellaRepository
  implements
    IUserRepository,
    IDoctorScheduleRepository,
    IAppointmentRepository,
    IBillingRepository,
    INotificationRepository
{
  public mem: MemoryStore;
  public userRepo: UserRepository;
  public doctorRepo: DoctorRepository;
  public appointmentRepo: AppointmentRepository;
  public billingRepo: BillingRepository;
  public notificationRepo: NotificationRepository;

  constructor() {
    // A dev server reloads modules whenever a file changes, and each reload used to build a NEW repository with an
    // EMPTY in-memory store. Every account registered since start-up vanished while the browser kept its (still
    // valid) cookie: the page looked signed in, but the next assistant message found no user and answered
    // "Please sign in". One store per process, kept on globalThis, survives those reloads and is shared by every
    // copy of this module. (It has no effect with a real database, which holds the data instead.)
    const shared = globalThis as { __medrellaMemStore?: MemoryStore; __medrellaMemSeeded?: boolean };
    this.mem = shared.__medrellaMemStore ??= createEmptyMemoryStore();

    const ctx: RepositoryContext = {
      getDb: () => db,
      getMem: () => this.mem,
      checkProductionDatabase: () => this.checkProductionDatabase(),
    };

    this.userRepo = new UserRepository(ctx);
    this.doctorRepo = new DoctorRepository(ctx);
    this.appointmentRepo = new AppointmentRepository(ctx);
    this.billingRepo = new BillingRepository(ctx);
    this.notificationRepo = new NotificationRepository(ctx);

    if (
      !isPostgresConfigured() &&
      process.env.ENABLE_SEED_DATA !== "false" &&
      process.env.NODE_ENV !== "production" &&
      !shared.__medrellaMemSeeded
    ) {
      shared.__medrellaMemSeeded = true; // seed once per process, never again on a hot reload
      this.seedMemory();
    }
  }

  private checkProductionDatabase() {
    assertProductionDatabase();
  }

  // --- Memory store accessors for testing backward compatibility ---
  public get memUsers() { return this.mem.users; }
  public set memUsers(val) { this.mem.users = val; }
  public get memPatients() { return this.mem.patients; }
  public set memPatients(val) { this.mem.patients = val; }
  public get memDoctors() { return this.mem.doctors; }
  public set memDoctors(val) { this.mem.doctors = val; }
  public get memAvailabilities() { return this.mem.availabilities; }
  public set memAvailabilities(val) { this.mem.availabilities = val; }
  public get memAppointments() { return this.mem.appointments; }
  public set memAppointments(val) { this.mem.appointments = val; }
  public get memDoctorLeaves() { return this.mem.doctorLeaves; }
  public set memDoctorLeaves(val) { this.mem.doctorLeaves = val; }
  public get memPayments() { return this.mem.payments; }
  public set memPayments(val) { this.mem.payments = val; }
  public get memPaymentEvents() { return this.mem.paymentEvents; }
  public set memPaymentEvents(val) { this.mem.paymentEvents = val; }
  public get memRefunds() { return this.mem.refunds; }
  public set memRefunds(val) { this.mem.refunds = val; }
  public get memNotifications() { return this.mem.notifications; }
  public set memNotifications(val) { this.mem.notifications = val; }
  public get memNotificationPreferences() { return this.mem.notificationPreferences; }
  public set memNotificationPreferences(val) { this.mem.notificationPreferences = val; }
  public get memAgentEvents() { return this.mem.agentEvents; }
  public set memAgentEvents(val) { this.mem.agentEvents = val; }
  public get memPrescriptions() { return this.mem.prescriptions; }
  public set memPrescriptions(val) { this.mem.prescriptions = val; }

  private seedMemory() {
    this.mem.users = [];
    this.mem.patients = [];
    this.mem.doctors = [];
    this.mem.availabilities = [];
    this.mem.appointments = [];
    this.mem.doctorLeaves = [];
    this.mem.notifications = [];
    this.mem.notificationPreferences = [];
    this.mem.agentEvents = [];
    this.mem.prescriptions = [];
    this.mem.inFlightNotificationClaims = new Set<string>();

    const defaultPasswordHash = hashPassword(getSeedDoctorPassword({ allowDevFallback: true }));

    RUBY_HALL_SPECIALISTS.forEach((d) => {
      this.mem.users.push({
        id: d.userId,
        email: d.email,
        passwordHash: defaultPasswordHash,
        role: "DOCTOR",
        isActive: true,
        createdAt: new Date(),
      });

      this.mem.doctors.push({
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
          this.mem.availabilities.push({
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

    this.seedDemoPatients();
  }

  private seedDemoPatients() {
    const password = process.env.DEMO_PATIENT_PASSWORD;
    if (process.env.DEMO_DATA !== "true" || !password || this.mem.doctors.length === 0) return;

    const hash = hashPassword(password);
    const dayMs = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => istDateString(new Date(Date.now() - n * dayMs));
    const doctor = this.mem.doctors[0];
    const patients = [
      { key: "priya", email: "priya.demo@medrella.demo", firstName: "Priya", lastName: "Deshmukh", visitDaysAgo: 2 },
    ];

    for (const p of patients) {
      const userId = `demo-user-${p.key}`;
      const patientId = `demo-patient-${p.key}`;
      this.mem.users.push({ id: userId, email: p.email, passwordHash: hash, role: "PATIENT", isActive: true, createdAt: new Date() });
      this.mem.patients.push({ id: patientId, userId, firstName: p.firstName, lastName: p.lastName, phone: "9800000000" });
      this.mem.appointments.push({
        id: `demo-appt-${p.key}`,
        patientId,
        doctorId: doctor.id,
        appointmentDate: daysAgo(p.visitDaysAgo),
        startTime: "10:00",
        endTime: "10:15",
        status: "COMPLETED",
        tokenNumber: 1,
        reason: "General consultation",
        createdAt: new Date(Date.now() - (p.visitDaysAgo + 2) * dayMs),
      });
      this.mem.notificationPreferences.push({ userId, emailPromotional: true, consentedAt: new Date(), updatedAt: new Date() });
    }
  }

  // --- User & Patient Operations ---
  public async getUserById(id: string) { return this.userRepo.getUserById(id); }
  public async getUserByEmail(email: string) { return this.userRepo.getUserByEmail(email); }
  public async createUser(user: Omit<UserEntity, "createdAt">) { return this.userRepo.createUser(user); }
  public async getPatientById(id: string) { return this.userRepo.getPatientById(id); }
  public async getPatientByUserId(userId: string) { return this.userRepo.getPatientByUserId(userId); }
  public async createPatient(patient: PatientEntity) { return this.userRepo.createPatient(patient); }
  public async getPatientsPage(limit: number, offset?: number) { return this.userRepo.getPatientsPage(limit, offset); }
  public async deleteUserComplete(userId: string) { return this.userRepo.deleteUserComplete(userId); }
  public async recordFailedLogin(email: string) { return this.userRepo.recordFailedLogin(email); }
  public async getRecentFailedLoginCount(email: string, windowMinutes?: number) { return this.userRepo.getRecentFailedLoginCount(email, windowMinutes); }
  public async clearFailedLogins(email: string) { return this.userRepo.clearFailedLogins(email); }
  public async consumeRateLimitToken(key: string, maxLimit: number, windowMinutes: number) { return this.userRepo.consumeRateLimitToken(key, maxLimit, windowMinutes); }
  public async cleanupOldRateLimits(olderThanDays?: number) { return this.userRepo.cleanupOldRateLimits(olderThanDays); }

  // --- Doctor Operations ---
  public async getAllDoctors(specialization?: string) { return this.doctorRepo.getAllDoctors(specialization); }
  public async getDoctorById(id: string) { return this.doctorRepo.getDoctorById(id); }
  public async getDoctorByUserId(userId: string) { return this.doctorRepo.getDoctorByUserId(userId); }
  public async createDoctor(doctor: DoctorEntity) { return this.doctorRepo.createDoctor(doctor); }
  public async getAvailabilitiesByDoctorId(doctorId: string) { return this.doctorRepo.getAvailabilitiesByDoctorId(doctorId); }
  public async createAvailabilitySession(data: Parameters<DoctorRepository["createAvailabilitySession"]>[0]) { return this.doctorRepo.createAvailabilitySession(data); }
  public async createSessionsForDates(data: Parameters<DoctorRepository["createAvailabilitySession"]>[0], dates: string[]) { return this.doctorRepo.createSessionsForDates(data, dates); }
  public async updateAvailabilitySession(doctorId: string, id: string, updates: Parameters<DoctorRepository["updateAvailabilitySession"]>[2], options?: Parameters<DoctorRepository["updateAvailabilitySession"]>[3]) { return this.doctorRepo.updateAvailabilitySession(doctorId, id, updates, options); }
  public async updateAvailabilitySessionWithImpact(doctorId: string, id: string, updates: Parameters<DoctorRepository["updateAvailabilitySessionWithImpact"]>[2], options?: Parameters<DoctorRepository["updateAvailabilitySessionWithImpact"]>[3]) { return this.doctorRepo.updateAvailabilitySessionWithImpact(doctorId, id, updates, options); }
  public async deleteAvailabilitySession(doctorId: string, id: string) { return this.doctorRepo.deleteAvailabilitySession(doctorId, id); }
  public async updateDoctorAvailability(doctorId: string, dayOfWeek: DayCode, updates: Parameters<DoctorRepository["updateDoctorAvailability"]>[2]) { return this.doctorRepo.updateDoctorAvailability(doctorId, dayOfWeek, updates); }
  public async getDoctorLeaves(doctorId: string) { return this.doctorRepo.getDoctorLeaves(doctorId); }
  public async addDoctorLeave(doctorId: string, leaveDate: string, reason?: string) { return this.doctorRepo.addDoctorLeave(doctorId, leaveDate, reason); }
  public async removeDoctorLeave(doctorId: string, date: string) { return this.doctorRepo.removeDoctorLeave(doctorId, date); }
  public async isDoctorOnLeave(doctorId: string, date: string) { return this.doctorRepo.isDoctorOnLeave(doctorId, date); }
  public async computeSessionGroups(doctorId: string, dateString: string, sessionsOverride?: AvailabilityEntity[]) { return this.doctorRepo.computeSessionGroups(doctorId, dateString, sessionsOverride); }
  public async getNextOpenSlots(doctorIds: string[], dates: string[]) { return this.doctorRepo.getNextOpenSlots(doctorIds, dates); }
  public async computeAvailableSlots(doctorId: string, dateString: string) { return this.doctorRepo.computeAvailableSlots(doctorId, dateString); }

  // --- Appointment Operations ---
  public async getAppointmentById(id: string) { return this.appointmentRepo.getAppointmentById(id); }
  public async getAllAppointments() { return this.appointmentRepo.getAllAppointments(); }
  public async getAppointmentsByPatientId(patientId: string) { return this.appointmentRepo.getAppointmentsByPatientId(patientId); }
  public async getAppointmentsByDoctorId(doctorId: string) { return this.appointmentRepo.getAppointmentsByDoctorId(doctorId); }
  public async createAppointment(data: Parameters<AppointmentRepository["createAppointment"]>[0]) { return this.appointmentRepo.createAppointment(data); }
  public async updateAppointmentStatus(id: string, status: AppointmentStatus, extra?: Parameters<AppointmentRepository["updateAppointmentStatus"]>[2]) { return this.appointmentRepo.updateAppointmentStatus(id, status, extra); }
  public async rescheduleAppointment(data: Parameters<AppointmentRepository["rescheduleAppointment"]>[0]) { return this.appointmentRepo.rescheduleAppointment(data); }
  public async createAgentEvent(input: Omit<AgentEventEntity, "createdAt">) { return this.appointmentRepo.createAgentEvent(input); }
  public async getAgentEventsByUserId(userId: string, limit?: number) { return this.appointmentRepo.getAgentEventsByUserId(userId, limit); }
  public async upsertPrescription(input: Parameters<AppointmentRepository["upsertPrescription"]>[0]) { return this.appointmentRepo.upsertPrescription(input); }
  public async getPrescriptionByAppointmentId(appointmentId: string) { return this.appointmentRepo.getPrescriptionByAppointmentId(appointmentId); }
  public async getPrescriptionsByPatientId(patientId: string) { return this.appointmentRepo.getPrescriptionsByPatientId(patientId); }
  public async getAppointmentsInRange(fromDate: string, toDate: string, statuses: AppointmentStatus[]) { return this.appointmentRepo.getAppointmentsInRange(fromDate, toDate, statuses); }

  // --- Billing & Payment Operations ---
  public async createPayment(data: Parameters<BillingRepository["createPayment"]>[0]) { return this.billingRepo.createPayment(data); }
  public async getPaymentById(id: string) { return this.billingRepo.getPaymentById(id); }
  public async getPaymentByAppointmentId(appointmentId: string) { return this.billingRepo.getPaymentByAppointmentId(appointmentId); }
  public async getPaymentByProviderOrderId(provider: "RAZORPAY" | "MOCK", orderId: string) { return this.billingRepo.getPaymentByProviderOrderId(provider, orderId); }
  public async getPaymentsByPatientId(patientId: string) { return this.billingRepo.getPaymentsByPatientId(patientId); }
  public async updatePaymentStatus(id: string, status: PaymentStatus, extra?: Parameters<BillingRepository["updatePaymentStatus"]>[2]) { return this.billingRepo.updatePaymentStatus(id, status, extra); }
  public async recordPaymentEvent(event: Parameters<BillingRepository["recordPaymentEvent"]>[0]) { return this.billingRepo.recordPaymentEvent(event); }
  public async getPaymentByProviderPaymentId(provider: "RAZORPAY" | "MOCK", providerPaymentId: string) { return this.billingRepo.getPaymentByProviderPaymentId(provider, providerPaymentId); }
  public async updatePaymentEventOutcome(id: string, outcome: string) { return this.billingRepo.updatePaymentEventOutcome(id, outcome); }
  public async findActiveHoldsForPatient(patientId: string, doctorId: string, appointmentDate: string, now?: Date) { return this.billingRepo.findActiveHoldsForPatient(patientId, doctorId, appointmentDate, now); }
  public async createRefund(refund: Parameters<BillingRepository["createRefund"]>[0]) { return this.billingRepo.createRefund(refund); }
  public async getRefundByIdempotencyKey(key: string) { return this.billingRepo.getRefundByIdempotencyKey(key); }
  public async getRefundByProviderRefundId(providerRefundId: string) { return this.billingRepo.getRefundByProviderRefundId(providerRefundId); }
  public async getRefundsByStatuses(statuses: RefundStatus[], olderThan?: Date) { return this.billingRepo.getRefundsByStatuses(statuses, olderThan); }
  public async getRefundsByPaymentId(paymentId: string) { return this.billingRepo.getRefundsByPaymentId(paymentId); }
  public async getRefundsByAppointmentId(appointmentId: string) { return this.billingRepo.getRefundsByAppointmentId(appointmentId); }
  public async updateRefundStatus(id: string, status: RefundStatus, extra?: Parameters<BillingRepository["updateRefundStatus"]>[2]) { return this.billingRepo.updateRefundStatus(id, status, extra); }
  public async getExpiredHolds(cutoff?: Date) { return this.billingRepo.getExpiredHolds(cutoff); }
  public async expireAppointmentHold(appointmentId: string) { return this.billingRepo.expireAppointmentHold(appointmentId); }
  public async confirmPaymentAndBookAppointment(params: Parameters<BillingRepository["confirmPaymentAndBookAppointment"]>[0]) { return this.billingRepo.confirmPaymentAndBookAppointment(params); }

  // --- Notification Operations ---
  public async createNotification(notification: Parameters<NotificationRepository["createNotification"]>[0]) { return this.notificationRepo.createNotification(notification); }
  public async getNotificationPreferences(userId: string) { return this.notificationRepo.getNotificationPreferences(userId); }
  public async upsertNotificationPreferences(userIdOrData: string | { userId: string; emailPromotional: boolean; consentedAt?: Date | null }, emailPromotional?: boolean, consentedAt?: Date | null) { return this.notificationRepo.upsertNotificationPreferences(userIdOrData, emailPromotional, consentedAt); }
  public async claimPendingNotifications(cutoff?: Date, limit?: number) { return this.notificationRepo.claimPendingNotifications(cutoff, limit); }
  public async getPendingNotifications(cutoff?: Date, limit?: number) { return this.notificationRepo.getPendingNotifications(cutoff, limit); }
  public async getNotificationById(id: string) { return this.notificationRepo.getNotificationById(id); }
  public async getNotificationsByUserId(userId: string) { return this.notificationRepo.getNotificationsByUserId(userId); }
  public async updateNotificationStatus(id: string, status: NotificationStatus, extra?: Parameters<NotificationRepository["updateNotificationStatus"]>[2]) { return this.notificationRepo.updateNotificationStatus(id, status, extra); }
  public async requeueNotification(id: string, delayMinutes?: number, reason?: string) { return this.notificationRepo.requeueNotification(id); }
  public async countNotificationsByStatus() { return this.notificationRepo.countNotificationsByStatus(); }
  public async getFailedNotifications(limit?: number) { return this.notificationRepo.getFailedNotifications(limit); }
  public async getLongPendingNotifications(stuckMinutes?: number, limit?: number) { return this.notificationRepo.getLongPendingNotifications(stuckMinutes, limit); }
  public async cancelPendingNotificationsForAppointment(appointmentId: string, template?: string) { return this.notificationRepo.cancelPendingNotificationsForAppointment(appointmentId, template); }

  // --- Lifecycle & System ---
  public async seed(): Promise<void> {
    if (db) {
      await seedSpecialists(db, getSeedDoctorPassword({ allowDevFallback: false }));
      return;
    }
    this.seedMemory();
  }

  public async clearAll(): Promise<void> {
    this.checkProductionDatabase();
    if (db) {
      await db.delete(schema.notifications);
      await db.delete(schema.refunds);
      await db.delete(schema.paymentEvents);
      await db.delete(schema.payments);
      await db.delete(schema.appointments);
      await db.delete(schema.availabilities);
      await db.delete(schema.doctorLeaves);
      await db.delete(schema.doctors);
      await db.delete(schema.patients);
      await db.delete(schema.users);
      return;
    }
    this.mem.appointments = [];
    this.mem.availabilities = [];
    this.mem.doctorLeaves = [];
    this.mem.doctors = [];
    this.mem.patients = [];
    this.mem.users = [];
    this.mem.payments = [];
    this.mem.paymentEvents = [];
    this.mem.refunds = [];
    this.mem.notifications = [];
    this.mem.agentEvents = [];
    this.mem.prescriptions = [];
  }
}

export const dbRepo = new MedrellaRepository();
