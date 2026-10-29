"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDoctorSlotsAction } from "@/actions/availability";
import { bookAppointmentAction } from "@/actions/appointments";
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Check
} from "lucide-react";

interface SlotPickerProps {
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  isLoggedIn: boolean;
}

interface Slot {
  startTime: string;
  endTime: string;
  isBooked: boolean;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Generate next 7 dates starting from today in local time
  const [availableDates] = useState(() => {
    const list: {
      dateString: string;
      dayName: string;
      dayNum: string;
      isToday: boolean;
    }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  // Load slots whenever selected date changes
  useEffect(() => {
    if (!selectedDate) return;
    setIsLoadingSlots(true);
    setError(null);
    setSelectedSlot(null);

    getDoctorSlotsAction(doctorId, selectedDate).then((res) => {
      setIsLoadingSlots(false);
      if (res.success && res.slots) {
        setSlots(res.slots);
      } else {
        setSlots([]);
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
      setError("Please select an available time slot.");
      return;
    }

    if (!reason.trim()) {
      setError("Please enter the reason for your appointment.");
      return;
    }

    setError(null);
    setSuccess(null);

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
          `Appointment confirmed with Dr. ${doctorName} for ${selectedDate} at ${selectedSlot.startTime}!`
        );
        setSelectedSlot(null);
        setReason("");
        // Reload slots to reflect newly booked time
        getDoctorSlotsAction(doctorId, selectedDate).then((update) => {
          if (update.success && update.slots) setSlots(update.slots);
        });
      } else {
        setError(res.error || "Booking failed. Please select another slot.");
      }
    });
  };

  const availableSlotsCount = slots.filter((s) => !s.isBooked).length;

  return (
    <div className="card space-y-6">
      <div className="card-head">
        <div>
          <h2>Select Consultation Date & Time</h2>
          <p>Real-time slot availability for Ruby Hall OPD</p>
        </div>
        <span className="badge sky">Conflict-Free</span>
      </div>

      {/* Date Selection Pills */}
      <div>
        <label className="text-xs font-bold text-slate-700 block mb-2">
          Step 1: Choose Appointment Date
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {availableDates.map((item) => {
            const isSelected = selectedDate === item.dateString;
            return (
              <button
                key={item.dateString}
                type="button"
                onClick={() => setSelectedDate(item.dateString)}
                className={`p-2.5 rounded-lg text-center transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                    : "bg-white border-slate-200 text-slate-700 hover:border-blue-300"
                }`}
              >
                <span className="block text-xs uppercase font-bold tracking-wider">
                  {item.dayName}
                </span>
                <span className="block text-base font-extrabold my-0.5">
                  {item.dayNum}
                </span>
                <span className="block text-[11px] opacity-80">
                  {item.isToday ? "Today" : "Open"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Available Slots Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-700">
            Step 2: Choose Available Slot
          </label>
          <span className="text-xs text-slate-500">
            {isLoadingSlots
              ? "Checking schedule..."
              : `${availableSlotsCount} slot${availableSlotsCount === 1 ? "" : "s"} open`}
          </span>
        </div>

        {isLoadingSlots ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
            Loading clinic shift calendar...
          </div>
        ) : slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
            Dr. {doctorName} has no scheduled clinic hours on this day. Please select another date.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {slots.map((slot) => {
              const isSelected = selectedSlot?.startTime === slot.startTime;
              const isBooked = slot.isBooked;

              return (
                <button
                  key={slot.startTime}
                  type="button"
                  disabled={isBooked}
                  onClick={() => setSelectedSlot(slot)}
                  className={`p-2 rounded-lg text-center font-mono text-xs transition-all border ${
                    isBooked
                      ? "bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed"
                      : isSelected
                      ? "bg-blue-600 text-white border-blue-600 font-bold shadow-xs"
                      : "bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700 cursor-pointer"
                  }`}
                >
                  {slot.startTime}
                  {isBooked ? " (Booked)" : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Success / Error Banners */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
            <span>{success}</span>
          </div>
          <p className="text-emerald-700 m-0">
            Your appointment has been registered in the hospital schedule.
          </p>
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
              onClick={() => setSuccess(null)}
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
            Reason for Visit / Symptoms *
          </label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Routine consultation, high blood pressure review, headache"
            className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
          />
        </div>

        {/* Live Booking Summary Card */}
        <div className="p-3.5 rounded-lg border border-blue-100 bg-blue-50/50 space-y-2 text-xs">
          <div className="font-bold text-blue-900 flex items-center gap-1.5">
            <CalendarDays size={15} className="text-blue-600" />
            <span>Booking Summary</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-600 pt-1">
            <div>
              <span className="block text-slate-400 text-xs">Doctor</span>
              <b className="text-slate-800">Dr. {doctorName}</b>
            </div>
            <div>
              <span className="block text-slate-400 text-xs">Date</span>
              <b className="text-slate-800">{selectedDate || "Not selected"}</b>
            </div>
            <div>
              <span className="block text-slate-400 text-xs">Time Slot</span>
              <b className="text-slate-800">
                {selectedSlot ? `${selectedSlot.startTime} – ${selectedSlot.endTime}` : "Not selected"}
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
              className={`btn primary w-full justify-center py-2.5 text-xs font-bold ${
                isPending || !selectedSlot ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isPending ? "Confirming Appointment..." : "Confirm & Book Appointment"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const currentPath = typeof window !== "undefined" ? window.location.pathname : `/doctors/${doctorId}`;
                window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}&message=Please sign in to complete your booking.`;
              }}
              className="btn primary w-full justify-center py-2.5 text-xs font-bold"
            >
              Sign In to Reserve Slot
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
