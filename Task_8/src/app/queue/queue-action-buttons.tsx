"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, UserCheck, Stethoscope } from "lucide-react";
import {
  checkInAppointmentAction,
  startConsultationAction,
  completeAppointmentAction,
} from "@/actions/appointments";
import { Button } from "@/components/ui/button";

export function CheckInButton({
  appointmentId,
  patientName,
}: {
  appointmentId: string;
  patientName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCheckIn = () => {
    setError(null);
    startTransition(async () => {
      const res = await checkInAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error || "Failed to check in patient.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCheckIn}
        disabled={isPending}
        className="text-xs py-1 px-2.5 text-emerald-700 hover:bg-emerald-50 border-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
        title={patientName ? `Check in ${patientName}` : "Check In Patient"}
      >
        {isPending ? <Loader2 size={13} className="animate-spin text-emerald-600" /> : <UserCheck size={13} />}
        <span>{isPending ? "Checking in..." : "Check In"}</span>
      </Button>
      {error && <span className="text-[10px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}

export function StartConsultationButton({
  appointmentId,
  isNext,
}: {
  appointmentId: string;
  isNext?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setError(null);
    startTransition(async () => {
      const res = await startConsultationAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error || "Failed to start consultation.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={isNext ? "default" : "outline"}
        size="sm"
        onClick={handleStart}
        disabled={isPending}
        className={`text-xs py-1 px-3 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${
          isNext ? "bg-blue-600 hover:bg-blue-700 text-white font-bold" : "text-blue-600 border-blue-300 hover:bg-blue-50"
        }`}
        title="Call patient into consultation"
      >
        {isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Stethoscope size={13} />
        )}
        <span>{isPending ? "Calling..." : isNext ? "Call Patient Now" : "Call"}</span>
      </Button>
      {error && <span className="text-[10px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}

export function CompleteConsultationButton({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleComplete = () => {
    setError(null);
    startTransition(async () => {
      const res = await completeAppointmentAction(appointmentId);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error || "Failed to complete consultation.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="default"
        size="sm"
        onClick={handleComplete}
        disabled={isPending}
        className="text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        title="Complete consultation and mark finished"
      >
        {isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <CheckCircle2 size={13} />
        )}
        <span>{isPending ? "Completing..." : "Complete Consultation"}</span>
      </Button>
      {error && <span className="text-[10px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}
