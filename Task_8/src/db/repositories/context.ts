import { db, assertProductionDatabase } from "../index";
import type {
  UserEntity,
  PatientEntity,
  DoctorEntity,
  AvailabilityEntity,
  DoctorLeaveEntity,
  AppointmentEntity,
  PaymentEntity,
  PaymentEventEntity,
  RefundEntity,
  NotificationEntity,
  NotificationPreferencesEntity,
  AgentEventEntity,
  PrescriptionEntity,
  ReceptionistEntity,
  DoctorReceptionistEntity,
} from "./types";

export interface MemoryStore {
  users: UserEntity[];
  patients: PatientEntity[];
  doctors: DoctorEntity[];
  availabilities: AvailabilityEntity[];
  appointments: AppointmentEntity[];
  doctorLeaves: DoctorLeaveEntity[];
  loginAttempts: { id: string; email: string; attemptedAt: Date }[];
  payments: PaymentEntity[];
  paymentEvents: PaymentEventEntity[];
  refunds: RefundEntity[];
  notifications: NotificationEntity[];
  notificationPreferences: NotificationPreferencesEntity[];
  agentEvents: AgentEventEntity[];
  prescriptions: PrescriptionEntity[];
  receptionists: ReceptionistEntity[];
  doctorReceptionists: DoctorReceptionistEntity[];
  inFlightNotificationClaims: Set<string>;
}

export interface RepositoryContext {
  getDb(): typeof db;
  getMem(): MemoryStore;
  checkProductionDatabase(): void;
}

export class DefaultRepositoryContext implements RepositoryContext {
  private mem: MemoryStore;

  constructor(memStore?: MemoryStore) {
    this.mem = memStore || {
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
      receptionists: [],
      doctorReceptionists: [],
      inFlightNotificationClaims: new Set<string>(),
    };
  }

  getDb(): typeof db {
    return db;
  }

  getMem(): MemoryStore {
    return this.mem;
  }

  checkProductionDatabase(): void {
    assertProductionDatabase();
  }
}
