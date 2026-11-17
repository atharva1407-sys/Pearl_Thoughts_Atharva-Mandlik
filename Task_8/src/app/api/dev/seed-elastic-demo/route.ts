import { NextResponse } from "next/server";
import { dbRepo, dayOfWeekFor } from "@/db/repo";
import { isPostgresConfigured } from "@/db/index";
import { hashPassword } from "@/lib/auth-crypto";
import { addDaysToDate } from "@/lib/session-schedule";
import { istDateString } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo helper for the Elastic Scheduling video. Creates, in one call, a doctor with a Wave session of
 * 09:00-11:00 (two one-hour slots, 5 seats each) on a date a week from today, plus ten patients who have
 * booked EVERY seat of EVERY slot. That is the "all slots booked" starting point the demo needs
 * (shrinking then has nowhere to move anyone), without ten manual sign-ups.
 *
 * Safe by design: it only runs on a developer machine with NO database configured (the in-memory
 * mode, e.g. `DATABASE_URL=disabled npm run dev`). It refuses in production and whenever a real
 * Postgres database is configured, so it can never write demo data into real data.
 */
const DOCTOR_EMAIL = "elastic.demo.doctor@example.com";
const DEMO_PASSWORD = "ElasticDemo#2026";
const PATIENT_NAMES = [
  "Asha Kulkarni", "Rohan Joshi", "Meera Deshpande", "Kabir Shah", "Nisha Patil",
  "Vikram Rao", "Sneha Iyer", "Arjun Nair", "Pooja Menon", "Dev Malhotra",
];
const SLOTS = [
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
];
const SEATS_PER_SLOT = 5;

export async function GET() {
  if (process.env.NODE_ENV === "production" || isPostgresConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The demo seeder only runs in local in-memory mode (no database configured). Start the app with DATABASE_URL set to something that is not a postgres URL, for example: DATABASE_URL=disabled npm run dev",
      },
      { status: 403 }
    );
  }

  const date = addDaysToDate(istDateString(new Date()), 7);
  const existing = await dbRepo.getUserByEmail(DOCTOR_EMAIL);
  if (existing) {
    return NextResponse.json({ success: true, alreadySeeded: true, ...summary(date) });
  }

  const doctorUser = await dbRepo.createUser({
    id: `usr-elastic-demo-doctor`,
    email: DOCTOR_EMAIL,
    passwordHash: hashPassword(DEMO_PASSWORD),
    role: "DOCTOR",
    isActive: true,
  });
  const doctor = await dbRepo.createDoctor({
    id: "doc-elastic-demo",
    userId: doctorUser.id,
    firstName: "Elastic",
    lastName: "Demo",
    specialization: "General Medicine",
    phone: "+91 20 0000 0000",
    licenseNumber: "ELASTIC-DEMO-001",
    experienceYears: 10,
    consultationFee: 0,
  });
  const session = await dbRepo.createAvailabilitySession({
    doctorId: doctor.id,
    name: "Hour OPD",
    recurrence: "ONE_TIME",
    specificDate: date,
    dayOfWeek: dayOfWeekFor(date),
    startTime: "09:00",
    endTime: "11:00",
    slotDurationMinutes: 60,
    isActive: true,
    schedulingType: "WAVE",
    patientsPerWave: SEATS_PER_SLOT,
  });

  for (let i = 0; i < PATIENT_NAMES.length; i++) {
    const [firstName, lastName] = PATIENT_NAMES[i].split(" ");
    const user = await dbRepo.createUser({
      id: `usr-elastic-demo-patient-${i + 1}`,
      email: `elastic.demo.patient${i + 1}@example.com`,
      passwordHash: hashPassword(DEMO_PASSWORD),
      role: "PATIENT",
      isActive: true,
    });
    const patient = await dbRepo.createPatient({
      id: `pat-elastic-demo-${i + 1}`,
      userId: user.id,
      firstName,
      lastName,
      phone: `+91 98765 0000${i + 1}`,
    });
    const res = await dbRepo.createAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      sessionId: session.id,
      appointmentDate: date,
      startTime: SLOTS[Math.floor(i / SEATS_PER_SLOT)].startTime,
      endTime: SLOTS[Math.floor(i / SEATS_PER_SLOT)].endTime,
      reason: "Elastic scheduling demo",
    });
    if (!res.success) {
      return NextResponse.json({ success: false, error: `Could not book seat ${i + 1}: ${res.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, alreadySeeded: false, ...summary(date) });
}

function summary(date: string) {
  return {
    date,
    session: "Hour OPD, 09:00-11:00, Wave, 5 patients per slot: both slots completely full (10 of 10 seats booked)",
    doctor: { email: DOCTOR_EMAIL, password: DEMO_PASSWORD, portal: "Doctor Portal tab on the login page" },
    patients: PATIENT_NAMES.map((name, i) => ({ name, email: `elastic.demo.patient${i + 1}@example.com`, password: DEMO_PASSWORD })),
    next: "Sign in as the doctor, open Weekly Shifts / One-Date sessions and edit the Hour OPD session.",
  };
}
