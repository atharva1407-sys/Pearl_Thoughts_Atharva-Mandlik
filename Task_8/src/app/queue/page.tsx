import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { computeDoctorQueue, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/queue";
import { sessionAppliesOnDate } from "@/lib/session-schedule";
import { AutoRefresh } from "./auto-refresh";
import { istDateString, formatKolkataDate, formatKolkataHHMM } from "@/lib/time";
import {
  Clock3,
  CheckCircle2,
  Stethoscope,
  UserCheck,
  UserX,
  Users,
  Calendar,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UnavailableRescheduleProvider } from "@/components/unavailable-reschedule-provider";
import {
  CheckInButton,
  StartConsultationButton,
  CompleteConsultationButton,
  UnavailableButton,
} from "./queue-action-buttons";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface QueuePageProps {
  searchParams?: Promise<{ date?: string; doctorId?: string }>;
}

export default async function QueuePage({ searchParams }: QueuePageProps) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "DOCTOR" && user.role !== "RECEPTIONIST")) {
    redirect("/login?message=Only authorized medical or front-desk staff can access the outpatient triage queue.");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const today = istDateString(new Date());
  const requestedDate = resolvedParams?.date;
  // Must match the format AND be a real calendar date (so 2026-13-45 falls back to today).
  const targetDate =
    requestedDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) &&
    new Date(`${requestedDate}T00:00:00Z`).toISOString().slice(0, 10) === requestedDate
      ? requestedDate
      : today;

  let activeDoctorId = user.profileId;
  let allDoctors: any[] = [];

  if (user.role === "RECEPTIONIST") {
    allDoctors = await dbRepo.getAllDoctors();
    if (resolvedParams?.doctorId && allDoctors.some((d) => d.id === resolvedParams.doctorId)) {
      activeDoctorId = resolvedParams.doctorId;
    } else if (allDoctors.length > 0) {
      activeDoctorId = allDoctors[0].id;
    }
  }

  const [doctor, doctorAppointments, availabilities] = await Promise.all([
    dbRepo.getDoctorById(activeDoctorId),
    dbRepo.getAppointmentsByDoctorId(activeDoctorId),
    dbRepo.getAvailabilitiesByDoctorId(activeDoctorId),
  ]);

  // Use the session that actually runs on the viewed date, not just the doctor's first active one.
  const activeSession = availabilities.find((a) => sessionAppliesOnDate(a, targetDate));
  const slotDuration = activeSession?.slotDurationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

  const queue = computeDoctorQueue(doctorAppointments, {
    targetDate,
    slotDurationMinutes: slotDuration,
  });

  const isToday = targetDate === today;

  return (
    <UnavailableRescheduleProvider>
    <div className="space-y-6">
      {isToday && <AutoRefresh intervalSeconds={20} />}
      {/* Queue Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-wider uppercase font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              OPD CLINICAL QUEUE
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-600 font-medium">
              {formatKolkataDate(targetDate)}
            </span>
            {!isToday && (
              <Badge variant="amber" className="text-[10px]">
                Viewing Past/Future Date
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Dr. {doctor ? `${doctor.firstName} ${doctor.lastName}` : "Physician"}&apos;s Queue
          </h1>
          <p className="text-xs text-slate-500">
            {doctor?.specialization || "Clinical"} Department · Ruby Hall Clinic, Pune
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isToday ? (
            <Link
              href={user.role === "RECEPTIONIST" ? `/queue?doctorId=${activeDoctorId}` : "/queue"}
              className="btn text-xs inline-flex items-center gap-1.5"
            >
              <Calendar size={13} />
              <span>Back to Today</span>
            </Link>
          ) : (
            <Badge variant="green" className="text-xs py-1 px-2.5">
              <span className="live-dot" /> {queue.waiting.length} waiting · Live
            </Badge>
          )}
          {user.role === "RECEPTIONIST" ? (
            <Link href="/reception" className="btn text-xs inline-flex items-center gap-1">
              <span>Reception Console</span>
              <ChevronRight size={13} />
            </Link>
          ) : (
            <Link href="/doctor/dashboard" className="btn text-xs inline-flex items-center gap-1">
              <span>Doctor Agenda</span>
              <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {/* Doctor Switcher for Receptionist */}
      {user.role === "RECEPTIONIST" && allDoctors.length > 1 && (
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap pl-1">
            Doctor:
          </span>
          {allDoctors.map((doc) => {
            const isSelected = doc.id === activeDoctorId;
            return (
              <Link
                key={doc.id}
                href={`/queue?${new URLSearchParams({
                  ...(targetDate !== today ? { date: targetDate } : {}),
                  doctorId: doc.id,
                })}`}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Dr. {doc.firstName} {doc.lastName} ({doc.specialization})
              </Link>
            );
          })}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Stethoscope size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Now Serving</div>
            <div className="text-base font-bold text-slate-900">
              {queue.nowServing ? `Token #${queue.nowServing.tokenNumber}` : "Idle"}
            </div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Users size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">In Waiting Room</div>
            <div className="text-base font-bold text-amber-700">{queue.waiting.length}</div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <Clock3 size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Not Yet Arrived</div>
            <div className="text-base font-bold text-slate-700">{queue.notArrived.length}</div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Completed Today</div>
            <div className="text-base font-bold text-emerald-700">{queue.finished.length}</div>
          </div>
        </Card>
      </div>

      {/* Now Serving Banner Card */}
      <Card className="border-blue-200 bg-linear-to-r from-blue-50/50 via-white to-white overflow-hidden shadow-xs">
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant={queue.nowServing ? "blue" : "gray"}>
                  {queue.nowServing ? "ACTIVE CONSULTATION IN PROGRESS" : "CONSULTATION ROOM READY"}
                </Badge>
                {queue.nowServing?.consultationStartedAt && (
                  <span className="text-xs text-slate-500">
                    Started at {formatKolkataHHMM(queue.nowServing.consultationStartedAt)}
                  </span>
                )}
              </div>

              {queue.nowServing ? (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-black text-blue-900 tracking-tight">
                      Token #{queue.nowServing.tokenNumber}
                    </span>
                    <span className="text-lg font-bold text-slate-800">
                      {queue.nowServing.patient.firstName} {queue.nowServing.patient.lastName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Slot: <span className="font-mono">{queue.nowServing.startTime} – {queue.nowServing.endTime}</span> · Phone: {queue.nowServing.patient.phone} · Chief Complaint: {queue.nowServing.reason || "General Consultation"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-800">No Patient Currently In Consultation</h3>
                  <p className="text-xs text-slate-500">
                    {queue.waiting.length > 0
                      ? `There are ${queue.waiting.length} checked-in patient(s) waiting outside.`
                      : "The waiting room is currently empty."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {user.role === "DOCTOR" ? (
                queue.nowServing ? (
                  <CompleteConsultationButton appointmentId={queue.nowServing.id} />
                ) : queue.waiting.length > 0 ? (
                  <StartConsultationButton
                    appointmentId={queue.waiting[0].appointment.id}
                    isNext={true}
                  />
                ) : null
              ) : (
                queue.nowServing && (
                  <Badge variant="blue" className="text-xs py-1 px-2.5">
                    Consultation in Progress
                  </Badge>
                )
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Checked-In Waiting Patients */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-0 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Waiting Patients Queue</h2>
                <p className="text-xs text-slate-500">
                  Checked in and physically waiting in the OPD clinic
                </p>
              </div>
              <Badge variant="amber">{queue.waiting.length} in line</Badge>
            </div>

            {queue.waiting.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                <Users size={28} className="mx-auto text-slate-300" />
                <div>No checked-in patients are currently waiting.</div>
                {queue.notArrived.length > 0 && (
                  <div className="text-slate-500">
                    Check in arrived patients below to advance them into this active queue.
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {queue.waiting.map((item) => {
                  const apt = item.appointment;
                  const patient = apt.patient;
                  const isFirst = item.queuePosition === 1;

                  return (
                    <div
                      key={apt.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isFirst ? "bg-amber-50/30" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                          <span className="text-[10px] uppercase font-bold text-blue-600">Pos</span>
                          <span className="text-base font-black leading-none">#{item.queuePosition}</span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              Token #{apt.tokenNumber}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {patient.firstName} {patient.lastName}
                            </span>
                            {isFirst && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                Up Next
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                            <span>Phone: {patient.phone}</span>
                            <span>·</span>
                            <span>Slot: {apt.startTime}</span>
                            <span>·</span>
                            <span>
                              Checked in:{" "}
                              <b className="text-slate-700">
                                {apt.checkedInAt ? formatKolkataHHMM(apt.checkedInAt) : "Yes"}
                              </b>
                            </span>
                          </div>

                          <div className="text-xs text-slate-600">
                            Reason: <span className="text-slate-800">{apt.reason || "General"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <div className="text-right">
                          <div className="text-[11px] font-semibold text-amber-700">
                            {item.estimatedWaitMinutes === 0
                              ? "Next in line"
                              : `Est. wait: ~${item.estimatedWaitMinutes}m`}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isFirst ? "Room ready" : `${item.queuePosition - 1} ahead`}
                          </div>
                        </div>

                        <UnavailableButton
                          appointmentId={apt.id}
                          patientName={`${patient.firstName} ${patient.lastName}`}
                          doctorId={apt.doctorId}
                          doctorName={doctor ? `${doctor.firstName} ${doctor.lastName}` : "Physician"}
                          appointmentDate={apt.appointmentDate}
                          startTime={apt.startTime}
                        />

                        {user.role === "DOCTOR" && (
                          <StartConsultationButton
                            appointmentId={apt.id}
                            isNext={isFirst && !queue.nowServing}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Not Yet Arrived Patients */}
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Not Yet Arrived</h2>
                <p className="text-xs text-slate-500">Scheduled for today but unconfirmed</p>
              </div>
              <Badge variant="gray">{queue.notArrived.length}</Badge>
            </div>

            {queue.notArrived.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1" />
                <div>All scheduled patients have either checked in or completed their visit.</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {queue.notArrived.map((apt) => (
                  <div key={apt.id} className="p-3.5 space-y-2 hover:bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          #{apt.tokenNumber}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {apt.patient.firstName} {apt.patient.lastName}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-500">{apt.startTime}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 truncate">
                      {apt.reason || "Scheduled Consultation"}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400">Phone: {apt.patient.phone}</span>
                      <CheckInButton appointmentId={apt.id} patientName={apt.patient.firstName} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Day Summary & Missed */}
          {(queue.finished.length > 0 || queue.missed.length > 0) && (
            <Card className="p-4 space-y-3 shadow-xs bg-slate-50/60 border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Session Audit Summary
              </h3>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Completed Consultations</span>
                  <span className="font-bold text-emerald-700">{queue.finished.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>No-Show / Cancelled / Expired</span>
                  <span className="font-bold text-slate-700">{queue.missed.length}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                  <span className="font-semibold text-slate-800">Total Scheduled Capacity</span>
                  <span className="font-bold text-slate-900">{queue.totalExpected + queue.missed.length}</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
    </UnavailableRescheduleProvider>
  );
}
