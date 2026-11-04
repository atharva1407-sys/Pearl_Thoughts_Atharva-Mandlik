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

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <Users />
            </span>
            <Badge variant="amber">Queue</Badge>
          </div>
          <div className="stat-value">{activeBookings.length}</div>
          <div className="stat-label">Active Bookings</div>
          <div className="stat-note">Waiting for consultation</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CheckCircle2 />
            </span>
            <Badge variant="green">Done</Badge>
          </div>
          <div className="stat-value">{completedBookings.length}</div>
          <div className="stat-label">Completed Consults</div>
          <div className="stat-note">Clinical notes filed</div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-blue-600 bg-blue-50">
              <CalendarClock />
            </span>
            <Badge variant="blue">Shifts</Badge>
          </div>
          <div className="stat-value">{activeShifts.length} Days</div>
          <div className="stat-label">Weekly Schedule</div>
          <div className="stat-note truncate">
            {activeShifts.map((s) => s.dayOfWeek).join(", ")}
          </div>
        </Card>

        <Card className="stat-card">
          <div className="stat-top">
            <span className="stat-icon text-purple-600 bg-purple-50">
              <Clock3 />
            </span>
            <Badge variant="green">On Track</Badge>
          </div>
          <div className="stat-value">30m</div>
          <div className="stat-label">Slot Duration</div>
          <div className="stat-note">OPD consultation window</div>
        </Card>
      </div>

      {/* Active Consultations Table Card */}
      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2>Consultation Queue for Review</h2>
            <p>{activeBookings.length} patient appointments booked</p>
          </div>
          <Badge variant="blue">Live Clinic Session</Badge>
        </div>

        {activeBookings.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50">
            No patient consultations are currently pending in your queue.
          </div>
        ) : (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token #</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Chief Complaint</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBookings.map((apt, index) => (
                  <TableRow key={apt.id}>
                    <TableCell>
                      <div className="flex flex-col items-center">
                        <span className="token w-8 h-8 text-xs font-black bg-blue-100 text-blue-800 rounded-lg flex items-center justify-center">
                          #{apt.tokenNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                          ~{(apt.tokenNumber - 1) * 20}m wait
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <b className="text-slate-900">{formatDate(apt.appointmentDate)}</b>
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
                      <b>{apt.patient.firstName} {apt.patient.lastName}</b>
                      <small>Patient ID: {apt.patientId.slice(0, 8)}</small>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{apt.patient.phone}</TableCell>
                    <TableCell>
                      <span className="text-slate-700 font-medium">{apt.reason}</span>
                    </TableCell>
                    <TableCell>
                      <DoctorAppointmentActions
                        appointmentId={apt.id}
                        patientName={`${apt.patient.firstName} ${apt.patient.lastName}`}
                        doctorId={user.profileId}
                        doctorName={`${doctor?.firstName} ${doctor?.lastName}`}
                        appointmentDate={apt.appointmentDate}
                        startTime={apt.startTime}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Completed Consultations Card */}
      {completedBookings.length > 0 && (
        <Card className="space-y-4">
          <div className="card-head">
            <div>
              <h2>Completed Consultations History</h2>
              <p>{completedBookings.length} consultations finished</p>
            </div>
          </div>

          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Time Slot</TableHead>
                  <TableHead>Chief Complaint</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedBookings.map((apt) => (
                  <TableRow key={apt.id}>
                    <TableCell><b>{formatDate(apt.appointmentDate)}</b></TableCell>
                    <TableCell>{apt.patient.firstName} {apt.patient.lastName}</TableCell>
                    <TableCell className="font-mono">{apt.startTime} – {apt.endTime}</TableCell>
                    <TableCell>{apt.reason}</TableCell>
                    <TableCell>
                      <Badge variant="green">Completed</Badge>
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
