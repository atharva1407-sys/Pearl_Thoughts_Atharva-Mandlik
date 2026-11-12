"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Timer,
  FileText,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSlotPicker, type Slot, type SessionGroup, type ActiveHold } from "@/hooks/use-slot-picker";

export type { Slot, SessionGroup, ActiveHold };

interface SlotPickerProps {
  doctorId: string;
  doctorName: string;
  consultationFee: number;
  isLoggedIn: boolean;
  /** Optional deep link (from the assistant): open on this date and pre-select this slot. */
  initialDate?: string;
  initialSlot?: string;
}

export function SlotPicker({
  doctorId,
  doctorName,
  consultationFee,
  isLoggedIn,
  initialDate,
  initialSlot,
}: SlotPickerProps) {
  const router = useRouter();
  const {
    isPending,
    availableDates,
    selectedDate,
    setSelectedDate,
    groups,
    selectedSlot,
    setSelectedSlot,
    isLeave,
    leaveReason,
    reason,
    setReason,
    error,
    setError,
    success,
    setSuccess,
    confirmedDetails,
    setConfirmedDetails,
    isLoadingSlots,
    activeHold,
    remainingSeconds,
    isCheckoutModalOpen,
    setIsCheckoutModalOpen,
    isSimulatingPayment,
    formatTimer,
    handleBooking,
    tryLaunchRazorpayCheckout,
    handleSimulatePayment,
    totalOpenSlots,
  } = useSlotPicker({
    doctorId,
    doctorName,
    isLoggedIn,
    initialDate,
    initialSlot,
  });

  return (
    <Card className="space-y-6">
      <div className="card-head">
        <div>
          <h2>Select Consultation Date & Time</h2>
          <p>Real-time slot availability for Ruby Hall OPD · Stream & Wave Sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="sky">Capacity Managed</Badge>
          <Badge variant="amber" className="text-[11px] font-mono">Test Mode (rzp_test_)</Badge>
        </div>
      </div>

      {/* Test Mode Notice Banner */}
      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
        <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Razorpay Test Mode Active:</span>
          <span>
            All booking fees and refunds use sandbox test credentials (rzp_test_). No real credit card or bank money is charged.
          </span>
        </div>
      </div>

      {/* Date Selection Ribbon */}
      <div>
        <Label className="text-xs font-bold text-slate-700 block mb-2">
          Step 1: Choose Appointment Date
        </Label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {availableDates.map((item) => {
            const isSelected = selectedDate === item.dateString;
            return (
              <Button variant="bare"
                key={item.dateString}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${item.dayName} ${item.dayNum}, ${item.isToday ? "Today" : "Open"}`}
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
              </Button>
            );
          })}
        </div>
      </div>

      {/* Available Slots & Sessions Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-bold text-slate-700">
            Step 2: Choose Available Session & Slot
          </Label>
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
            No active OPD sessions scheduled on this weekday.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div
                key={group.sessionId}
                className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      {group.sessionName}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {group.timeRange} · {group.schedulingType === "WAVE" ? "Wave" : "Stream"}
                      {group.patientsPerWave > 1 ? ` (${group.patientsPerWave} per slot)` : " (1 per slot)"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {group.slots.filter((s) => !s.isBooked).length} slots open
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {group.slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime && selectedSlot?.sessionId === slot.sessionId;
                    return (
                      <Button variant="bare"
                        key={`${slot.sessionId}-${slot.startTime}`}
                        type="button"
                        disabled={slot.isBooked}
                        aria-pressed={isSelected}
                        aria-disabled={slot.isBooked}
                        aria-label={`${slot.startTime}, ${slot.isBooked ? "Full" : slot.capacity > 1 ? `${slot.seatsLeft} seats left` : "Open"}`}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-2 rounded-lg text-center border text-xs transition-all cursor-pointer ${
                          slot.isBooked
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60"
                            : isSelected
                            ? "bg-[#0875df] text-white border-[#0875df] font-bold shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                        }`}
                      >
                        <div className="font-mono font-semibold">{slot.startTime}</div>
                        <div className="text-[10px] mt-0.5 opacity-80">
                          {slot.isBooked
                            ? "Full"
                            : slot.capacity > 1
                            ? `${slot.seatsLeft} seat${slot.seatsLeft === 1 ? "" : "s"}`
                            : "Open"}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Hold Countdown Banner (if hold exists) */}
      {activeHold && remainingSeconds !== null && (
        <div role="status" aria-live="polite" className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-950">
            <Timer className="text-blue-600 animate-pulse" size={16} />
            <div>
              <span className="font-bold">Seat Hold Reserved: </span>
              <span>Complete test payment within </span>
              <span className="font-mono font-extrabold text-blue-700">
                {formatTimer(remainingSeconds)}
              </span>
            </div>
          </div>
          <Button variant="default"
            type="button"
            onClick={() => setIsCheckoutModalOpen(true)}
            className="text-xs py-1 px-2.5"
          >
            Pay ₹{activeHold.amountRupees}
          </Button>
        </div>
      )}

      {/* Error Message Alert */}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Notification Banner */}
      {success && (
        <div role="status" aria-live="polite" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sm block">Appointment Confirmed!</span>
              <span>{success}</span>
            </div>
          </div>

          {confirmedDetails && (
            <div className="p-3 bg-white/80 rounded-lg border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                {confirmedDetails.tokenNumber && (
                  <div>
                    <span className="text-[11px] text-slate-500 block">Assigned Queue Token</span>
                    <span className="text-base font-black text-blue-700">
                      Token #{confirmedDetails.tokenNumber}
                    </span>
                  </div>
                )}
                {confirmedDetails.receiptNo && (
                  <div>
                    <span className="text-[11px] text-slate-500 block">Receipt No</span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {confirmedDetails.receiptNo}
                    </span>
                  </div>
                )}
              </div>
              <Badge variant="green">Paid · Test Mode</Badge>
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
            {confirmedDetails?.paymentId && (
              <Link
                href={`/patient/payments/${confirmedDetails.paymentId}/receipt`}
                className="btn text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
              >
                <FileText size={14} />
                <span>Print Payment Receipt</span>
              </Link>
            )}
            <Button variant="outline"
              type="button"
              onClick={() => {
                setSuccess(null);
                setConfirmedDetails(null);
              }}
              className="text-xs py-1.5 px-3"
            >
              Book Another Slot
            </Button>
          </div>
        </div>
      )}

      {/* Booking Form Details */}
      <form onSubmit={handleBooking} className="space-y-4 pt-3 border-t border-slate-100">
        <div>
          <Label className="text-xs font-bold text-slate-700 block mb-1">
            Reason for Consultation / Chief Complaint *
          </Label>
          <Input
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
          <div className="font-bold text-blue-900 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CalendarDays size={15} className="text-blue-600" />
              <span>Consultation Summary</span>
            </div>
            <div className="font-bold text-slate-900">
              Fee: ₹{consultationFee}
            </div>
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
              <span className="block text-slate-400 text-[11px]">Consultation Fee</span>
              <b className="text-slate-900">
                {consultationFee > 0 ? `₹${consultationFee}` : "Free"}
              </b>
            </div>
          </div>
        </div>

        {/* Submit / Pay Button */}
        <div>
          {isLoggedIn ? (
            <Button variant="bare"
              type="submit"
              disabled={isPending || !selectedSlot}
              className={`btn primary w-full justify-center py-2.5 text-xs font-bold cursor-pointer flex items-center gap-1.5 ${
                isPending || !selectedSlot ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <CreditCard size={15} />
              <span>
                {isPending
                  ? "Holding Seat & Initiating Payment..."
                  : consultationFee > 0
                  ? `Pay ₹${consultationFee} & Book (Test Mode)`
                  : "Confirm & Book Consultation (Free)"}
              </span>
            </Button>
          ) : (
            <Button variant="default"
              type="button"
              onClick={() => {
                const currentPath = typeof window !== "undefined" ? window.location.pathname : `/doctors/${doctorId}`;
                router.push(
                  `/login?redirectTo=${encodeURIComponent(currentPath)}&message=${encodeURIComponent(
                    "Please sign in to complete your booking."
                  )}`
                );
              }}
              className="w-full justify-center py-2.5 text-xs font-bold cursor-pointer"
            >
              Sign In to Reserve Slot
            </Button>
          )}
        </div>
      </form>

      {/* Interactive Mock / Razorpay Test Mode Checkout Dialog */}
      {isCheckoutModalOpen && activeHold && (
        <Dialog open onOpenChange={(open) => { if (!open) setIsCheckoutModalOpen(false); }}>
<DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
<DialogDescription className="sr-only">Complete your test payment to confirm the booking.</DialogDescription>
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-200" />
                <div>
                  <DialogTitle className="font-bold text-sm text-white">Razorpay Test Checkout</DialogTitle>
                  <span className="text-[11px] text-blue-200">Medrella Healthcare OPD</span>
                </div>
              </div>
              <Button variant="bare"
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Hold Warning Timer */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
                <div className="flex items-center gap-2">
                  <Timer size={16} className="text-amber-600" />
                  <span className="font-medium">10-Minute Hold Active:</span>
                </div>
                <span className="font-mono font-extrabold text-sm text-amber-800">
                  {formatTimer(remainingSeconds)}
                </span>
              </div>

              {/* Consultation Summary */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Specialist:</span>
                  <b className="text-slate-800">Dr. {activeHold.doctorName}</b>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Date & Slot:</span>
                  <b className="text-slate-800">{activeHold.appointmentDate} at {activeHold.startTime}</b>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Order ID:</span>
                  <span className="font-mono text-[11px] text-slate-700">{activeHold.orderId}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Receipt No:</span>
                  <span className="font-mono text-[11px] text-slate-700">{activeHold.receiptNo}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold text-slate-900">
                  <span>Total Amount (INR):</span>
                  <span className="text-blue-700">₹{activeHold.amountRupees}.00</span>
                </div>
              </div>

              {/* Gateway Controls */}
              <div className="space-y-2 pt-1">
                {activeHold.provider === "RAZORPAY" && (
                  <Button variant="default"
                    type="button"
                    disabled={isSimulatingPayment}
                    onClick={() => tryLaunchRazorpayCheckout(activeHold)}
                    className="w-full justify-center py-2.5 text-xs font-bold cursor-pointer flex items-center gap-2 shadow-xs"
                  >
                    <CreditCard size={15} />
                    <span>Open Official Razorpay Checkout Popup</span>
                  </Button>
                )}

                <Button variant="bare"
                  type="button"
                  disabled={isSimulatingPayment}
                  onClick={() => handleSimulatePayment(true)}
                  className={`btn w-full justify-center py-2.5 text-xs font-bold cursor-pointer flex items-center gap-2 ${
                    activeHold.provider === "RAZORPAY"
                      ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                      : "primary"
                  }`}
                >
                  {isSimulatingPayment ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying Payment Signature...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Simulate Successful Payment (Test ₹{activeHold.amountRupees})</span>
                    </>
                  )}
                </Button>

                <Button variant="outline"
                  type="button"
                  disabled={isSimulatingPayment}
                  onClick={() => handleSimulatePayment(false)}
                  className="w-full justify-center py-2 text-xs text-red-600 border border-red-200 hover:bg-red-50 cursor-pointer"
                >
                  Simulate Bank Payment Failure
                </Button>
              </div>

              <div className="text-[11px] text-slate-400 text-center">
                {activeHold.provider === "RAZORPAY"
                  ? "Uses your Razorpay test sandbox. Real orders & payments appear directly on dashboard.razorpay.com."
                  : "Test mode simulator. In production, this opens Razorpay's checkout iframe."}
              </div>
            </div>
          </DialogContent>
</Dialog>
      )}
    </Card>
  );
}
