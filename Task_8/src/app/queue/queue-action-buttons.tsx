"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, UserCheck, Stethoscope, UserMinus, AlertCircle, CalendarClock, UserX, X } from "lucide-react";
import {
  checkInAppointmentAction,
  startConsultationAction,
  completeAppointmentAction,
  markPatientUnavailableAction,
  markNoShowAction,
  cancelAppointmentAction,
} from "@/actions/appointments";
import { Button } from "@/components/ui/button";
import { useOpenReschedule } from "@/components/unavailable-reschedule-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function UnavailableButton({
  appointmentId,
  patientName,
  doctorId,
  doctorName,
  appointmentDate,
  startTime,
}: {
  appointmentId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
}) {
  const openReschedule = useOpenReschedule();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmUnavailable = () => {
    setError(null);
    startTransition(async () => {
      const res = await markPatientUnavailableAction(appointmentId);
      if (res.success) {
        // Hand the reschedule dialog to the provider first: this row is about to leave the waiting list.
        openReschedule({
          appointmentId,
          doctorId,
          doctorName,
          currentDate: appointmentDate,
          currentTime: startTime,
        });
        setIsConfirmOpen(false);
      } else {
        setError(res.error || "Failed to mark patient unavailable.");
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setIsConfirmOpen(true);
        }}
        disabled={isPending}
        className="text-xs py-1 px-2.5 text-amber-700 hover:bg-amber-50 border-amber-300 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
        title={`Mark ${patientName} as unavailable in waiting queue`}
      >
        <UserMinus size={13} />
        <span>Unavailable</span>
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="p-1 rounded bg-amber-100 text-amber-700">
                <AlertCircle size={18} />
              </span>
              Mark Patient Unavailable?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1 leading-relaxed">
              Are you sure you want to mark <strong>{patientName}</strong> as unavailable?
              They will be removed from the active waiting queue, and you will be prompted to reschedule them to another available slot with Dr. {doctorName}.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsConfirmOpen(false)}
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
    </>
  );
}

/**
 * Front-desk row actions for a patient who has not arrived: Reschedule, No-Show and Cancel.
 * Only rendered for roles that hold the front-desk controls (a receptionist, or a doctor with no receptionist).
 */
export function NotArrivedRowActions({
  appointmentId,
  patientName,
  doctorId,
  doctorName,
  appointmentDate,
  startTime,
  slotStarted,
}: {
  appointmentId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  /** No-Show is only allowed once the slot's start time has passed. */
  slotStarted: boolean;
}) {
  const router = useRouter();
  const openReschedule = useOpenReschedule();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (confirmText: string, action: () => Promise<{ success: boolean; error?: string }>, failure: string) => {
    if (!window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error || failure);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={isPending}
          onClick={() =>
            openReschedule({
              appointmentId,
              doctorId,
              doctorName,
              currentDate: appointmentDate,
              currentTime: startTime,
            })
          }
          className="text-[11px] py-0.5 px-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          title={`Reschedule ${patientName} to another slot`}
        >
          <CalendarClock size={12} />
          <span>Reschedule</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={isPending || !slotStarted}
          onClick={() =>
            run(
              `Mark ${patientName} as No-Show for this appointment?`,
              () => markNoShowAction(appointmentId),
              "Failed to mark as No-Show."
            )
          }
          className="text-[11px] py-0.5 px-1.5 text-amber-700 border-amber-200 hover:bg-amber-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          title={slotStarted ? "Mark patient as No-Show" : "Available once the slot start time has passed"}
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <UserX size={12} />}
          <span>No-Show</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={isPending}
          onClick={() =>
            run(
              `Cancel the appointment for ${patientName}? Any refund follows the clinic cancellation policy.`,
              () => cancelAppointmentAction(appointmentId),
              "Failed to cancel appointment."
            )
          }
          className="text-[11px] py-0.5 px-1.5 text-red-600 border-red-200 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          title="Cancel appointment"
        >
          <X size={12} />
          <span>Cancel</span>
        </Button>
      </div>
      {error && <span className="text-[10px] text-red-600 font-medium">{error}</span>}
    </div>
  );
}
