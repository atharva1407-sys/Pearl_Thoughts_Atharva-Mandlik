import { hashPassword } from "@/lib/auth-crypto";
import { MEDRELLA_TEST_DATA } from "./test-data-backup";

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
  dateOfBirth?: string;
  gender?: string;
  address?: string;
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
  bio?: string;
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
  reason: string;
  createdAt: Date;
}

// In-Memory Database Store (Initialized with realistic mock data)
class MedrellaStore {
  private users: UserEntity[] = [];
  private patients: PatientEntity[] = [];
  private doctors: DoctorEntity[] = [];
  private availabilities: AvailabilityEntity[] = [];
  private appointments: AppointmentEntity[] = [];

  constructor() {
    if (process.env.ENABLE_SEED_DATA === "true") {
      this.seed();
    }
  }

  public seed() {
    this.clearAll();
    const defaultPasswordHash = hashPassword("password123");

    // 1. Seed Doctors from Backup
    MEDRELLA_TEST_DATA.doctors.forEach((d) => {
      this.users.push({
        id: d.userId,
        email: d.email,
        passwordHash: defaultPasswordHash,
        role: "DOCTOR",
        isActive: true,
        createdAt: new Date(),
      });

      this.doctors.push({
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

      const allDays: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"> = [
        "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
      ];

      allDays.forEach((day, index) => {
        const isActive = (d.days as readonly string[]).includes(day);
        this.availabilities.push({
          id: `avail-${d.id}-${index}`,
          doctorId: d.id,
          dayOfWeek: day,
          startTime: d.start,
          endTime: d.end,
          slotDurationMinutes: d.duration,
          isActive,
        });
      });
    });

    // 2. Seed Patients from Backup
    MEDRELLA_TEST_DATA.patients.forEach((p) => {
      this.users.push({
        id: p.userId,
        email: p.email,
        passwordHash: defaultPasswordHash,
        role: "PATIENT",
        isActive: true,
        createdAt: new Date(),
      });

      this.patients.push({
        id: p.id,
        userId: p.userId,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        address: p.address,
      });
    });

    // 3. Seed Appointments from Backup
    const today = new Date();
    MEDRELLA_TEST_DATA.appointments.forEach((apt) => {
      const d = new Date(today);
      d.setDate(today.getDate() + apt.dateOffsetDays);
      const dateString = d.toISOString().split("T")[0];

      this.appointments.push({
        id: apt.id,
        patientId: apt.patientId,
        doctorId: apt.doctorId,
        appointmentDate: dateString,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status,
        reason: apt.reason,
        createdAt: new Date(),
      });
    });
  }

  public clearAll() {
    this.users = [];
    this.patients = [];
    this.doctors = [];
    this.availabilities = [];
    this.appointments = [];
  }

  public getAllPatients(): PatientEntity[] {
    return this.patients ? [...this.patients] : [];
  }

  // --- User Operations ---
  public getUserByEmail(email: string): UserEntity | undefined {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserById(id: string): UserEntity | undefined {
    return this.users.find((u) => u.id === id);
  }

  public createUser(user: Omit<UserEntity, "createdAt">): UserEntity {
    const newUser: UserEntity = { ...user, createdAt: new Date() };
    this.users.push(newUser);
    return newUser;
  }

  // --- Patient Operations ---
  public getPatientByUserId(userId: string): PatientEntity | undefined {
    return this.patients.find((p) => p.userId === userId);
  }

  public getPatientById(id: string): PatientEntity | undefined {
    return this.patients.find((p) => p.id === id);
  }

  public createPatient(patient: PatientEntity): PatientEntity {
    this.patients.push(patient);
    return patient;
  }

  // --- Doctor Operations ---
  public getDoctorByUserId(userId: string): DoctorEntity | undefined {
    return this.doctors.find((d) => d.userId === userId);
  }

  public getDoctorById(id: string): DoctorEntity | undefined {
    return this.doctors.find((d) => d.id === id);
  }

  public getAllDoctors(specialization?: string): DoctorEntity[] {
    if (!specialization || specialization.toLowerCase() === "all") {
      return this.doctors;
    }
    return this.doctors.filter(
      (d) => d.specialization.toLowerCase() === specialization.toLowerCase()
    );
  }

  public createDoctor(doctor: DoctorEntity): DoctorEntity {
    this.doctors.push(doctor);
    return doctor;
  }

  // --- Availability Operations ---
  public getAvailabilitiesByDoctorId(doctorId: string): AvailabilityEntity[] {
    return this.availabilities.filter((a) => a.doctorId === doctorId);
  }

  public updateDoctorAvailability(
    doctorId: string,
    dayOfWeek: AvailabilityEntity["dayOfWeek"],
    updates: Partial<Omit<AvailabilityEntity, "id" | "doctorId" | "dayOfWeek">>
  ) {
    let item = this.availabilities.find(
      (a) => a.doctorId === doctorId && a.dayOfWeek === dayOfWeek
    );
    if (!item) {
      item = {
        id: `avail-${doctorId}-${dayOfWeek}`,
        doctorId,
        dayOfWeek,
        startTime: updates.startTime || "09:00",
        endTime: updates.endTime || "17:00",
        slotDurationMinutes: updates.slotDurationMinutes || 30,
        isActive: updates.isActive ?? true,
      };
      this.availabilities.push(item);
    } else {
      Object.assign(item, updates);
    }
    return item;
  }

  // --- Dynamic Slot Computation Engine ---
  public computeAvailableSlots(
    doctorId: string,
    dateString: string
  ): { startTime: string; endTime: string; isBooked: boolean }[] {
    const date = new Date(dateString + "T00:00:00");
    const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday ...
    const dayMap: Array<"SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT"> = [
      "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"
    ];
    const targetDay = dayMap[dayIndex];

    const availability = this.availabilities.find(
      (a) => a.doctorId === doctorId && a.dayOfWeek === targetDay && a.isActive
    );

    if (!availability) {
      return []; // Doctor not working on this day
    }

    const { startTime, endTime, slotDurationMinutes } = availability;

    // Parse hours & minutes
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Get active bookings for that doctor on that date
    const bookedSlots = this.appointments
      .filter(
        (apt) =>
          apt.doctorId === doctorId &&
          apt.appointmentDate === dateString &&
          apt.status !== "CANCELLED"
      )
      .map((apt) => apt.startTime);

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
  public createAppointment(
    data: Omit<AppointmentEntity, "id" | "createdAt" | "status">
  ): { success: boolean; message: string; appointment?: AppointmentEntity } {
    // Collision check
    const existing = this.appointments.find(
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
      id: `apt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: "BOOKED",
      createdAt: new Date(),
    };

    this.appointments.unshift(newAppointment);
    return { success: true, message: "Appointment booked successfully!", appointment: newAppointment };
  }

  public getAllAppointments(): AppointmentEntity[] {
    return this.appointments ? [...this.appointments] : [];
  }

  public getAppointmentsByPatientId(patientId: string): (AppointmentEntity & { doctor: DoctorEntity })[] {
    return this.appointments
      .filter((a) => a.patientId === patientId)
      .map((a) => ({
        ...a,
        doctor: this.getDoctorById(a.doctorId)!,
      }))
      .filter((a) => a.doctor !== undefined);
  }

  public getAppointmentsByDoctorId(doctorId: string): (AppointmentEntity & { patient: PatientEntity })[] {
    return this.appointments
      .filter((a) => a.doctorId === doctorId)
      .map((a) => ({
        ...a,
        patient: this.getPatientById(a.patientId)!,
      }))
      .filter((a) => a.patient !== undefined);
  }

  public updateAppointmentStatus(
    id: string,
    status: "BOOKED" | "COMPLETED" | "CANCELLED"
  ): boolean {
    const apt = this.appointments.find((a) => a.id === id);
    if (!apt) return false;
    apt.status = status;
    return true;
  }
}

// Singleton global store instance for dev & runtime persistence
declare global {
  var __medrella_store__: MedrellaStore | undefined;
}

if (globalThis.__medrella_store__) {
  Object.setPrototypeOf(globalThis.__medrella_store__, MedrellaStore.prototype);
  if (!globalThis.__medrella_store__.getAllPatients) {
    globalThis.__medrella_store__.getAllPatients = function() {
      return (this as any).patients ? [...(this as any).patients] : [];
    };
  }
  if (!globalThis.__medrella_store__.getAllAppointments) {
    globalThis.__medrella_store__.getAllAppointments = function() {
      return (this as any).appointments ? [...(this as any).appointments] : [];
    };
  }
}

export const dbRepo = globalThis.__medrella_store__ || new MedrellaStore();
if (process.env.NODE_ENV !== "production") {
  globalThis.__medrella_store__ = dbRepo;
}
