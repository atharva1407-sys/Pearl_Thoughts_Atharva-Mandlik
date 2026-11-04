import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  Clock3,
  ArrowRight,
  CheckCircle,
  Stethoscope,
  Plus
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
export default async function QueuePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Only authorized medical staff can access the outpatient triage queue.");
  }

  // Doctor Data Scoping: load strictly the logged-in doctor's appointments and associated patients
  const [doctor, doctorAppointments] = await Promise.all([
    dbRepo.getDoctorById(user.profileId),
    dbRepo.getAppointmentsByDoctorId(user.profileId),
  ]);

  const queueAppointments = doctorAppointments.filter((a) => a.status === "BOOKED");
  const nextPatient = queueAppointments[0];

  return (
    <div className="space-y-6">
      {/* Queue Toolbar */}
      <div className="queue-toolbar">
        <div>
          <h2>Dr. {doctor ? `${doctor.firstName} ${doctor.lastName}` : "Physician"}&apos;s Queue</h2>
          <p>Live outpatient consultations for {doctor?.specialization || "Clinical"} Department · Ruby Hall, Pune</p>
        </div>
        <Badge variant="green">
          <span className="live-dot" /> {queueAppointments.length} waiting · Live
        </Badge>
      </div>

      <div className="queue-layout">
        {/* Left Side: Active Queue List */}
        <Card>
          <div className="card-head">
            <h2>My waiting patients</h2>
            <Link href="/doctors" className="btn text-xs">
              <Plus size={14} /> Add Booking
            </Link>
          </div>

          {queueAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <Clock3 size={24} className="mx-auto text-slate-300" />
              <div>Your outpatient consultation queue is currently clear. No patients waiting.</div>
              <Link
                href="/doctor/dashboard"
                className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold hover:underline"
              >
                Go to Doctor Agenda
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {queueAppointments.map((apt) => {
                const patient = apt.patient;

                return (
                  <div key={apt.id} className="patient-row">
                    <div className="token bg-blue-50 text-blue-800 font-bold flex flex-col items-center justify-center">
                      <span className="text-xs font-black">#{apt.tokenNumber}</span>
                      <span className="text-[9px] text-slate-400 font-normal">Token</span>
                    </div>

                    <div className="patient-main">
                      <strong>
                        {patient ? `${patient.firstName} ${patient.lastName}` : "Patient"}
                      </strong>
                      <small>
                        Contact: {patient?.phone || "On File"} · Reason: {apt.reason}
                      </small>

                      <div className="chips">
                        <Badge variant="sky">Scheduled</Badge>
                        <Badge variant="gray">Date: {apt.appointmentDate}</Badge>
                        {apt.rescheduledAt && (
                          <Badge className="purple">Rescheduled</Badge>
                        )}
                        <Badge variant="amber">Est. wait: ~{(apt.tokenNumber - 1) * 20}m</Badge>
                      </div>
                    </div>

                    <div className="patient-end">
                      <small className="font-mono text-xs">{apt.startTime} – {apt.endTime}</small>
                      <Link
                        href="/doctor/dashboard"
                        className="icon-btn"
                        title="Manage in Doctor Agenda"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right Side: Next Patient Priority Card */}
        <Card className="next-patient space-y-4">
          <div className="card-head">
            <div>
              <p className="text-xs text-slate-400">Next patient in line</p>
              <h2>
                {nextPatient
                  ? `${nextPatient.patient.firstName} ${nextPatient.patient.lastName}`
                  : "Queue Clear"}
              </h2>
            </div>
            {nextPatient ? (
              <Badge variant="blue">Next</Badge>
            ) : (
              <Badge variant="green">All Done</Badge>
            )}
          </div>

          {nextPatient ? (
            <>
              <div className="info-line">
                <span>Reason:</span>
                <b>{nextPatient.reason}</b>
              </div>

              <div className="info-line">
                <span>Attending Physician:</span>
                <b>
                  Dr. {doctor?.firstName} {doctor?.lastName}
                </b>
              </div>

              <div className="info-line">
                <span>Time Slot:</span>
                <b className="font-mono">{nextPatient.startTime} – {nextPatient.endTime}</b>
              </div>

              <div className="info-line">
                <span>Date:</span>
                <b>{nextPatient.appointmentDate}</b>
              </div>

              <div className="pt-2 space-y-2">
                <Link href="/doctor/dashboard" className="btn primary w-full justify-center">
                  <Stethoscope size={15} />
                  <span>Open Doctor Agenda to Complete</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 space-y-2">
              <CheckCircle size={22} className="mx-auto text-emerald-500" />
              <div>All scheduled patient consultations have been completed.</div>
              <Link href="/doctor/dashboard" className="btn primary text-xs justify-center w-full mt-2">
                <span>View Full Agenda</span>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
