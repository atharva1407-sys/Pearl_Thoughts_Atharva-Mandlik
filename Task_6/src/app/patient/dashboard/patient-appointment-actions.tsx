"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  X,
  Loader2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import {
  cancelAppointmentAction,
  getRefundPreviewAction,
} from "@/actions/appointments";
import { RescheduleModal } from "@/components/reschedule-modal";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
interface PatientAppointmentActionsProps {
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
}

interface RefundPreview {
  hasPayment: boolean;
  eligible: boolean;
  refundPercentage: number;
  refundAmountRupees: number;
  refundAmountPaise: number;
  originalAmountPaise: number;
  policyTier: string;
  reason: string;
  receiptNo?: string;
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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancellationResult, setCancellationResult] = useState<string | null>(null);

  const handleOpenCancelModal = async () => {
    setIsCancelModalOpen(true);
    setIsLoadingPreview(true);
    setErrorMessage(null);
    setCancellationResult(null);

    const res = await getRefundPreviewAction(appointmentId);
    setIsLoadingPreview(false);
    if (res.success) {
      setRefundPreview({
        hasPayment: res.hasPayment ?? false,
        eligible: res.eligible ?? false,
        refundPercentage: res.refundPercentage ?? 0,
        refundAmountRupees: res.refundAmountRupees ?? 0,
        refundAmountPaise: res.refundAmountPaise ?? 0,
        originalAmountPaise: res.originalAmountPaise ?? 0,
        policyTier: res.policyTier ?? "",
        reason: res.reason ?? "",
        receiptNo: res.receiptNo,
      });
    }
  };

  const handleConfirmCancel = () => {
    setErrorMessage(null);

    startTransition(async () => {
      const res = await cancelAppointmentAction(appointmentId);
      if (res.success) {
        setCancellationResult(res.message || "Appointment cancelled successfully.");
        setTimeout(() => {
          setIsCancelModalOpen(false);
          router.refresh();
        }, 1500);
      } else {
        setErrorMessage(res.error || "Failed to cancel appointment.");
      }
    });
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <Button variant="bare"
            type="button"
            onClick={() => setIsRescheduleOpen(true)}
            disabled={isPending}
            className="px-2.5 py-1 text-xs text-[#0875df] border border-blue-200 hover:bg-blue-50 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="Reschedule Appointment"
          >
            <CalendarClock size={12} />
            <span>Reschedule</span>
          </Button>

          <Button variant="bare"
            type="button"
            onClick={handleOpenCancelModal}
            disabled={isPending}
            className="px-2.5 py-1 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            title="Cancel Appointment"
          >
            <X size={12} />
            <span>Cancel</span>
          </Button>
        </div>

        {errorMessage && !isCancelModalOpen && (
          <span className="text-[11px] text-red-600 font-semibold max-w-[200px] text-right">
            {errorMessage}
          </span>
        )}
      </div>

      {/* Reschedule Modal */}
      <RescheduleModal
        appointmentId={appointmentId}
        doctorId={doctorId}
        doctorName={doctorName}
        currentDate={appointmentDate}
        currentTime={startTime}
        isOpen={isRescheduleOpen}
        onClose={() => setIsRescheduleOpen(false)}
      />

      {/* Cancellation & Refund Preview Modal */}
      {isCancelModalOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) setIsCancelModalOpen(false); }}>
<DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
<DialogDescription className="sr-only">Review the refund before cancelling this appointment.</DialogDescription>
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" />
                <DialogTitle className="font-bold text-sm text-white">Cancel Appointment & Refund Preview</DialogTitle>
              </div>
              <Button variant="bare"
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="font-bold text-slate-800 text-sm">
                  Dr. {doctorName}
                </div>
                <div className="text-slate-600">
                  Scheduled for: <b>{appointmentDate} at {startTime}</b>
                </div>
              </div>

              {isLoadingPreview ? (
                <div className="py-6 text-center text-slate-400 space-y-2">
                  <Loader2 size={20} className="animate-spin mx-auto text-blue-600" />
                  <div>Calculating Ruby Hall refund policy preview...</div>
                </div>
              ) : cancellationResult ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-sm">Appointment Cancelled</span>
                    <span>{cancellationResult}</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Refund Policy Calculation Card */}
                  <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-slate-700">
                    <div className="font-bold text-blue-950 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <RotateCcw size={14} className="text-blue-600" />
                        <span>Estimated Refund</span>
                      </span>
                      {refundPreview?.hasPayment && (
                        <Badge variant="blue" className="font-mono">
                          {refundPreview.policyTier}
                        </Badge>
                      )}
                    </div>

                    {refundPreview?.hasPayment ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Original Fee Paid:</span>
                          <span className="font-mono">₹{refundPreview.originalAmountPaise / 100}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Refund Percentage:</span>
                          <span className="font-bold text-slate-800">{refundPreview.refundPercentage}%</span>
                        </div>
                        <div className="pt-2 border-t border-blue-200/80 flex justify-between items-center text-sm font-extrabold text-blue-900">
                          <span>Refund to Original Method:</span>
                          <span className="text-emerald-700 font-mono">
                            ₹{refundPreview.refundAmountRupees}.00
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 pt-1">
                          {refundPreview.reason}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-600 py-1">
                        This appointment was complimentary or has no paid charge. No refund is due.
                      </div>
                    )}
                  </div>

                  {/* Policy rules note */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <ShieldAlert size={13} className="text-amber-700" />
                      <span>Ruby Hall Cancellation Policy</span>
                    </div>
                    <div>≥ 24h notice: 100% refund · 2–24h notice: 50% refund · &lt; 2h: 0% refund.</div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs">
                      {errorMessage}
                    </div>
                  )}

                  {/* Modal Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline"
                      type="button"
                      disabled={isPending}
                      onClick={() => setIsCancelModalOpen(false)}
                      className="flex-1 justify-center py-2 text-xs"
                    >
                      Keep Appointment
                    </Button>
                    <Button variant="outline"
                      type="button"
                      disabled={isPending}
                      onClick={handleConfirmCancel}
                      className="flex-1 justify-center py-2 text-xs bg-red-600 text-white hover:bg-red-700 cursor-pointer font-bold flex items-center gap-1.5"
                    >
                      {isPending ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Cancelling...</span>
                        </>
                      ) : (
                        <span>Confirm Cancel</span>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
</Dialog>
      )}
    </>
  );
}
