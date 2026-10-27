import Link from "next/link";
import { dbRepo } from "@/db/repo";
import {
  Clock3,
  AlertCircle,
  ArrowRight,
  Filter,
  CheckCircle,
  Stethoscope,
  HeartPulse,
  Plus
} from "lucide-react";

export default function QueuePage() {
  const allAppointments = dbRepo.getAllAppointments();
  const queueAppointments = allAppointments.filter((a) => a.status === "BOOKED");
  const nextPatient = queueAppointments[0];
  const nextPatientDetails = nextPatient ? dbRepo.getPatientById(nextPatient.patientId) : null;
  const nextDoctorDetails = nextPatient ? dbRepo.getDoctorById(nextPatient.doctorId) : null;

  return (
    <div className="space-y-6">
      {/* Queue Toolbar */}
      <div className="queue-toolbar">
        <div>
          <h2>Queue at SP Delta Hospital, T. Nagar</h2>
          <p>Live token session, sorted by appointment time and arrival priority</p>
        </div>
        <span className="badge green">
          <span className="live-dot" /> {queueAppointments.length} waiting · Live
        </span>
      </div>

      <div className="queue-layout">
        {/* Left Side: Active Queue List */}
        <div className="card">
          <div className="card-head">
            <h2>Patients in queue</h2>
            <Link href="/doctors" className="btn text-xs">
              <Plus size={14} /> Add Booking
            </Link>
          </div>

          {queueAppointments.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <Clock3 size={24} className="mx-auto text-slate-300" />
              <div>The outpatient queue is currently clear. No patients waiting.</div>
              <Link
                href="/doctors"
                className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold hover:underline"
              >
                + Book an appointment slot
              </Link>
            </div>
          ) : (
            <div className="space-y-1">
              {queueAppointments.map((apt, index) => {
                const patient = dbRepo.getPatientById(apt.patientId);
                const doctor = dbRepo.getDoctorById(apt.doctorId);

                return (
                  <div key={apt.id} className="patient-row">
                    <div className="token bg-blue-50 text-blue-800 font-bold">
                      #{index + 1}
                    </div>

                    <div className="patient-main">
                      <strong>
                        {patient ? `${patient.firstName} ${patient.lastName}` : "Patient"}
                      </strong>
                      <small>
                        Doctor: Dr. {doctor?.firstName} {doctor?.lastName} ({doctor?.specialization})
                      </small>
                      <span>{apt.reason}</span>

                      <div className="chips">
                        <span className="badge sky">Scheduled</span>
                        <span className="badge gray">Date: {apt.appointmentDate}</span>
                      </div>
                    </div>

                    <div className="patient-end">
                      <small className="font-mono text-xs">{apt.startTime}</small>
                      <Link
                        href="/encounters"
                        className="icon-btn"
                        title="Open Encounter"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Next Patient Priority Card */}
        <div className="card next-patient space-y-4">
          <div className="card-head">
            <div>
              <p className="text-xs text-slate-400">Next patient in line</p>
              <h2>
                {nextPatientDetails
                  ? `${nextPatientDetails.firstName} ${nextPatientDetails.lastName}`
                  : "Queue Clear"}
              </h2>
            </div>
            {nextPatient ? (
              <span className="badge blue">Next</span>
            ) : (
              <span className="badge green">All Done</span>
            )}
          </div>

          {nextPatient ? (
            <>
              <div className="info-line">
                <span>Reason:</span>
                <b>{nextPatient.reason}</b>
              </div>

              <div className="info-line">
                <span>Doctor:</span>
                <b>
                  Dr. {nextDoctorDetails?.firstName} {nextDoctorDetails?.lastName}
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
                <Link href="/encounters" className="btn primary w-full justify-center">
                  <Stethoscope size={15} />
                  <span>Open Consultation Workspace</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400 space-y-2">
              <CheckCircle size={22} className="mx-auto text-emerald-500" />
              <div>All scheduled patient consultations have been completed.</div>
              <Link href="/doctors" className="btn primary text-xs justify-center w-full mt-2">
                <span>Schedule New Patient</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
