"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X, Loader2 } from "lucide-react";
import { cancelAppointmentAction } from "@/actions/appointments";
import { RescheduleModal } from "@/components/reschedule-modal";

interface PatientAppointmentActionsProps {
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
}

export function PatientAppointmentActions({
  appointmentId,
  doctorId,
  doctorName,
  appointmentDate,
  startTime,
}: PatientAppointmentActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCancel = () => {
    if (!window.confirm(`Are you sure you want to cancel your consultation with Dr. ${doctorName}?`)) {
      return;
    }
    setErrorMessage(null);

    startTransition(async () => {
      const res = await cancelAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to cancel appointment.");
      }
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsRescheduleOpen(true)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs text-[#0875df] border border-blue-200 hover:bg-blue-50 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="Reschedule Appointment"
          >
            <CalendarClock size={12} />
            <span>Reschedule</span>
          </button>

          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="px-2.5 py-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="Cancel Appointment"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            <span>Cancel</span>
          </button>
        </div>

        {errorMessage && (
          <span className="text-[11px] text-red-600 font-semibold max-w-[200px] text-right">
            {errorMessage}
          </span>
        )}
      </div>

      <RescheduleModal
        appointmentId={appointmentId}
        doctorId={doctorId}
        doctorName={doctorName}
        currentDate={appointmentDate}
        currentTime={startTime}
        isOpen={isRescheduleOpen}
        onClose={() => setIsRescheduleOpen(false)}
      />
    </>
  );
}
