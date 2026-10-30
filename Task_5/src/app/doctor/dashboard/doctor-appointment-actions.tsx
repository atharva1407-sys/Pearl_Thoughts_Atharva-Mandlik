"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, CalendarClock, UserX } from "lucide-react";
import {
  completeAppointmentAction,
  cancelAppointmentAction,
  markNoShowAction
} from "@/actions/appointments";
import { RescheduleModal } from "@/components/reschedule-modal";

import { Button } from "@/components/ui/button";
interface DoctorAppointmentActionsProps {
  appointmentId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
}

export function DoctorAppointmentActions({
  appointmentId,
  patientName,
  doctorId,
  doctorName,
  appointmentDate,
  startTime,
}: DoctorAppointmentActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<"complete" | "cancel" | "noshow" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);

  const handleComplete = () => {
    setErrorMessage(null);
    setActionType("complete");

    startTransition(async () => {
      const res = await completeAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to mark appointment as done.");
      }
      setActionType(null);
    });
  };

  const handleCancel = () => {
    if (!window.confirm(`Are you sure you want to cancel the appointment for ${patientName}?`)) {
      return;
    }

    setErrorMessage(null);
    setActionType("cancel");

    startTransition(async () => {
      const res = await cancelAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to cancel appointment.");
      }
      setActionType(null);
    });
  };

  const handleNoShow = () => {
    if (!window.confirm(`Mark patient ${patientName} as No-Show for this consultation?`)) {
      return;
    }

    setErrorMessage(null);
    setActionType("noshow");

    startTransition(async () => {
      const res = await markNoShowAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to mark as No-Show.");
      }
      setActionType(null);
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button variant="default"
            type="button"
            onClick={handleComplete}
            disabled={isPending}
            className="text-xs py-1 px-2.5 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
            title="Mark Consultation Complete"
          >
            {isPending && actionType === "complete" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            <span>{isPending && actionType === "complete" ? "Completing..." : "Done"}</span>
          </Button>

          <Button variant="outline"
            type="button"
            onClick={() => setIsRescheduleOpen(true)}
            disabled={isPending}
            className="text-xs py-1 px-2 text-[#0875df] hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60 border border-blue-200"
            title="Reschedule to New Time Slot"
          >
            <CalendarClock size={13} />
            <span>Reschedule</span>
          </Button>

          <Button variant="outline"
            type="button"
            onClick={handleNoShow}
            disabled={isPending}
            className="text-xs py-1 px-2 text-amber-700 hover:bg-amber-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60 border border-amber-200"
            title="Mark Patient as No-Show"
          >
            {isPending && actionType === "noshow" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <UserX size={13} />
            )}
            <span>No-Show</span>
          </Button>

          <Button variant="outline"
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            className="text-xs py-1 px-2 text-red-600 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
            title="Cancel Appointment"
          >
            {isPending && actionType === "cancel" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <X size={13} />
            )}
            <span>Cancel</span>
          </Button>
        </div>

        {errorMessage && (
          <span className="text-[11px] text-red-600 font-semibold">{errorMessage}</span>
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
