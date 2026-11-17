import { hashPassword } from "@/lib/auth-crypto";
import { istDateString, istMinutesOfDay } from "@/lib/time";
import type { MedrellaMemoryStore } from "../repo";
import type { DayCode, AppointmentEntity, UserEntity, PatientEntity } from "../repositories/types";

const ALL_DAYS: DayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * Seeds comprehensive offline demo data for Task 8 when DEMO_DATA="true".
 * Sets up:
 * - 1 Receptionist account (reception.demo@medrella.demo)
 * - 2 Doctors (Dr. Ananya Sharma - General Medicine, Dr. Rohan Mehta - Cardiology)
 *   with full 08:00 - 22:00 daily OPD sessions
 * - A realistic mid-day appointment queue relative to current server time:
 *   - Completed
 *   - In consultation
 *   - 3 checked-in waiting patients (arrived out of token order)
 *   - Cancelled
 *   - No-Show
 *   - Not arrived (including 1 whose slot has already started)
 *   - Later booked upcoming slots
 * - Demo patient accounts with credentials read from DEMO_PATIENT_PASSWORD.
 */
export function seedTask8DemoData(mem: MedrellaMemoryStore): void {
  if (process.env.DEMO_DATA !== "true") return;

  const receptionPassword = process.env.DEMO_RECEPTION_PASSWORD;
  const patientPassword = process.env.DEMO_PATIENT_PASSWORD;

  if (!receptionPassword || !patientPassword) {
    return;
  }

  const receptionHash = hashPassword(receptionPassword);
  const patientHash = hashPassword(patientPassword);
  const now = new Date();
  const today = istDateString(now);

  // 1. Seed Receptionist Account
  const receptionUserId = "usr_reception_demo";
  const existingReceptionUser = mem.users.find((u: UserEntity) => u.email === "reception.demo@medrella.demo");
  if (!existingReceptionUser) {
    mem.users.push({
      id: receptionUserId,
      email: "reception.demo@medrella.demo",
      passwordHash: receptionHash,
      role: "RECEPTIONIST",
      isActive: true,
      createdAt: now,
    });
  }

  // 2. Ensure daily 08:00 - 22:00 OPD sessions for the 2 demo doctors
  const demoDocIds = ["doc_ananya_sharma", "doc_rohan_mehta"];
  for (const docId of demoDocIds) {
    for (const day of ALL_DAYS) {
      const sessionId = `demo_session_${docId}_${day}`;
      const existingIdx = mem.availabilities.findIndex(
        (a: any) => a.doctorId === docId && a.dayOfWeek === day
      );
      const sessionData = {
        id: sessionId,
        doctorId: docId,
        name: "OPD Full Day Session",
        dayOfWeek: day,
        startTime: "08:00",
        endTime: "22:00",
        slotDurationMinutes: 15,
        isActive: true,
        schedulingType: "STREAM" as const,
        patientsPerWave: 1,
      };

      if (existingIdx >= 0) {
        mem.availabilities[existingIdx] = sessionData;
      } else {
        mem.availabilities.push(sessionData);
      }
    }
  }

  // 3. Compute realistic mid-day anchor time relative to current IST time
  // Clamp base anchor between 10:00 (600m) and 18:00 (1080m) so slots fall nicely within 08:00-22:00
  const currentMinutes = istMinutesOfDay(now);
  const anchorMinutes = Math.min(Math.max(currentMinutes, 600), 1080);

  const pad = (n: number) => String(n).padStart(2, "0");
  const timeOffset = (offsetMinutes: number) => {
    const total = anchorMinutes + offsetMinutes;
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  };
  const slotWindow = (startOffset: number, durationMinutes = 15) => {
    return {
      startTime: timeOffset(startOffset),
      endTime: timeOffset(startOffset + durationMinutes),
    };
  };

  // Helper to add demo patient and user
  const addPatient = (
    key: string,
    firstName: string,
    lastName: string,
    phone: string
  ): { userId: string; patientId: string } => {
    const email = `${key}.demo@medrella.demo`;

    // An earlier demo seed (Task 6's "priya.demo") may already own this email. Reuse that account instead of
    // adding a second user with the same email, which would make login pick one of them arbitrarily.
    const existingUser = mem.users.find((u: UserEntity) => u.email === email);
    if (existingUser) {
      const existingPatient = mem.patients.find((p: PatientEntity) => p.userId === existingUser.id);
      if (existingPatient) {
        return { userId: existingUser.id, patientId: existingPatient.id };
      }
    }

    const userId = `usr_demo_pat_${key}`;
    const patientId = `pat_demo_${key}`;

    if (!mem.users.some((u: UserEntity) => u.id === userId)) {
      mem.users.push({
        id: userId,
        email,
        passwordHash: patientHash,
        role: "PATIENT",
        isActive: true,
        createdAt: new Date(now.getTime() - 7 * 86400000),
      });
      mem.patients.push({
        id: patientId,
        userId,
        firstName,
        lastName,
        phone,
      });
      mem.notificationPreferences.push({
        userId,
        emailPromotional: true,
        consentedAt: now,
        updatedAt: now,
      });
    }
    return { userId, patientId };
  };

  // 4. Demo Patients & Appointments for Dr. Ananya Sharma (General Medicine)
  const doc1 = "doc_ananya_sharma";

  // Case 1: Completed earlier today
  const pat1 = addPatient("priya", "Priya", "Deshmukh", "9822011111");
  const slot1 = slotWindow(-75);
  mem.appointments.push({
    id: "demo_appt_sharma_1",
    patientId: pat1.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot1.startTime,
    endTime: slot1.endTime,
    status: "COMPLETED",
    tokenNumber: 1,
    reason: "Severe throat infection & high fever",
    checkedInAt: new Date(now.getTime() - 85 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    consultationStartedAt: new Date(now.getTime() - 72 * 60_000),
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 2: In Consultation right now
  const pat2 = addPatient("rahul", "Rahul", "Joshi", "9822022222");
  const slot2 = slotWindow(-15);
  mem.appointments.push({
    id: "demo_appt_sharma_2",
    patientId: pat2.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot2.startTime,
    endTime: slot2.endTime,
    status: "IN_CONSULTATION",
    tokenNumber: 2,
    reason: "Type 2 Diabetes quarterly follow-up",
    checkedInAt: new Date(now.getTime() - 25 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    consultationStartedAt: new Date(now.getTime() - 6 * 60_000),
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 3: Waiting in OPD - Token 3 (checked in 15 min ago)
  const pat3 = addPatient("sneha", "Sneha", "Kulkarni", "9822033333");
  const slot3 = slotWindow(0);
  mem.appointments.push({
    id: "demo_appt_sharma_3",
    patientId: pat3.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot3.startTime,
    endTime: slot3.endTime,
    status: "CHECKED_IN",
    tokenNumber: 3,
    reason: "Seasonal allergy and chronic migraine",
    checkedInAt: new Date(now.getTime() - 15 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 4: Waiting in OPD - Token 4 (checked in 22 min ago - arrived BEFORE Sneha!)
  const pat4 = addPatient("amit", "Amit", "Patil", "9822044444");
  const slot4 = slotWindow(15);
  mem.appointments.push({
    id: "demo_appt_sharma_4",
    patientId: pat4.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot4.startTime,
    endTime: slot4.endTime,
    status: "CHECKED_IN",
    tokenNumber: 4,
    reason: "Hypertension check and blood pressure review",
    checkedInAt: new Date(now.getTime() - 22 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 5: Waiting in OPD - Token 5 (checked in by Dr. Sharma herself 8 min ago)
  const pat5 = addPatient("vikram", "Vikram", "Shinde", "9822055555");
  const slot5 = slotWindow(30);
  mem.appointments.push({
    id: "demo_appt_sharma_5",
    patientId: pat5.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot5.startTime,
    endTime: slot5.endTime,
    status: "CHECKED_IN",
    tokenNumber: 5,
    reason: "Abdominal pain & gastroenteritis evaluation",
    checkedInAt: new Date(now.getTime() - 8 * 60_000),
    checkedInBy: "Dr. Ananya Sharma",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 6: Cancelled
  const pat6 = addPatient("neha", "Neha", "Sawant", "9822066666");
  const slot6 = slotWindow(-45);
  mem.appointments.push({
    id: "demo_appt_sharma_6",
    patientId: pat6.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot6.startTime,
    endTime: slot6.endTime,
    status: "CANCELLED",
    tokenNumber: 6,
    reason: "Routine general physical examination",
    cancelledBy: "PATIENT",
    cancelReason: "Cancelled due to out of town emergency",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 7: No-Show (slot was 35 min ago, patient never arrived)
  const pat7 = addPatient("rajesh", "Rajesh", "More", "9822077777");
  const slot7 = slotWindow(-35);
  mem.appointments.push({
    id: "demo_appt_sharma_7",
    patientId: pat7.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot7.startTime,
    endTime: slot7.endTime,
    status: "NO_SHOW",
    tokenNumber: 7,
    reason: "Chronic back stiffness & joint ache",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 8: Not Arrived - slot HAS ALREADY STARTED (started 10 min ago!)
  // Perfect for receptionist testing No-Show or Late Check-in!
  const pat8 = addPatient("pooja", "Pooja", "Gaikwad", "9822088888");
  const slot8 = slotWindow(-10);
  mem.appointments.push({
    id: "demo_appt_sharma_8",
    patientId: pat8.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot8.startTime,
    endTime: slot8.endTime,
    status: "BOOKED",
    tokenNumber: 8,
    reason: "Persistent dry cough & mild asthma",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 9: Not Arrived - upcoming slot in 45 min
  const pat9 = addPatient("kavita", "Kavita", "Pawar", "9822099999");
  const slot9 = slotWindow(45);
  mem.appointments.push({
    id: "demo_appt_sharma_9",
    patientId: pat9.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot9.startTime,
    endTime: slot9.endTime,
    status: "BOOKED",
    tokenNumber: 9,
    reason: "Thyroid hormone report consultation",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Case 10: Not Arrived - upcoming slot in 60 min
  const pat10 = addPatient("sachin", "Sachin", "Jadhav", "9822010101");
  const slot10 = slotWindow(60);
  mem.appointments.push({
    id: "demo_appt_sharma_10",
    patientId: pat10.patientId,
    doctorId: doc1,
    appointmentDate: today,
    startTime: slot10.startTime,
    endTime: slot10.endTime,
    status: "BOOKED",
    tokenNumber: 10,
    reason: "Post-viral fatigue and vitamin deficiency",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // 5. Appointments for Dr. Rohan Mehta (Cardiology)
  const doc2 = "doc_rohan_mehta";

  // Cardiology Case 1: In Consultation
  const pat11 = addPatient("suresh", "Suresh", "Nair", "9822011122");
  const slot11 = slotWindow(-10);
  mem.appointments.push({
    id: "demo_appt_mehta_1",
    patientId: pat11.patientId,
    doctorId: doc2,
    appointmentDate: today,
    startTime: slot11.startTime,
    endTime: slot11.endTime,
    status: "IN_CONSULTATION",
    tokenNumber: 1,
    reason: "Post-angioplasty 6-month coronary review",
    checkedInAt: new Date(now.getTime() - 20 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    consultationStartedAt: new Date(now.getTime() - 5 * 60_000),
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Cardiology Case 2: Waiting in OPD
  const pat12 = addPatient("manisha", "Manisha", "Rao", "9822011133");
  const slot12 = slotWindow(10);
  mem.appointments.push({
    id: "demo_appt_mehta_2",
    patientId: pat12.patientId,
    doctorId: doc2,
    appointmentDate: today,
    startTime: slot12.startTime,
    endTime: slot12.endTime,
    status: "CHECKED_IN",
    tokenNumber: 2,
    reason: "Palpitations and Holter monitor analysis",
    checkedInAt: new Date(now.getTime() - 10 * 60_000),
    checkedInBy: "Reception: Front Desk Staff",
    createdAt: new Date(now.getTime() - 86400000),
  });

  // Cardiology Case 3: Not Arrived (upcoming in 30 min)
  const pat13 = addPatient("deepak", "Deepak", "Shrestha", "9822011144");
  const slot13 = slotWindow(30);
  mem.appointments.push({
    id: "demo_appt_mehta_3",
    patientId: pat13.patientId,
    doctorId: doc2,
    appointmentDate: today,
    startTime: slot13.startTime,
    endTime: slot13.endTime,
    status: "BOOKED",
    tokenNumber: 3,
    reason: "Lipid panel review and cardiac risk assessment",
    createdAt: new Date(now.getTime() - 86400000),
  });
}
