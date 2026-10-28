import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { DoctorAppointmentActions } from "./doctor-appointment-actions";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
  Check,
  X,
  Stethoscope,
  Users
} from "lucide-react";

export default async function DoctorDashboard() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in to access the doctor dashboard.");
  }

  const [doctor, appointments, availabilities] = await Promise.all([
    dbRepo.getDoctorById(user.profileId),
    dbRepo.getAppointmentsByDoctorId(user.profileId),
    dbRepo.getAvailabilitiesByDoctorId(user.profileId),
  ]);

  const activeShifts = availabilities.filter((a) => a.isActive);
  const activeBookings = appointments.filter((a) => a.status === "BOOKED");
  const completedBookings = appointments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">PHYSICIAN AGENDA · OPD CLINICAL QUEUE</div>
          <h1>Dr. {doctor?.firstName} {doctor?.lastName}</h1>
          <p>
            {doctor?.specialization} Department · License #{doctor?.licenseNumber} · Fee: ₹{doctor?.consultationFee} · Ruby Hall, Pune
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/doctor/availability" className="btn primary">
            <CalendarClock size={15} />
            <span>Manage Shifts</span>
          </Link>
          <Link href="/queue" className="btn">
            <Clock3 size={15} />
            <span>Live Queue</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <Users />
            </span>
            <span className="badge amber">Queue</span>
          </div>
          <div className="stat-value">{activeBookings.length}</div>
          <div className="stat-label">Active Bookings</div>
          <div className="stat-note">Waiting for consultation</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CheckCircle2 />
            </span>
            <span className="badge green">Done</span>
          </div>
          <div className="stat-value">{completedBookings.length}</div>
          <div className="stat-label">Completed Consults</div>
          <div className="stat-note">Clinical notes filed</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-blue-600 bg-blue-50">
              <CalendarClock />
            </span>
            <span className="badge blue">Shifts</span>
          </div>
          <div className="stat-value">{activeShifts.length} Days</div>
          <div className="stat-label">Weekly Schedule</div>
          <div className="stat-note truncate">
            {activeShifts.map((s) => s.dayOfWeek).join(", ")}
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-purple-600 bg-purple-50">
              <Clock3 />
            </span>
            <span className="badge green">On Track</span>
          </div>
          <div className="stat-value">30m</div>
          <div className="stat-label">Slot Duration</div>
          <div className="stat-note">OPD consultation window</div>
        </div>
      </div>

      {/* Active Consultations Table Card */}
      <div className="card space-y-4">
        <div className="card-head">
          <div>
            <h2>Consultation Queue for Review</h2>
            <p>{activeBookings.length} patient appointments booked</p>
          </div>
          <span className="badge blue">Live Clinic Session</span>
        </div>

        {activeBookings.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50">
            No patient consultations are currently pending in your queue.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token #</th>
                  <th>Date & Time</th>
                  <th>Patient</th>
                  <th>Contact</th>
                  <th>Chief Complaint</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeBookings.map((apt, index) => (
                  <tr key={apt.id}>
                    <td>
                      <span className="token w-7 h-7 text-xs font-bold bg-blue-100 text-blue-800">
                        #{index + 1}
                      </span>
                    </td>
                    <td>
                      <b className="text-slate-900">{formatDate(apt.appointmentDate)}</b>
                      <small className="font-mono text-blue-600">{apt.startTime} – {apt.endTime}</small>
                    </td>
                    <td>
                      <b>{apt.patient.firstName} {apt.patient.lastName}</b>
                      <small>Patient ID: {apt.patientId.slice(0, 8)}</small>
                    </td>
                    <td className="font-mono text-xs">{apt.patient.phone}</td>
                    <td>
                      <span className="text-slate-700 font-medium">{apt.reason}</span>
                    </td>
                    <td>
                      <DoctorAppointmentActions
                        appointmentId={apt.id}
                        patientName={`${apt.patient.firstName} ${apt.patient.lastName}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed Consultations Card */}
      {completedBookings.length > 0 && (
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Completed Consultations History</h2>
              <p>{completedBookings.length} consultations finished</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Time Slot</th>
                  <th>Chief Complaint</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {completedBookings.map((apt) => (
                  <tr key={apt.id}>
                    <td><b>{formatDate(apt.appointmentDate)}</b></td>
                    <td>{apt.patient.firstName} {apt.patient.lastName}</td>
                    <td className="font-mono">{apt.startTime} – {apt.endTime}</td>
                    <td>{apt.reason}</td>
                    <td>
                      <span className="badge green">Completed</span>
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
