"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDoctorSessionsAction } from "@/actions/availability";
import { rescheduleAppointmentAction } from "@/actions/appointments";
import {
  CalendarDays,
  Clock3,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  Layers
} from "lucide-react";
import { formatDate } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
interface RescheduleModalProps {
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  currentDate: string;
  currentTime: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SlotItem {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  startTime: string;
  endTime: string;
  capacity: number;
  seatsLeft: number;
  isBooked: boolean;
}

interface SessionGroup {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  timeRange: string;
  patientsPerWave: number;
  slots: SlotItem[];
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function RescheduleModal({
  appointmentId,
  doctorId,
  doctorName,
  currentDate,
  currentTime,
  isOpen,
  onClose,
}: RescheduleModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Next 14 available dates
  const [dates] = useState(() => {
    const list: { dateString: string; dayName: string; dayNum: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      list.push({
        dateString: formatLocalDate(d),
        dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: d.getDate().toString(),
      });
    }
    return list;
  });

  const [selectedDate, setSelectedDate] = useState(dates[0]?.dateString || "");
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [isLeave, setIsLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !selectedDate) return;
    setLoading(true);
    setErrorMessage(null);
    setSelectedSlot(null);

    getDoctorSessionsAction(doctorId, selectedDate).then((res) => {
      setLoading(false);
      if (res.success) {
        setIsLeave(Boolean(res.isLeave));
        setLeaveReason(res.leaveReason || null);
        setGroups((res.groups as SessionGroup[]) || []);
      } else {
        setGroups([]);
        setErrorMessage(res.error || "Failed to load slots");
      }
    });
  }, [isOpen, doctorId, selectedDate]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedSlot) return;
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("appointmentId", appointmentId);
    formData.append("newDate", selectedDate);
    formData.append("newStartTime", selectedSlot.startTime);
    formData.append("newEndTime", selectedSlot.endTime);
    if (selectedSlot.sessionId) {
      formData.append("newSessionId", selectedSlot.sessionId);
    }

    startTransition(async () => {
      const res = await rescheduleAppointmentAction(formData);
      if (res.success) {
        setSuccessMessage(`Rescheduled to ${selectedDate} at ${selectedSlot.startTime}!`);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1200);
      } else {
        setErrorMessage(res.error || "Failed to reschedule appointment.");
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
<DialogContent showCloseButton={false} className="max-w-lg gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
<DialogDescription className="sr-only">Choose a new date and time for your appointment.</DialogDescription>
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <CalendarClock size={18} />
            </span>
            <div>
              <DialogTitle className="font-bold text-slate-900 text-sm">Reschedule Consultation</DialogTitle>
              <p className="text-xs text-slate-500">Dr. {doctorName} · Ruby Hall Clinic</p>
            </div>
          </div>
          <Button variant="bare"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
          >
            <X size={18} />
          </Button>
        </div>

        {/* Current Time Notice */}
        <div className="px-6 py-2.5 bg-blue-50/70 border-b border-blue-100 text-xs text-blue-900 flex items-center justify-between">
          <span>Current Booking:</span>
          <b className="font-mono">{formatDate(currentDate)} at {currentTime}</b>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Date Picker Ribbon */}
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-2 block">
              1. Select New Consultation Date
            </Label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {dates.map((d) => {
                const isSelected = selectedDate === d.dateString;
                return (
                  <Button variant="bare"
                    key={d.dateString}
                    type="button"
                    onClick={() => setSelectedDate(d.dateString)}
                    className={`shrink-0 flex flex-col items-center justify-center w-14 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#0875df] text-white border-[#0875df] shadow-xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-[10px] uppercase opacity-80">{d.dayName}</span>
                    <span className="text-sm font-bold">{d.dayNum}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Slots / Sessions Section */}
          <div>
            <Label className="text-xs font-bold text-slate-700 mb-2 block">
              2. Select New Time Window / Wave
            </Label>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <Loader2 size={20} className="animate-spin mx-auto mb-2 text-blue-600" />
                Checking available physician sessions...
              </div>
            ) : isLeave ? (
              <div className="p-6 text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={20} className="mx-auto mb-2 text-amber-600" />
                <div className="font-bold">Doctor is on clinical leave on this date</div>
                <div className="text-[11px] text-amber-700 mt-1">{leaveReason}</div>
                <div className="text-[11px] text-slate-500 mt-2">Please pick another date above.</div>
              </div>
            ) : groups.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                No active consultation sessions scheduled on this day.
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.sessionId} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <Layers size={14} className="text-blue-600" />
                        <span className="font-bold text-xs text-slate-900">{group.sessionName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({group.timeRange})</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        group.schedulingType === "WAVE"
                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                      }`}>
                        {group.schedulingType === "WAVE" ? `Wave (${group.patientsPerWave}/slot)` : "Stream"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {group.slots.map((slot) => {
                        const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.sessionId === slot.sessionId;
                        return (
                          <Button variant="bare"
                            key={slot.startTime}
                            type="button"
                            disabled={slot.isBooked}
                            onClick={() => setSelectedSlot(slot)}
                            className={`p-2 rounded-lg text-xs font-mono font-medium border text-center transition-all cursor-pointer ${
                              slot.isBooked
                                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through"
                                : isSelected
                                ? "bg-[#0875df] text-white border-[#0875df] shadow-xs"
                                : "bg-white text-slate-800 border-slate-200 hover:border-blue-400"
                            }`}
                          >
                            <div>{slot.startTime}</div>
                            {group.schedulingType === "WAVE" && !slot.isBooked && (
                              <div className={`text-[9px] font-sans ${isSelected ? "text-blue-100" : "text-emerald-600 font-bold"}`}>
                                {slot.seatsLeft} of {slot.capacity} left
                              </div>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <Button variant="outline"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </Button>
          <Button variant="default"
            type="button"
            onClick={handleConfirm}
            disabled={!selectedSlot || isPending}
            className="px-5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            <span>{isPending ? "Confirming Move..." : "Confirm Reschedule"}</span>
          </Button>
        </div>
      </DialogContent>
</Dialog>
  );
}
