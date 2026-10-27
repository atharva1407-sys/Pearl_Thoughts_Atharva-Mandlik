import Link from "next/link";
import { dbRepo, type AppointmentEntity } from "@/db/repo";
import { getCurrentUser } from "@/actions/auth";
import {
  Users,
  Clock3,
  Stethoscope,
  HeartPulse,
  ArrowRight,
  ShieldCheck,
  FileText,
  Activity,
  Plus,
  CalendarDays,
  FileBarChart,
  Settings
} from "lucide-react";

export default async function HomePage() {
  const user = await getCurrentUser();
  const [doctors, allAppointments, allPatients] = await Promise.all([
    dbRepo.getAllDoctors(),
    dbRepo.getAllAppointments(),
    dbRepo.getAllPatients(),
  ]);

  const patientMap = new Map(allPatients.map((p) => [p.id, p]));
  const bookedAppointments = allAppointments.filter((a) => a.status === "BOOKED");
  const completedAppointments = allAppointments.filter((a) => a.status === "COMPLETED");

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">RUBY HALL · PUNE</div>
          <h1>{user ? `Good morning, ${user.name}` : "Welcome to Medrella Healthcare"}</h1>
          <p>Outpatient scheduling and clinical hospital operations at Ruby Hall, Pune.</p>
        </div>
        <div className="heading-actions">
          <Link href="/doctors" className="btn primary">
            <Plus size={15} />
            <span>Book Appointment</span>
          </Link>
          <Link href="/reports" className="btn">
            <FileText size={15} />
            <span>Export Log</span>
          </Link>
        </div>
      </div>

      {/* Facility Status Banner */}
      <div className="alert-banner bg-blue-50/70 border-blue-200 text-blue-900">
        <ShieldCheck size={20} className="text-blue-600 flex-shrink-0" />
        <div>
          <b>Hospital Outpatient Operations Active</b>
          <span>All clinical appointment windows and triage queues are connected to Ruby Hall, Pune.</span>
        </div>
        <span className="badge blue">Operational</span>
      </div>

      {/* Stat Grid (Real dynamic database metrics) */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <Users />
            </span>
            <span className="badge sky">Registered</span>
          </div>
          <div className="stat-value">{allPatients.length}</div>
          <div className="stat-label">Total Patients</div>
          <div className="stat-note">Active patient records</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-amber-600 bg-amber-50">
              <Clock3 />
            </span>
            <span className="badge amber">Queue</span>
          </div>
          <div className="stat-value">{bookedAppointments.length}</div>
          <div className="stat-label">Waiting in Queue</div>
          <div className="stat-note">Scheduled for consultation</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <Stethoscope />
            </span>
            <span className="badge green">Completed</span>
          </div>
          <div className="stat-value">{completedAppointments.length}</div>
          <div className="stat-label">Completed Consults</div>
          <div className="stat-note">Finished clinical visits</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-purple-600 bg-purple-50">
              <HeartPulse />
            </span>
            <span className="badge blue">Staff</span>
          </div>
          <div className="stat-value">{doctors.length}</div>
          <div className="stat-label">Specialists Available</div>
          <div className="stat-note">Across hospital departments</div>
        </div>
      </div>

      {/* Content Grid: Real Appointments Table + Live Queue Overview */}
      <div className="content-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Today&apos;s appointments</h2>
              <p>Monday, 5 October · Ruby Hall OPD</p>
            </div>
            <Link href="/schedule">
              View schedule <ArrowRight size={14} />
            </Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Specialist</th>
                  <th>Reason for visit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <div>No active appointments currently scheduled.</div>
                      <Link
                        href="/doctors"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold mt-2 hover:underline"
                      >
                        <Plus size={14} />
                        <span>Book a new consultation</span>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  allAppointments.map((appt: AppointmentEntity) => {
                    const doc = doctors.find((d) => d.id === appt.doctorId);
                    const patient = patientMap.get(appt.patientId);
                    return (
                      <tr key={appt.id}>
                        <td className="font-mono font-bold text-slate-800">{appt.startTime}</td>
                        <td>
                          <b>{patient ? `${patient.firstName} ${patient.lastName}` : "Patient"}</b>
                          <small>{appt.appointmentDate}</small>
                        </td>
                        <td>{doc ? `Dr. ${doc.firstName} ${doc.lastName}` : "Specialist"}</td>
                        <td>{appt.reason}</td>
                        <td>
                          <span
                            className={`badge ${
                              appt.status === "BOOKED"
                                ? "green"
                                : appt.status === "COMPLETED"
                                ? "blue"
                                : "red"
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>
                        <td>
                          <Link href="/patient/dashboard" className="icon-btn">
                            <ArrowRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Queue Overview Card */}
        <div className="card flex flex-col justify-between">
          <div>
            <div className="card-head">
              <div>
                <h2>Queue overview</h2>
                <p>Ruby Hall, Pune</p>
              </div>
              <span className="badge green">
                <span className="live-dot" /> Live
              </span>
            </div>

            <div className="queue-summary">
              <div>
                <strong>{bookedAppointments.length}</strong>
                <span>Waiting</span>
              </div>
              <div>
                <strong>{completedAppointments.length}</strong>
                <span>Completed</span>
              </div>
              <div>
                <strong>{doctors.length}</strong>
                <span>Doctors</span>
              </div>
            </div>

            <div className="mini-progress">
              <span
                style={{
                  width:
                    allAppointments.length > 0
                      ? `${Math.min(100, Math.round((completedAppointments.length / allAppointments.length) * 100))}%`
                      : "0%",
                }}
              />
            </div>

            <p className="muted tiny">
              {bookedAppointments.length > 0
                ? `${bookedAppointments.length} patient(s) in active queue`
                : "Queue is currently clear. No patients waiting."}
            </p>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 mt-4 leading-relaxed">
              Appointments scheduled by patients automatically synchronize with OPD waiting queues and doctor agendas.
            </div>
          </div>

          <Link href="/queue" className="full-link">
            <span>Open live queue board</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* Bottom Grid: Recent Activity + Quick Actions */}
      <div className="bottom-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Recent activity</h2>
              <p>Latest hospital events</p>
            </div>
            <Link href="/reports" className="text-btn">
              View all
            </Link>
          </div>

          <div className="space-y-1">
            {allAppointments.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No recent appointment activity recorded yet.
              </div>
            ) : (
              allAppointments.slice(0, 3).map((apt: AppointmentEntity) => (
                <div key={apt.id} className="activity-item">
                  <span
                    className={`activity-dot ${
                      apt.status === "COMPLETED"
                        ? "green"
                        : apt.status === "BOOKED"
                        ? "blue"
                        : "amber"
                    }`}
                  />
                  <div>
                    <b>
                      {apt.status === "COMPLETED"
                        ? "Consultation Completed"
                        : "Appointment Scheduled"}
                    </b>
                    <small>
                      {apt.reason} · {apt.startTime}
                    </small>
                  </div>
                  <time>{apt.appointmentDate}</time>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Quick actions</h2>
              <p>Common clinical tasks</p>
            </div>
          </div>

          <div className="quick-actions">
            <Link href="/doctors" className="quick-action">
              <span className="quick-icon">
                <Users size={16} />
              </span>
              <span>
                <b>Find specialist</b>
                <small>Browse doctors</small>
              </span>
              <ArrowRight size={14} className="text-slate-400" />
            </Link>

            <Link href="/schedule" className="quick-action">
              <span className="quick-icon">
                <CalendarDays size={16} />
              </span>
              <span>
                <b>Weekly schedule</b>
                <small>View OPD matrix</small>
              </span>
              <ArrowRight size={14} className="text-slate-400" />
            </Link>

            <Link href="/encounters" className="quick-action">
              <span className="quick-icon">
                <Stethoscope size={16} />
              </span>
              <span>
                <b>Doctor encounter</b>
                <small>Chart visit & vitals</small>
              </span>
              <ArrowRight size={14} className="text-slate-400" />
            </Link>

            <Link href="/reports" className="quick-action">
              <span className="quick-icon">
                <FileBarChart size={16} />
              </span>
              <span>
                <b>View reports</b>
                <small>Census & exports</small>
              </span>
              <ArrowRight size={14} className="text-slate-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
