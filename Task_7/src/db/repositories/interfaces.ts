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
  PaymentEventEntity,
  RefundEntity,
  RefundStatus,
  NotificationEntity,
  NotificationStatus,
  NotificationPreferencesEntity,
  PrescriptionEntity,
  PrescriptionMedicine,
  AgentEventEntity,
  SessionScheduleInput,
  DayCode,
  SessionSlotGroup,
  NextOpenSlot,
} from "./types";
import type { BookingResolution, SessionChangeImpact } from "@/lib/elastic-schedule";

export interface IUserRepository {
  getUserByEmail(email: string): Promise<UserEntity | undefined>;
  getUserById(id: string): Promise<UserEntity | undefined>;
  createUser(user: Omit<UserEntity, "createdAt">): Promise<UserEntity>;
  getPatientById(id: string): Promise<PatientEntity | undefined>;
  getPatientByUserId(userId: string): Promise<PatientEntity | undefined>;
  createPatient(patient: PatientEntity): Promise<PatientEntity>;
  getPatientsPage(limit: number, offset?: number): Promise<PatientEntity[]>;
  deleteUserComplete(userId: string): Promise<boolean>;
  recordFailedLogin(email: string): Promise<void>;
  getRecentFailedLoginCount(email: string, windowMinutes?: number): Promise<number>;
  clearFailedLogins(email: string): Promise<void>;
  consumeRateLimitToken(
    key: string,
    maxLimit: number,
    windowMinutes: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>;
  cleanupOldRateLimits(olderThanDays?: number): Promise<number>;
}

export interface IDoctorScheduleRepository {
  getDoctorById(id: string): Promise<DoctorEntity | undefined>;
  getDoctorByUserId(userId: string): Promise<DoctorEntity | undefined>;
  getAllDoctors(specialization?: string): Promise<DoctorEntity[]>;
  createDoctor(doctor: DoctorEntity): Promise<DoctorEntity>;
  getAvailabilitiesByDoctorId(doctorId: string): Promise<AvailabilityEntity[]>;
  createAvailabilitySession(data: {
    doctorId: string;
    name: string;
    dayOfWeek?: DayCode | null;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    isActive: boolean;
    schedulingType: "STREAM" | "WAVE";
    patientsPerWave: number;
  } & SessionScheduleInput): Promise<AvailabilityEntity>;
  createSessionsForDates(
    data: Parameters<IDoctorScheduleRepository["createAvailabilitySession"]>[0],
    dates: string[]
  ): Promise<AvailabilityEntity[]>;
  updateAvailabilitySession(
    doctorId: string,
    id: string,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId">>,
    options?: { resolution?: BookingResolution }
  ): Promise<AvailabilityEntity>;
  updateAvailabilitySessionWithImpact(
    doctorId: string,
    id: string,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId">>,
    options?: { resolution?: BookingResolution }
  ): Promise<{ session: AvailabilityEntity; impact: SessionChangeImpact }>;
  deleteAvailabilitySession(doctorId: string, id: string): Promise<boolean>;
  updateDoctorAvailability(
    doctorId: string,
    dayOfWeek: DayCode,
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId" | "dayOfWeek">>
  ): Promise<AvailabilityEntity>;
  getDoctorLeaves(doctorId: string): Promise<DoctorLeaveEntity[]>;
  addDoctorLeave(doctorId: string, leaveDate: string, reason?: string): Promise<DoctorLeaveEntity>;
  removeDoctorLeave(doctorId: string, date: string): Promise<boolean>;
  isDoctorOnLeave(doctorId: string, date: string): Promise<boolean>;
  computeSessionGroups(
    doctorId: string,
    dateString: string,
    sessionsOverride?: AvailabilityEntity[]
  ): Promise<{ isLeave: boolean; leaveReason?: string | null; groups: SessionSlotGroup[] }>;
  getNextOpenSlots(doctorIds: string[], dates: string[]): Promise<Map<string, NextOpenSlot>>;
  computeAvailableSlots(
    doctorId: string,
    dateString: string
  ): Promise<{ startTime: string; endTime: string; isBooked: boolean }[]>;
}

export interface IAppointmentRepository {
  getAppointmentById(id: string): Promise<AppointmentEntity | undefined>;
  getAllAppointments(): Promise<AppointmentEntity[]>;
  getAppointmentsByPatientId(patientId: string): Promise<AppointmentEntity[]>;
  getAppointmentsByDoctorId(doctorId: string): Promise<AppointmentEntity[]>;
  createAppointment(data: Omit<AppointmentEntity, "id" | "createdAt" | "status" | "tokenNumber"> & {
    sessionId?: string | null;
    status?: AppointmentStatus;
    holdExpiresAt?: Date | null;
    tokenNumber?: number;
  }): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }>;
  updateAppointmentStatus(id: string, status: AppointmentStatus, extra?: {
    cancelledBy?: "PATIENT" | "DOCTOR" | "SYSTEM" | null;
    cancelReason?: string | null;
  }): Promise<boolean>;
  rescheduleAppointment(data: {
    appointmentId: string;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
    newSessionId?: string | null;
    actorUserId?: string;
    actorRole?: "PATIENT" | "DOCTOR";
    rescheduledBy?: "PATIENT" | "DOCTOR";
    reason?: string | null;
  }): Promise<{ success: boolean; message: string; appointment?: AppointmentEntity }>;
  findActiveHoldsForPatient(
    patientId: string,
    doctorId: string,
    date: string,
    now?: Date
  ): Promise<{ appointment: AppointmentEntity; payment?: PaymentEntity }[]>;
  getExpiredHolds(now?: Date): Promise<AppointmentEntity[]>;
  expireAppointmentHold(appointmentId: string): Promise<boolean>;
  createAgentEvent(input: Omit<AgentEventEntity, "createdAt">): Promise<AgentEventEntity>;
  getAgentEventsByUserId(userId: string, limit?: number): Promise<AgentEventEntity[]>;
  upsertPrescription(input: {
    appointmentId: string;
    doctorId: string;
    patientId: string;
    medicines: PrescriptionMedicine[];
    notes?: string | null;
  }): Promise<PrescriptionEntity>;
  getPrescriptionByAppointmentId(appointmentId: string): Promise<PrescriptionEntity | undefined>;
  getPrescriptionsByPatientId(
    patientId: string
  ): Promise<(PrescriptionEntity & { doctor: DoctorEntity; appointment: AppointmentEntity })[]>;
  getAppointmentsInRange(
    fromDate: string,
    toDate: string,
    statuses: AppointmentStatus[]
  ): Promise<AppointmentEntity[]>;
}

