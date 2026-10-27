"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDoctorSlotsAction } from "@/actions/availability";
import { bookAppointmentAction } from "@/actions/appointments";

interface SlotPickerProps {
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  isLoggedInPatient: boolean;
}

interface Slot {
  startTime: string;
  endTime: string;
  isBooked: boolean;
}

export function SlotPicker({
  doctorId,
  doctorName,
  consultationFee,
  isLoggedInPatient,
}: SlotPickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Generate next 7 dates starting from today
  const [availableDates] = useState(() => {
    const list: { dateString: string; dayName: string; dayNum: string; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dateString = d.toISOString().split("T")[0];
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

  const [selectedDate, setSelectedDate] = useState(availableDates[0]?.dateString || "");
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
    if (!isLoggedInPatient) {
      router.push(`/login?message=Please sign in as a patient to complete your booking.`);
      return;
    }

    if (!selectedSlot) {
      setError("Please select an available time slot.");
      return;
    }

    if (!reason.trim()) {
      setError("Please specify the reason for your consultation.");
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
        setSuccess("Appointment booked successfully! Redirecting to your dashboard...");
        setTimeout(() => {
          router.push("/patient/dashboard");
        }, 1200);
      } else {
        setError(res.error || "Failed to book appointment.");
      }
    });
  };

  const morningSlots = slots.filter((s) => {
    const hour = parseInt(s.startTime.split(":")[0], 10);
    return hour < 12;
  });

  const afternoonSlots = slots.filter((s) => {
    const hour = parseInt(s.startTime.split(":")[0], 10);
    return hour >= 12;
  });

  return (
    <div className="p-6 sm:p-8 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Select Appointment Date & Time</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Slots computed dynamically with instant conflict prevention
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-800/60 bg-rose-950/40 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl border border-emerald-800/60 bg-emerald-950/40 text-emerald-300 text-xs">
          {success}
        </div>
      )}

      <form onSubmit={handleBooking} className="space-y-6">
        {/* 1. Date Selector Strip */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            1. Select Date
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {availableDates.map((item) => {
              const isSelected = selectedDate === item.dateString;
              return (
                <button
                  type="button"
                  key={item.dateString}
                  onClick={() => setSelectedDate(item.dateString)}
                  className={`p-2.5 rounded-xl text-center transition-all ${
                    isSelected
                      ? "bg-white text-zinc-950 shadow-md font-bold"
                      : "border border-zinc-800 hover:border-zinc-600 bg-zinc-900/60 text-zinc-300"
                  }`}
                >
                  <div className={`text-[10px] uppercase font-bold tracking-wider ${isSelected ? "text-zinc-500" : "text-zinc-500"}`}>
                    {item.isToday ? "TODAY" : item.dayName}
                  </div>
                  <div className="text-lg font-black leading-tight mt-0.5">{item.dayNum}</div>
                  <div className={`text-[11px] ${isSelected ? "text-zinc-700 font-semibold" : "text-zinc-400"}`}>
                    {item.dayName}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Time Slot Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              2. Available Time Slots
            </label>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-white"></span> Selected</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-zinc-700 bg-zinc-900"></span> Available</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-zinc-800"></span> Booked</span>
            </div>
          </div>

          {isLoadingSlots ? (
            <div className="py-8 text-center text-xs text-zinc-500 animate-pulse">
              Computing doctor schedule & active bookings...
            </div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              Dr. {doctorName} is not holding consultations on this day. Please pick another date.
            </div>
          ) : (
            <div className="space-y-4">
              {morningSlots.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-2">Morning Shift</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {morningSlots.map((slot) => {
                      const isSelected = selectedSlot?.startTime === slot.startTime;
                      if (slot.isBooked) {
                        return (
                          <div
                            key={slot.startTime}
                            className="py-2.5 px-3 rounded-lg border border-zinc-900 bg-zinc-950/80 text-zinc-600 text-xs font-medium line-through text-center cursor-not-allowed select-none"
                            title="Already booked"
                          >
                            {slot.startTime} - {slot.endTime}
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          key={slot.startTime}
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-2.5 px-3 rounded-lg text-xs font-medium transition-all ${
                            isSelected
                              ? "bg-white text-zinc-950 font-bold shadow-md"
                              : "border border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-200"
                          }`}
                        >
                          {slot.startTime} - {slot.endTime} {isSelected && "✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {afternoonSlots.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wide mb-2">Afternoon Shift</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {afternoonSlots.map((slot) => {
                      const isSelected = selectedSlot?.startTime === slot.startTime;
                      if (slot.isBooked) {
                        return (
                          <div
                            key={slot.startTime}
                            className="py-2.5 px-3 rounded-lg border border-zinc-900 bg-zinc-950/80 text-zinc-600 text-xs font-medium line-through text-center cursor-not-allowed select-none"
                            title="Already booked"
                          >
                            {slot.startTime} - {slot.endTime}
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          key={slot.startTime}
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-2.5 px-3 rounded-lg text-xs font-medium transition-all ${
                            isSelected
                              ? "bg-white text-zinc-950 font-bold shadow-md"
                              : "border border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-200"
                          }`}
                        >
                          {slot.startTime} - {slot.endTime} {isSelected && "✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Reason for Visit */}
        <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            3. Reason for Consultation
          </label>
          <input
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Regular blood pressure checkup, joint pain consultation"
            className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        {/* 4. Confirmation CTA Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
          <div>
            <div className="text-xs text-zinc-500">Selected Appointment:</div>
            <div className="font-bold text-white text-sm">
              {selectedDate} • {selectedSlot ? `${selectedSlot.startTime} - ${selectedSlot.endTime}` : "No slot selected"}{" "}
              <span className="text-indigo-400">(${consultationFee})</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !selectedSlot}
            className="px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? "Confirming Booking..." : "Confirm & Book Appointment →"}
          </button>
        </div>
      </form>
    </div>
  );
}
