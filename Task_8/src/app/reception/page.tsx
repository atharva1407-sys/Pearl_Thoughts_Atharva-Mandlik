import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo, type AvailabilityEntity } from "@/db/repo";
import { computeDoctorQueue, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/queue";
import { sessionAppliesOnDate } from "@/lib/session-schedule";
import { istDateString } from "@/lib/time";
import { ReceptionClient, type ReceptionAppointment, type ReceptionDoctorSummary } from "./reception-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ReceptionPageProps {
  searchParams?: Promise<{ date?: string }>;
}

export default async function ReceptionPage({ searchParams }: ReceptionPageProps) {
  const user = await getCurrentUser();
  // Receptionist only: this page lists every doctor's patients (names, phones), so doctors must not open it.
  // A doctor manages their own patients from /queue and /doctor/dashboard.
  if (!user || user.role !== "RECEPTIONIST") {
    redirect(
      user?.role === "DOCTOR"
        ? "/queue"
        : "/login?message=Only front-desk receptionists can access the reception console."
    );
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const today = istDateString(new Date());
  const requestedDate = resolvedParams?.date;
  const targetDate =
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    new Date(`${requestedDate}T00:00:00Z`).toISOString().slice(0, 10) === requestedDate
      ? requestedDate
      : today;

  const [doctors, rawAppointments] = await Promise.all([
    dbRepo.getAllDoctors(),
    dbRepo.getAllAppointmentsForDate(targetDate),
  ]);

  const availabilitiesByDoctor: Record<string, AvailabilityEntity[]> = {};
  await Promise.all(
    doctors.map(async (doc) => {
      availabilitiesByDoctor[doc.id] = await dbRepo.getAvailabilitiesByDoctorId(doc.id);
    })
  );

  // Compute per-doctor queue summary for the target date
  const doctorQueues: Record<string, ReturnType<typeof computeDoctorQueue>> = {};
  for (const doc of doctors) {
    const docAppointments = rawAppointments.filter((a) => a.doctorId === doc.id);
    const docAvails = availabilitiesByDoctor[doc.id] || [];
    const activeSession = docAvails.find((a: AvailabilityEntity) => sessionAppliesOnDate(a, targetDate));
    const slotDuration = activeSession?.slotDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

    doctorQueues[doc.id] = computeDoctorQueue(docAppointments, {
      targetDate,
      slotDurationMinutes: slotDuration,
    });
  }

  const doctorSummaries: ReceptionDoctorSummary[] = doctors.map((d) => ({
    id: d.id,
    firstName: d.firstName,
    lastName: d.lastName,
    specialization: d.specialization,
    consultationFee: d.consultationFee,
  }));

  return (
    <ReceptionClient
      initialDate={targetDate}
      today={today}
      doctors={doctorSummaries}
      appointments={rawAppointments as ReceptionAppointment[]}
      doctorQueues={doctorQueues}
      userRole="RECEPTIONIST"
      userName={user.name || "Front Desk"}
    />
  );
}