export interface IBillingRepository {
  getPaymentById(id: string): Promise<PaymentEntity | undefined>;
  getPaymentByAppointmentId(appointmentId: string): Promise<PaymentEntity | undefined>;
  getPaymentByProviderOrderId(provider: "RAZORPAY" | "MOCK", orderId: string): Promise<PaymentEntity | undefined>;
  getPaymentsByPatientId(patientId: string): Promise<(PaymentEntity & { appointment: AppointmentEntity; doctor: DoctorEntity })[]>;
  createPayment(data: Omit<PaymentEntity, "id" | "createdAt" | "updatedAt">): Promise<PaymentEntity>;
  updatePaymentStatus(id: string, status: PaymentStatus, extra?: {
    providerPaymentId?: string | null;
    failureReason?: string | null;
    paidAt?: Date | null;
  }): Promise<boolean>;
  recordPaymentEvent(event: Omit<PaymentEventEntity, "id" | "processedAt">): Promise<{ duplicate: boolean; event: PaymentEventEntity }>;
  getPaymentByProviderPaymentId(provider: "RAZORPAY" | "MOCK", providerPaymentId: string): Promise<PaymentEntity | undefined>;
  updatePaymentEventOutcome(id: string, outcome: string): Promise<void>;
  createRefund(data: (Omit<RefundEntity, "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date; updatedAt?: Date }) |
                     (Omit<RefundEntity, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date; updatedAt?: Date })): Promise<RefundEntity>;
  getRefundByIdempotencyKey(key: string): Promise<RefundEntity | undefined>;
  getRefundByProviderRefundId(providerRefundId: string): Promise<RefundEntity | undefined>;
  getRefundsByStatuses(statuses: RefundStatus[], olderThan?: Date): Promise<RefundEntity[]>;
  getRefundsByPaymentId(paymentId: string): Promise<RefundEntity[]>;
  getRefundsByAppointmentId(appointmentId: string): Promise<RefundEntity[]>;
  updateRefundStatus(id: string, status: RefundStatus, extra?: {
    providerRefundId?: string | null;
    failureReason?: string | null;
  }): Promise<boolean>;
  findActiveHoldsForPatient(
    patientId: string,
    doctorId: string,
    appointmentDate: string,
    now?: Date
  ): Promise<{ appointment: AppointmentEntity; payment?: PaymentEntity }[]>;
  getExpiredHolds(cutoff?: Date): Promise<AppointmentEntity[]>;
  expireAppointmentHold(appointmentId: string): Promise<boolean>;
  confirmPaymentAndBookAppointment(params: {
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
  }>;
}

export interface INotificationRepository {
  createNotification(data: Omit<NotificationEntity, "createdAt" | "attempts"> & { attempts?: number; createdAt?: Date }): Promise<NotificationEntity>;
  getPendingNotifications(cutoff?: Date, limit?: number): Promise<NotificationEntity[]>;
  getNotificationById(id: string): Promise<NotificationEntity | undefined>;
  getNotificationsByUserId(userId: string): Promise<NotificationEntity[]>;
  updateNotificationStatus(
    id: string,
    status: NotificationStatus,
    extra?: { attempts?: number; lastError?: string | null; providerMessageId?: string | null; sentAt?: Date | null; scheduledFor?: Date }
  ): Promise<boolean>;
  claimPendingNotifications(cutoff?: Date, limit?: number): Promise<NotificationEntity[]>;
  requeueNotification(id: string, delayMinutes?: number, reason?: string): Promise<boolean>;
  countNotificationsByStatus(): Promise<Record<NotificationStatus, number>>;
  getFailedNotifications(limit?: number): Promise<NotificationEntity[]>;
  getLongPendingNotifications(stuckMinutes?: number, limit?: number): Promise<NotificationEntity[]>;
  cancelPendingNotificationsForAppointment(appointmentId: string, template?: string): Promise<number>;
  getNotificationPreferences(userId: string): Promise<NotificationPreferencesEntity | undefined>;
  upsertNotificationPreferences(
    userIdOrData: string | { userId: string; emailPromotional: boolean; consentedAt?: Date | null },
    emailPromotionalArg?: boolean,
    consentedAtArg?: Date | null
  ): Promise<NotificationPreferencesEntity>;
}
