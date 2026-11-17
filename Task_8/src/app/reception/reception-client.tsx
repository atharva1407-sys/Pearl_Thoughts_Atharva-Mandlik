"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Search,
  Calendar,
  Clock,
  UserCheck,
  UserMinus,
  CalendarClock,
  XCircle,
  UserX,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { formatKolkataTimeShort, formatKolkataDate, formatKolkataHHMM } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RescheduleModal } from "@/components/reschedule-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkInAppointmentAction,
  markPatientUnavailableAction,
  cancelAppointmentAction,
  markNoShowAction,
  getRefundPreviewAction,
} from "@/actions/appointments";
import { AutoRefresh } from "@/app/queue/auto-refresh";
import type { AppointmentEntity } from "@/db/repo";
import type { DoctorQueueSummary } from "@/lib/queue";

export interface ReceptionAppointment extends AppointmentEntity {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  };
  doctor: {
    id: string;
    firstName: string;
    lastName: string;
    specialization: string;
    consultationFee: number;
  };
}

export interface ReceptionDoctorSummary {
  id: string;
  firstName: string;
  lastName: string;
  specialization: string;
  consultationFee: number;
}

interface ReceptionClientProps {
  initialDate: string;
  today: string;
  doctors: ReceptionDoctorSummary[];
  appointments: ReceptionAppointment[];
  doctorQueues: Record<string, DoctorQueueSummary<any>>;
  userRole: "RECEPTIONIST" | "DOCTOR";
  userName: string;
}

