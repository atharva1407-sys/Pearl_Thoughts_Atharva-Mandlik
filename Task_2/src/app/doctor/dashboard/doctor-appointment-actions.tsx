"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { completeAppointmentAction, cancelAppointmentAction } from "@/actions/appointments";

interface DoctorAppointmentActionsProps {
  appointmentId: string;
  patientName: string;
}

export function DoctorAppointmentActions({
  appointmentId,
  patientName,
}: DoctorAppointmentActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<"complete" | "cancel" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleComplete}
          disabled={isPending}
          className="btn primary text-xs py-1 px-2.5 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          title="Mark Consultation Complete"
        >
          {isPending && actionType === "complete" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          <span>{isPending && actionType === "complete" ? "Completing..." : "Done"}</span>
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="btn text-xs py-1 px-2 text-red-600 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          title="Cancel Appointment"
        >
          {isPending && actionType === "cancel" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} />
          )}
          <span>Cancel</span>
        </button>
      </div>

      {errorMessage && (
        <span className="text-[11px] text-red-600 font-semibold">{errorMessage}</span>
      )}
    </div>
  );
}
