import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { PatientAppointmentActions } from "./patient-appointment-actions";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { sweepExpiredHolds } from "@/lib/payments/expire";
import { runInBackground } from "@/lib/background";
import { formatPaise } from "@/lib/payments";

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
  CreditCard,
  FileText,
  XCircle,
} from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
export default async function PatientDashboard() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?message=Please sign in to access your appointments.");
  }

  // Opportunistic sweep of expired payment holds
  runInBackground(async () => {
    await sweepExpiredHolds(dbRepo);
  });

  let patientId = user.profileId;
  if (user.role === "DOCTOR") {
    const p = await dbRepo.getPatientByUserId(user.userId);
    if (p) {
      patientId = p.id;
    }
  }

  const patient = patientId ? await dbRepo.getPatientById(patientId) : undefined;
  const appointments = patientId ? await dbRepo.getAppointmentsByPatientId(patientId) : [];
  const payments = patientId ? await dbRepo.getPaymentsByPatientId(patientId) : [];
  const paymentByApptId = new Map(payments.map((p) => [p.appointmentId, p]));

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
        <div className="heading-actions flex items-center gap-2">
          <Link href="/patient/payments" className="btn text-xs inline-flex items-center gap-1.5">
            <CreditCard size={14} />
            <span>Payments & Receipts</span>
          </Link>
          <Link href="/doctors" className="btn primary text-xs inline-flex items-center gap-1.5">
            <Plus size={15} />
            <span>Book New Appointment</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="stat-grid">
        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <CalendarDays />
            </span>
            <Badge variant="blue">Active</Badge>
          </div>
          <div className="stat-value">{upcoming.length}</div>
          <div className="stat-label">Upcoming Visits</div>
          <div className="stat-note">
            {upcoming.length > 0 ? `Next: ${upcoming[0].appointmentDate}` : "No pending visits"}
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CheckCircle2 />
            </span>
            <Badge variant="green">Completed</Badge>
          </div>
          <div className="stat-value">{past.filter((a) => a.status === "COMPLETED").length}</div>
          <div className="stat-label">Past Consultations</div>
          <div className="stat-note">Medical history recorded</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-blue-600 bg-blue-50">
              <User />
            </span>
            <Badge variant="sky">Verified</Badge>
          </div>
          <div className="stat-value text-lg mt-3 truncate">{patient?.firstName} {patient?.lastName}</div>
          <div className="stat-label">Patient Record</div>
          <div className="stat-note">Phone: {patient?.phone}</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-amber-600 bg-amber-50">
              <Clock3 />
            </span>
            <Badge variant="amber">Pune</Badge>
          </div>
          <div className="stat-value text-lg mt-3">Ruby Hall</div>
          <div className="stat-label">Assigned Facility</div>
          <div className="stat-note">Pune, Maharashtra</div>
        </Card>
      </div>

      {/* Upcoming Appointments Card */}
      <Card className="space-y-4">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token #</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Consulting Specialist</TableHead>
                  <TableHead>Specialty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {upcoming.map((apt) => {
                    const pmt = paymentByApptId.get(apt.id);
                    return (
                      <TableRow key={apt.id}>
                        <TableCell>
                          <span className="token w-8 h-8 text-xs font-black bg-blue-100 text-blue-800 rounded-lg flex items-center justify-center">
                            #{apt.tokenNumber}
                          </span>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          <b>Dr. {apt.doctor.firstName} {apt.doctor.lastName}</b>
                          <small>Ruby Hall, Pune</small>
                        </TableCell>
                        <TableCell>
                          <Badge variant="blue">{apt.doctor.specialization}</Badge>
                        </TableCell>
                        <TableCell>{apt.reason}</TableCell>
                        <TableCell>
                          <div className="font-bold text-slate-900">₹{apt.doctor.consultationFee}</div>
                          {pmt ? (
                            <Link
                              href={`/patient/payments/${pmt.id}/receipt`}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5 font-mono"
                            >
                              <FileText size={10} />
                              <span>Receipt</span>
                            </Link>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono block">Complimentary</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="green">Confirmed</Badge>
                            {pmt && pmt.status === "PAID" && (
                              <Badge variant="sky" className="text-[10px] py-0 px-1.5">
                                Paid (rzp_test)
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <PatientAppointmentActions
                            appointmentId={apt.id}
                            doctorId={apt.doctorId}
                            doctorName={`${apt.doctor.firstName} ${apt.doctor.lastName}`}
                            appointmentDate={apt.appointmentDate}
                            startTime={apt.startTime}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Past Appointments Card */}
      {past.length > 0 && (
        <Card className="space-y-4">
          <div className="card-head">
            <div>
              <h2>Past Consultation History</h2>
              <p>{past.length} previous visit records</p>
            </div>
          </div>

          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Specialist</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {past.map((apt) => (
                  <TableRow key={apt.id}>
                    <TableCell>
                      <b>{formatDate(apt.appointmentDate)}</b>
                      <small>{apt.startTime}</small>
                    </TableCell>
                    <TableCell>Dr. {apt.doctor.firstName} {apt.doctor.lastName} ({apt.doctor.specialization})</TableCell>
                    <TableCell>{apt.reason}</TableCell>
                    <TableCell>
                      <span className={`badge ${apt.status === "COMPLETED" ? "blue" : "red"}`}>
                        {apt.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