export function ReceptionClient({
  initialDate,
  today,
  doctors,
  appointments,
  doctorQueues,
  userRole,
  userName,
}: ReceptionClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [actionError, setActionError] = useState<string | null>(null);

  // Dialog states
  const [rescheduleTarget, setRescheduleTarget] = useState<{
    appointmentId: string;
    doctorId: string;
    doctorName: string;
    currentDate: string;
    currentTime: string;
  } | null>(null);

  const [unavailableTarget, setUnavailableTarget] = useState<{
    appointmentId: string;
    patientName: string;
    doctorId: string;
    doctorName: string;
    currentDate: string;
    currentTime: string;
  } | null>(null);

  const [cancelTarget, setCancelTarget] = useState<{
    appointmentId: string;
    patientName: string;
    time: string;
    doctorName: string;
    refundPreview?: any;
  } | null>(null);

  const [noShowTarget, setNoShowTarget] = useState<{
    appointmentId: string;
    patientName: string;
  } | null>(null);

  const isToday = initialDate === today;

  // Filtered appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      // Doctor filter
      if (selectedDoctorId !== "ALL" && apt.doctorId !== selectedDoctorId) {
        return false;
      }

      // Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "WAITING" && apt.status !== "CHECKED_IN") return false;
        if (statusFilter === "NOT_ARRIVED" && (apt.status !== "BOOKED" || !!apt.checkedInAt)) return false;
        if (statusFilter === "IN_CONSULTATION" && apt.status !== "IN_CONSULTATION") return false;
        if (statusFilter === "COMPLETED" && apt.status !== "COMPLETED") return false;
        if (statusFilter === "MISSED" && !["CANCELLED", "NO_SHOW", "EXPIRED"].includes(apt.status)) return false;
      }

      // Search query (name, phone, token)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const pName = `${apt.patient.firstName} ${apt.patient.lastName}`.toLowerCase();
        const phone = (apt.patient.phone || "").toLowerCase();
        const token = apt.tokenNumber ? `#${apt.tokenNumber}` : "";
        const tokenNum = apt.tokenNumber ? apt.tokenNumber.toString() : "";
        const docName = `dr. ${apt.doctor.firstName} ${apt.doctor.lastName}`.toLowerCase();

        const matches =
          pName.includes(q) ||
          phone.includes(q) ||
          token.includes(q) ||
          tokenNum === q ||
          docName.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [appointments, selectedDoctorId, statusFilter, searchQuery]);

  // Overall metrics
  const metrics = useMemo(() => {
    let waiting = 0;
    let notArrived = 0;
    let inConsultation = 0;
    let completed = 0;
    let missed = 0;

    for (const apt of appointments) {
      if (apt.status === "CHECKED_IN") waiting++;
      else if (apt.status === "BOOKED" && !apt.checkedInAt) notArrived++;
      else if (apt.status === "IN_CONSULTATION") inConsultation++;
      else if (apt.status === "COMPLETED") completed++;
      else if (["CANCELLED", "NO_SHOW", "EXPIRED"].includes(apt.status)) missed++;
    }

    return {
      total: appointments.length,
      waiting,
      notArrived,
      inConsultation,
      completed,
      missed,
    };
  }, [appointments]);

  // Check if slot start has passed
  const hasSlotStarted = (apt: ReceptionAppointment) => {
    try {
      const now = new Date();
      const [year, month, day] = apt.appointmentDate.split("-").map(Number);
      const [hours, minutes] = apt.startTime.split(":").map(Number);
      const slotTime = new Date(year, month - 1, day, hours, minutes);
      return now.getTime() >= slotTime.getTime();
    } catch {
      return false;
    }
  };

  // Handlers
  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    router.push(`/reception?date=${newDate}`);
  };

  const handleCheckIn = (appointmentId: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await checkInAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setActionError(res.error || "Failed to check in patient.");
      }
    });
  };

  const handleConfirmUnavailable = () => {
    if (!unavailableTarget) return;
    setActionError(null);

    startTransition(async () => {
      const res = await markPatientUnavailableAction(unavailableTarget.appointmentId);
      if (res.success) {
        const target = { ...unavailableTarget };
        setUnavailableTarget(null);
        // Automatically open the reschedule modal
        setRescheduleTarget(target);
      } else {
        setActionError(res.error || "Failed to mark patient unavailable.");
      }
    });
  };

  const handleStartCancel = async (apt: ReceptionAppointment) => {
    setActionError(null);
    setCancelTarget({
      appointmentId: apt.id,
      patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
      time: `${apt.appointmentDate} at ${apt.startTime}`,
      doctorName: `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}`,
    });

    try {
      const preview = await getRefundPreviewAction(apt.id);
      if (preview.success) {
        setCancelTarget((prev) => (prev ? { ...prev, refundPreview: preview } : null));
      }
    } catch {
      // preview error non-blocking
    }
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    setActionError(null);

    startTransition(async () => {
      const res = await cancelAppointmentAction(cancelTarget.appointmentId);
      if (res.success) {
        setCancelTarget(null);
        router.refresh();
      } else {
        setActionError(res.error || "Failed to cancel appointment.");
      }
    });
  };

  const handleConfirmNoShow = () => {
    if (!noShowTarget) return;
    setActionError(null);

    startTransition(async () => {
      const res = await markNoShowAction(noShowTarget.appointmentId);
      if (res.success) {
        setNoShowTarget(null);
        router.refresh();
      } else {
        setActionError(res.error || "Failed to mark patient as No-Show.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {isToday && <AutoRefresh intervalSeconds={20} />}

      {/* Top Banner / Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-wider uppercase font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
              FRONT DESK OPD CONSOLE
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-700 font-semibold">{formatKolkataDate(initialDate)}</span>
            {!isToday && (
              <Badge variant="amber" className="text-[10px]">
                Viewing Alternate Date
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Front-Desk Patient Console</h1>
          <p className="text-xs text-slate-500">
            Ruby Hall Clinic, Pune · Comprehensive check-in, live OPD waiting queues, and triage rescheduling
          </p>
        </div>

        {/* Date Selector & Quick Links */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <Calendar size={14} className="text-slate-500 ml-1" />
            <input
              type="date"
              value={initialDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="text-xs bg-transparent border-none outline-none font-medium text-slate-800 cursor-pointer"
            />
          </div>

          {!isToday ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDateChange(today)}
              className="text-xs h-8 cursor-pointer"
            >
              Back to Today
            </Button>
          ) : (
            <Badge variant="green" className="text-xs py-1.5 px-3">
              <span className="live-dot" /> Live OPD View
            </Badge>
          )}

          <Link href="/queue" className="btn text-xs h-8 inline-flex items-center gap-1">
            <span>Doctor Queue</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActionError(null)}
            className="text-xs h-6 px-1.5 text-red-700 hover:bg-red-100"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Summary Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Users size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Bookings</div>
            <div className="text-base font-bold text-slate-900">{metrics.total}</div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3 border-amber-200 bg-amber-50/20">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-xs text-amber-900 font-medium">Waiting Outside</div>
            <div className="text-base font-bold text-amber-800 flex items-center gap-1.5">
              <span>{metrics.waiting}</span>
              {isToday && metrics.waiting > 0 && <span className="live-dot" />}
            </div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <UserCheck size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Not Yet Arrived</div>
            <div className="text-base font-bold text-slate-700">{metrics.notArrived}</div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <Stethoscope size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">In Consultation</div>
            <div className="text-base font-bold text-indigo-700">{metrics.inConsultation}</div>
          </div>
        </Card>

        <Card className="p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Completed Visits</div>
            <div className="text-base font-bold text-emerald-700">{metrics.completed}</div>
          </div>
        </Card>
      </div>

      {/* Doctor Filter Tabs Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Doctor OPD Schedules</span>
          <span className="text-xs text-slate-400 font-medium">
            {doctors.length} Active Specialists Today
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            variant={selectedDoctorId === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedDoctorId("ALL")}
            className="text-xs rounded-lg cursor-pointer shrink-0"
          >
            All Doctors ({appointments.length})
          </Button>

          {doctors.map((doc) => {
            const queueInfo = doctorQueues[doc.id];
            const waitingCount = queueInfo?.waiting.length ?? 0;
            const notArrivedCount = queueInfo?.notArrived.length ?? 0;
            const isSelected = selectedDoctorId === doc.id;

            return (
              <Button
                key={doc.id}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDoctorId(doc.id)}
                className={`text-xs rounded-lg cursor-pointer shrink-0 inline-flex items-center gap-2 ${
                  isSelected ? "bg-blue-600 hover:bg-blue-700 text-white font-bold" : ""
                }`}
              >
                <span>
                  Dr. {doc.firstName} {doc.lastName}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isSelected ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {waitingCount} wait / {notArrivedCount} unarr
                </span>
                {queueInfo?.nowServing && (
                  <span
                    className={`text-[9px] px-1 rounded font-bold uppercase ${
                      isSelected ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    Serving #{queueInfo.nowServing.tokenNumber}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Search and Status Pills Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient name, phone, or token number (#1)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-400 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {[
            { id: "ALL", label: "All" },
            { id: "WAITING", label: `Waiting (${metrics.waiting})` },
            { id: "NOT_ARRIVED", label: `Not Arrived (${metrics.notArrived})` },
            { id: "IN_CONSULTATION", label: `In Consultation (${metrics.inConsultation})` },
            { id: "COMPLETED", label: `Completed (${metrics.completed})` },
            { id: "MISSED", label: `Cancelled/No-Show (${metrics.missed})` },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
                statusFilter === item.id
                  ? "bg-slate-900 text-white font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Appointments List / Table */}
      <Card className="p-0 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Patients List ({filteredAppointments.length})
            </h2>
            <p className="text-xs text-slate-500">
              {selectedDoctorId === "ALL"
                ? "All OPD doctor agendas for the selected date"
                : `Filtered to ${doctors.find((d) => d.id === selectedDoctorId)?.firstName || "doctor"}`}
            </p>
          </div>
          <Badge variant="gray" className="text-xs">
            {filteredAppointments.length} matching
          </Badge>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-2">
            <Users size={32} className="mx-auto text-slate-300" />
            <div className="text-slate-600 font-semibold">No appointments found</div>
            <p className="text-slate-400 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "ALL" || selectedDoctorId !== "ALL"
                ? "No patients match your current filters. Try resetting the search or status filter."
                : "No patient appointments have been booked for this date."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Token & Pos</th>
                  <th className="py-3 px-4">Patient Information</th>
                  <th className="py-3 px-4">Doctor & Department</th>
                  <th className="py-3 px-4">Slot Time</th>
                  <th className="py-3 px-4">Status & Check-In</th>
                  <th className="py-3 px-4 text-right">Front-Desk Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAppointments.map((apt) => {
                  const queueSummary = doctorQueues[apt.doctorId];
                  const waitingItem = queueSummary?.waiting.find((w) => w.appointment.id === apt.id);
                  const isNowServing = queueSummary?.nowServing?.id === apt.id;
                  const slotPassed = hasSlotStarted(apt);

                  return (
                    <tr
                      key={apt.id}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isNowServing
                          ? "bg-blue-50/30"
                          : waitingItem?.queuePosition === 1
                          ? "bg-amber-50/25"
                          : ""
                      }`}
                    >
                      {/* Token & Queue Position */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                            Token #{apt.tokenNumber}
                          </span>
                          {waitingItem && (
                            <div className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                              <span>Queue #{waitingItem.queuePosition}</span>
                              <span className="text-slate-400">·</span>
                              <span>~{waitingItem.estimatedWaitMinutes}m wait</span>
                            </div>
                          )}
                          {isNowServing && (
                            <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1">
                              <span>Now In Room</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Patient Info */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 text-xs">
                            {apt.patient.firstName} {apt.patient.lastName}
                          </div>
                          <div className="text-slate-500 text-[11px] font-mono">
                            {apt.patient.phone || "No phone"}
                          </div>
                          {apt.reason && (
                            <div className="text-slate-500 text-[11px] truncate max-w-xs">
                              {apt.reason}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Doctor Info */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-900 text-xs">
                            Dr. {apt.doctor.firstName} {apt.doctor.lastName}
                          </div>
                          <div className="text-slate-500 text-[11px]">
                            {apt.doctor.specialization}
                          </div>
                        </div>
                      </td>

                      {/* Slot Time */}
                      <td className="py-3.5 px-4 align-top font-mono text-xs text-slate-700">
                        <div>
                          {apt.startTime} – {apt.endTime}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">{apt.appointmentDate}</div>
                      </td>

                      {/* Status & Check-In Attribution */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1">
                          {apt.status === "CHECKED_IN" ? (
                            <Badge variant="amber" className="text-[10px]">
                              Waiting Outside
                            </Badge>
                          ) : apt.status === "BOOKED" ? (
                            <Badge variant="gray" className="text-[10px]">
                              Not Yet Arrived
                            </Badge>
                          ) : apt.status === "IN_CONSULTATION" ? (
                            <Badge variant="blue" className="text-[10px]">
                              In Consultation
                            </Badge>
                          ) : apt.status === "COMPLETED" ? (
                            <Badge variant="green" className="text-[10px]">
                              Completed
                            </Badge>
                          ) : apt.status === "NO_SHOW" ? (
                            <Badge variant="gray" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                              No-Show
                            </Badge>
                          ) : (
                            <Badge variant="red" className="text-[10px]">
                              {apt.status}
                            </Badge>
                          )}

                          {apt.checkedInAt && (
                            <div className="text-[10px] text-slate-500">
                              Checked in: <span className="font-medium text-slate-700">{formatKolkataHHMM(apt.checkedInAt)}</span>
                              {apt.checkedInBy && (
                                <div className="text-slate-400 text-[9px] truncate max-w-[180px]">
                                  by {apt.checkedInBy}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Front-Desk Actions */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* Check In Action for BOOKED */}
                          {apt.status === "BOOKED" && isToday && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCheckIn(apt.id)}
                              disabled={isPending}
                              className="text-xs py-1 px-2.5 text-emerald-700 hover:bg-emerald-50 border-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Check in patient for OPD consultation"
                            >
                              <UserCheck size={12} />
                              <span>Check In</span>
                            </Button>
                          )}

                          {/* Unavailable Action for CHECKED_IN */}
                          {apt.status === "CHECKED_IN" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setUnavailableTarget({
                                  appointmentId: apt.id,
                                  patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
                                  doctorId: apt.doctorId,
                                  doctorName: `${apt.doctor.firstName} ${apt.doctor.lastName}`,
                                  currentDate: apt.appointmentDate,
                                  currentTime: apt.startTime,
                                })
                              }
                              disabled={isPending}
                              className="text-xs py-1 px-2.5 text-amber-700 hover:bg-amber-50 border-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              title="Mark patient unavailable & reschedule to new slot"
                            >
                              <UserMinus size={12} />
                              <span>Unavailable</span>
                            </Button>
                          )}

                          {/* Reschedule Button */}
                          {(apt.status === "BOOKED" || apt.status === "CHECKED_IN") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRescheduleTarget({
                                  appointmentId: apt.id,
                                  doctorId: apt.doctorId,
                                  doctorName: `${apt.doctor.firstName} ${apt.doctor.lastName}`,
                                  currentDate: apt.appointmentDate,
                                  currentTime: apt.startTime,
                                })
                              }
                              disabled={isPending}
                              className="text-xs py-1 px-2 text-[#0875df] hover:bg-blue-50 border-blue-200 inline-flex items-center gap-1 cursor-pointer"
                              title="Reschedule to another slot"
                            >
                              <CalendarClock size={12} />
                              <span>Reschedule</span>
                            </Button>
                          )}

                          {/* Cancel Button */}
                          {(apt.status === "BOOKED" || apt.status === "CHECKED_IN") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartCancel(apt)}
                              disabled={isPending}
                              className="text-xs py-1 px-2 text-red-600 hover:bg-red-50 border-red-200 inline-flex items-center gap-1 cursor-pointer"
                              title="Cancel appointment and issue refund if applicable"
                            >
                              <XCircle size={12} />
                              <span>Cancel</span>
                            </Button>
                          )}

                          {/* No-Show Button for BOOKED */}
                          {apt.status === "BOOKED" && isToday && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setNoShowTarget({
                                  appointmentId: apt.id,
                                  patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
                                })
                              }
                              disabled={isPending || !slotPassed}
                              className={`text-xs py-1 px-2 border inline-flex items-center gap-1 cursor-pointer ${
                                slotPassed
                                  ? "text-purple-700 hover:bg-purple-50 border-purple-200"
                                  : "text-slate-400 border-slate-200 opacity-60 cursor-not-allowed"
                              }`}
                              title={
                                slotPassed
                                  ? "Mark patient as No-Show"
                                  : "No-Show can only be marked after scheduled slot start time"
                              }
                            >
                              <UserX size={12} />
                              <span>No-Show</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Unavailable Confirmation Dialog */}
      <Dialog open={!!unavailableTarget} onOpenChange={(open) => { if (!open) setUnavailableTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="p-1 rounded bg-amber-100 text-amber-700">
                <AlertCircle size={18} />
              </span>
              Mark Patient as Unavailable?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Are you sure you want to mark <strong>{unavailableTarget?.patientName}</strong> as unavailable?
              They will be removed from the active waiting queue, and you will be immediately prompted to pick another slot with Dr. {unavailableTarget?.doctorName}.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setUnavailableTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={handleConfirmUnavailable}
              disabled={isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1.5"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              <span>{isPending ? "Updating..." : "Confirm & Reschedule"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="p-1 rounded bg-red-100 text-red-700">
                <XCircle size={18} />
              </span>
              Cancel Patient Appointment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Are you sure you want to cancel the booking for <strong>{cancelTarget?.patientName}</strong> with {cancelTarget?.doctorName} ({cancelTarget?.time})?
            </DialogDescription>
          </DialogHeader>

          {cancelTarget?.refundPreview && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-800">Ruby Hall Refund Assessment:</div>
              <div className="text-slate-600">
                {cancelTarget.refundPreview.hasPayment
                  ? `Eligible for ₹${cancelTarget.refundPreview.refundAmountRupees} (${cancelTarget.refundPreview.refundPercentage}% tier)`
                  : "No payment on file (free or unpaid)."}
              </div>
              <div className="text-[11px] text-slate-500 italic">
                {cancelTarget.refundPreview.reason}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={handleConfirmCancel}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              <span>{isPending ? "Cancelling..." : "Confirm Cancellation"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No-Show Confirmation Dialog */}
      <Dialog open={!!noShowTarget} onOpenChange={(open) => { if (!open) setNoShowTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="p-1 rounded bg-purple-100 text-purple-700">
                <UserX size={18} />
              </span>
              Mark as No-Show?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Confirm marking <strong>{noShowTarget?.patientName}</strong> as No-Show. This closes the booking slot and updates the clinic session audit.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setNoShowTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              type="button"
              onClick={handleConfirmNoShow}
              disabled={isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center gap-1.5"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              <span>{isPending ? "Marking..." : "Confirm No-Show"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <RescheduleModal
          appointmentId={rescheduleTarget.appointmentId}
          doctorId={rescheduleTarget.doctorId}
          doctorName={rescheduleTarget.doctorName}
          currentDate={rescheduleTarget.currentDate}
          currentTime={rescheduleTarget.currentTime}
          isOpen={true}
          onClose={() => {
            setRescheduleTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
