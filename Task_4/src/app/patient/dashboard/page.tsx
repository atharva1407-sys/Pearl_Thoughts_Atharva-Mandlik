import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { PatientAppointmentActions } from "./patient-appointment-actions";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  User,
  XCircle
} from "lucide-react";

export default async function PatientDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?message=Please sign in to access your appointments.");
  }

  let patientId = user.profileId;
  if (user.role === "DOCTOR") {
    const p = await dbRepo.getPatientByUserId(user.userId);
    if (p) {
      patientId = p.id;
    }
  }

  const patient = patientId ? await dbRepo.getPatientById(patientId) : undefined;
  const appointments = patientId ? await dbRepo.getAppointmentsByPatientId(patientId) : [];

  const upcoming = appointments.filter((a) => a.status === "BOOKED");
  const past = appointments.filter((a) => a.status !== "BOOKED");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">PATIENT CARE · OUTPATIENT PORTAL</div>
          <h1>Welcome, {patient ? `${patient.firstName} ${patient.lastName}` : user.name}</h1>
          <p>Manage your upcoming hospital consultations and clinical records at Ruby Hall, Pune.</p>
        </div>
        <div className="heading-actions">
          <Link href="/doctors" className="btn primary">
            <Plus size={15} />
            <span>Book New Appointment</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <CalendarDays />
            </span>
            <span className="badge blue">Active</span>
          </div>
          <div className="stat-value">{upcoming.length}</div>
          <div className="stat-label">Upcoming Visits</div>
          <div className="stat-note">
            {upcoming.length > 0 ? `Next: ${upcoming[0].appointmentDate}` : "No pending visits"}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CheckCircle2 />
            </span>
            <span className="badge green">Completed</span>
          </div>
          <div className="stat-value">{past.filter((a) => a.status === "COMPLETED").length}</div>
          <div className="stat-label">Past Consultations</div>
          <div className="stat-note">Medical history recorded</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-blue-600 bg-blue-50">
              <User />
            </span>
            <span className="badge sky">Verified</span>
          </div>
          <div className="stat-value text-lg mt-3 truncate">{patient?.firstName} {patient?.lastName}</div>
          <div className="stat-label">Patient Record</div>
          <div className="stat-note">Phone: {patient?.phone}</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-amber-600 bg-amber-50">
              <Clock3 />
            </span>
            <span className="badge amber">Pune</span>
          </div>
          <div className="stat-value text-lg mt-3">Ruby Hall</div>
          <div className="stat-label">Assigned Facility</div>
          <div className="stat-note">Pune, Maharashtra</div>
        </div>
      </div>

      {/* Upcoming Appointments Card */}
      <div className="card space-y-4">
        <div className="card-head">
          <div>
            <h2>Upcoming Hospital Consultations</h2>
            <p>{upcoming.length} scheduled appointment{upcoming.length === 1 ? "" : "s"}</p>
          </div>
          <Link href="/doctors" className="btn text-xs">
            + Schedule Another
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50">
            You currently have no upcoming visits.{" "}
            <Link href="/doctors" className="text-blue-600 font-bold hover:underline">
              Browse available specialists
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token #</th>
                  <th>Date & Time</th>
                  <th>Consulting Specialist</th>
                  <th>Specialty</th>
                  <th>Reason</th>
                  <th>Fee</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((apt) => (
                  <tr key={apt.id}>
                    <td>
                      <span className="token w-8 h-8 text-xs font-black bg-blue-100 text-blue-800 rounded-lg flex items-center justify-center">
                        #{apt.tokenNumber}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <b className="text-slate-800">{formatDate(apt.appointmentDate)}</b>
                        {apt.rescheduledAt && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 font-semibold px-1.5 py-0.5 rounded">
                            Rescheduled
                          </span>
                        )}
                      </div>
                      <small className="font-mono text-blue-600 block">{apt.startTime} – {apt.endTime}</small>
                      {apt.originalAppointmentDate && (
                        <small className="text-[10px] text-slate-400 block">
                          was {apt.originalAppointmentDate} {apt.originalStartTime}
                        </small>
                      )}
                    </td>
                    <td>
                      <b>Dr. {apt.doctor.firstName} {apt.doctor.lastName}</b>
                      <small>Ruby Hall, Pune</small>
                    </td>
                    <td>
                      <span className="badge blue">{apt.doctor.specialization}</span>
                    </td>
                    <td>{apt.reason}</td>
                    <td className="font-bold text-slate-900">₹{apt.doctor.consultationFee}</td>
                    <td>
                      <span className="badge green">Confirmed</span>
                    </td>
                    <td>
                      <PatientAppointmentActions
                        appointmentId={apt.id}
                        doctorId={apt.doctorId}
                        doctorName={`${apt.doctor.firstName} ${apt.doctor.lastName}`}
                        appointmentDate={apt.appointmentDate}
                        startTime={apt.startTime}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past Appointments Card */}
      {past.length > 0 && (
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Past Consultation History</h2>
              <p>{past.length} previous visit records</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Specialist</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map((apt) => (
                  <tr key={apt.id}>
                    <td>
                      <b>{formatDate(apt.appointmentDate)}</b>
                      <small>{apt.startTime}</small>
                    </td>
                    <td>Dr. {apt.doctor.firstName} {apt.doctor.lastName} ({apt.doctor.specialization})</td>
                    <td>{apt.reason}</td>
                    <td>
                      <span className={`badge ${apt.status === "COMPLETED" ? "blue" : "red"}`}>
                        {apt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
