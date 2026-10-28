"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { getDoctorSessionsAction } from "@/actions/availability";
import { bookAppointmentAction } from "@/actions/appointments";
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Ticket
} from "lucide-react";

interface SlotPickerProps {
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  isLoggedIn: boolean;
}

interface Slot {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  seatsLeft: number;
  isBooked: boolean;
}

interface SessionGroup {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
  timeRange: string;
  slots: Slot[];
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SlotPicker({
  doctorId,
  doctorName,
  consultationFee,
  isLoggedIn,
}: SlotPickerProps) {
  const [isPending, startTransition] = useTransition();

  // Generate next 14 dates starting from today in local time
  const [availableDates] = useState(() => {
    const list: {
      dateString: string;
      dayName: string;
      dayNum: string;
      isToday: boolean;
    }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dateString = formatLocalDate(d);
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNum = d.getDate().toString();
      list.push({
        dateString,
        dayName,
        dayNum,
        isToday: i === 0,
      });
    }
    return list;
  });

  const [selectedDate, setSelectedDate] = useState(
    availableDates[0]?.dateString || ""
  );
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isLeave, setIsLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignedToken, setAssignedToken] = useState<number | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  // Load session groups whenever selected date changes
  useEffect(() => {
    if (!selectedDate) return;
    setIsLoadingSlots(true);
    setError(null);
    setSelectedSlot(null);

    getDoctorSessionsAction(doctorId, selectedDate).then((res) => {
      setIsLoadingSlots(false);
      if (res.success) {
        setIsLeave(Boolean(res.isLeave));
        setLeaveReason(res.leaveReason || null);
        setGroups((res.groups as SessionGroup[]) || []);
      } else {
        setGroups([]);
        if (res.error) setError(res.error);
      }
    });
  }, [doctorId, selectedDate]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : `/doctors/${doctorId}`;
      window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}&message=Please sign in to complete your booking.`;
      return;
    }

    if (!selectedSlot) {
      setError("Please select an available consultation slot or wave.");
      return;
    }

    if (!reason.trim()) {
      setError("Please describe the reason for your consultation.");
      return;
    }

    setError(null);
    setSuccess(null);
    setAssignedToken(null);

    const formData = new FormData();
    formData.append("doctorId", doctorId);
    formData.append("appointmentDate", selectedDate);
    formData.append("startTime", selectedSlot.startTime);
    formData.append("endTime", selectedSlot.endTime);
    formData.append("reason", reason);

    startTransition(async () => {
      const res = await bookAppointmentAction(formData);
      if (res.success) {
        setSuccess(
          `Consultation confirmed with Dr. ${doctorName} for ${selectedDate} at ${selectedSlot.startTime}!`
        );
        if (res.tokenNumber) {
          setAssignedToken(res.tokenNumber);
        }
        setSelectedSlot(null);
        setReason("");
        // Reload sessions to refresh capacity numbers
        getDoctorSessionsAction(doctorId, selectedDate).then((update) => {
          if (update.success) {
            setGroups((update.groups as SessionGroup[]) || []);
          }
        });
      } else {
        setError(res.error || "Booking failed. Please select another slot.");
      }
    });
  };

  const totalOpenSlots = groups.reduce(
    (acc, g) => acc + g.slots.filter((s) => !s.isBooked).length,
    0
  );

  return (
    <div className="card space-y-6">
      <div className="card-head">
        <div>
          <h2>Select Consultation Date & Time</h2>
          <p>Real-time slot availability for Ruby Hall OPD · Stream & Wave Sessions</p>
        </div>
        <span className="badge sky">Capacity Managed</span>
      </div>

      {/* Date Selection Ribbon */}
      <div>
        <label className="text-xs font-bold text-slate-700 block mb-2">
          Step 1: Choose Appointment Date
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {availableDates.map((item) => {
            const isSelected = selectedDate === item.dateString;
            return (
              <button
                key={item.dateString}
                type="button"
                onClick={() => setSelectedDate(item.dateString)}
                className={`shrink-0 p-2.5 w-16 rounded-xl text-center transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-[#0875df] text-white border-[#0875df] shadow-xs"
                    : "bg-white border-slate-200 text-slate-700 hover:border-blue-300"
                }`}
              >
                <span className="block text-[10px] uppercase font-bold tracking-wider opacity-85">
                  {item.dayName}
                </span>
                <span className="block text-base font-extrabold my-0.5">
                  {item.dayNum}
                </span>
                <span className="block text-[10px] opacity-75">
                  {item.isToday ? "Today" : "Open"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Available Slots & Sessions Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-700">
            Step 2: Choose Available Session & Slot
          </label>
          <span className="text-xs text-slate-500">
            {isLoadingSlots
              ? "Checking doctor schedule..."
              : isLeave
              ? "Doctor on leave"
              : `${totalOpenSlots} slot${totalOpenSlots === 1 ? "" : "s"} open`}
          </span>
        </div>

        {isLoadingSlots ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            Loading clinic sessions calendar...
          </div>
        ) : isLeave ? (
          <div className="p-6 text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
            <AlertCircle size={22} className="mx-auto mb-1 text-amber-600" />
            <div className="font-bold text-sm">Dr. {doctorName} is on Leave on this Date</div>
            <div className="text-amber-700">{leaveReason || "Clinical absence or conference leave."}</div>
            <div className="text-slate-500 text-[11px] pt-1">Please select an alternative date above.</div>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
            Dr. {doctorName} has no active clinic sessions scheduled on this day. Please select another date.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.sessionId} className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-blue-100 text-blue-700">
                      <Layers size={14} />
                    </span>
                    <div>
                      <span className="font-bold text-sm text-slate-900">{group.sessionName}</span>
                      <span className="text-xs font-mono text-slate-500 ml-2">({group.timeRange})</span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                      group.schedulingType === "WAVE"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}
                  >
                    {group.schedulingType === "WAVE"
                      ? `Wave (${group.patientsPerWave} patients/wave)`
                      : "Stream (1:1)"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {group.slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.sessionId === slot.sessionId;
                    const isBooked = slot.isBooked;

                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        disabled={isBooked}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-2.5 rounded-xl text-center font-mono text-xs transition-all border ${
                          isBooked
                            ? "bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed"
                            : isSelected
                            ? "bg-[#0875df] text-white border-[#0875df] font-bold shadow-xs"
                            : "bg-white text-slate-800 border-slate-200 hover:border-blue-400 hover:text-blue-700 cursor-pointer"
                        }`}
                      >
                        <div className="text-xs font-bold">{slot.startTime}</div>
                        {group.schedulingType === "WAVE" ? (
                          <div
                            className={`text-[10px] font-sans mt-0.5 ${
                              isBooked
                                ? "text-slate-400"
                                : isSelected
                                ? "text-blue-100"
                                : "text-emerald-600 font-semibold"
                            }`}
                          >
                            {isBooked ? "Wave Full" : `${slot.seatsLeft} of ${slot.capacity} left`}
                          </div>
                        ) : (
                          <div className={`text-[10px] font-sans mt-0.5 ${isBooked ? "text-slate-400" : isSelected ? "text-blue-100" : "text-slate-500"}`}>
                            {isBooked ? "Booked" : "Available"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Banner with Token Number */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>

          {assignedToken && (
            <div className="p-3 rounded-lg bg-white border border-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="text-emerald-600" size={20} />
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Queue Token Assigned</div>
                  <div className="text-base font-black text-slate-900">Consultation Token #{assignedToken}</div>
                </div>
              </div>
              <span className="text-[11px] font-mono font-semibold px-2 py-1 bg-emerald-100 text-emerald-800 rounded">
                Confirmed
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link
              href="/patient/dashboard"
              className="btn primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
            >
              <span>View in My Appointments</span>
              <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setAssignedToken(null);
              }}
              className="btn text-xs py-1.5 px-3"
            >
              Book Another Slot
            </button>
          </div>
        </div>
      )}

      {/* Booking Form Details */}
      <form onSubmit={handleBooking} className="space-y-4 pt-3 border-t border-slate-100">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">
            Reason for Consultation / Chief Complaint *
          </label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Routine cardiology review, hypertension follow-up, chest pain check"
            className="w-full p-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Live Booking Summary Card */}
        <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 space-y-2 text-xs">
          <div className="font-bold text-blue-900 flex items-center gap-1.5">
            <CalendarDays size={15} className="text-blue-600" />
            <span>Consultation Summary</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 pt-1">
            <div>
              <span className="block text-slate-400 text-[11px]">Doctor</span>
              <b className="text-slate-800">Dr. {doctorName}</b>
            </div>
            <div>
              <span className="block text-slate-400 text-[11px]">Date</span>
              <b className="text-slate-800">{selectedDate || "Not selected"}</b>
            </div>
            <div>
              <span className="block text-slate-400 text-[11px]">Time Window</span>
              <b className="text-slate-800">
                {selectedSlot ? `${selectedSlot.startTime} – ${selectedSlot.endTime}` : "Not selected"}
              </b>
            </div>
            <div>
              <span className="block text-slate-400 text-[11px]">Session Type</span>
              <b className="text-slate-800">
                {selectedSlot ? selectedSlot.schedulingType : "Standard"}
              </b>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div>
          {isLoggedIn ? (
            <button
              type="submit"
              disabled={isPending || !selectedSlot}
              className={`btn primary w-full justify-center py-2.5 text-xs font-bold cursor-pointer ${
                isPending || !selectedSlot ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isPending ? "Confirming Booking..." : "Confirm & Book Consultation"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const currentPath = typeof window !== "undefined" ? window.location.pathname : `/doctors/${doctorId}`;
                window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}&message=Please sign in to complete your booking.`;
              }}
              className="btn primary w-full justify-center py-2.5 text-xs font-bold cursor-pointer"
            >
              Sign In to Reserve Slot
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
