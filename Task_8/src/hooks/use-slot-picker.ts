"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDoctorSessionsAction } from "@/actions/availability";
import {
  createBookingHoldAction,
  verifyPaymentAndConfirmBookingAction,
  simulateMockPaymentAction,
} from "@/actions/appointments";

export interface Slot {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  seatsLeft: number;
  isBooked: boolean;
}

export interface SessionGroup {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
  timeRange: string;
  slots: Slot[];
}

export interface ActiveHold {
  provider: string;
  keyId?: string;
  orderId: string;
  amountPaise: number;
  amountRupees: number;
  currency: string;
  paymentId: string;
  appointmentId: string;
  holdExpiresAt: string;
  receiptNo: string;
  doctorName: string;
  specialization: string;
  appointmentDate: string;
  startTime: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
}

export interface AvailableDate {
  dateString: string;
  dayName: string;
  dayNum: string;
  isToday: boolean;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface UseSlotPickerParams {
  doctorId: string;
  doctorName: string;
  isLoggedIn: boolean;
  initialDate?: string;
  initialSlot?: string;
}

export function useSlotPicker({
  doctorId,
  doctorName,
  isLoggedIn,
  initialDate,
  initialSlot,
}: UseSlotPickerParams) {
  const [isPending, startTransition] = useTransition();
  const initialSlotPending = useRef(Boolean(initialSlot));
  const router = useRouter();

  const [availableDates] = useState<AvailableDate[]>(() => {
    const list: AvailableDate[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
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
    availableDates.find((d) => d.dateString === initialDate)?.dateString || availableDates[0]?.dateString || ""
  );
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isLeave, setIsLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmedDetails, setConfirmedDetails] = useState<{
    tokenNumber?: number;
    receiptNo?: string;
    paymentId?: string;
  } | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);

  // Payment hold state
  const [activeHold, setActiveHold] = useState<ActiveHold | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);

  // Pre-load Razorpay checkout script on mount
  useEffect(() => {
    loadRazorpayScript().catch(() => {});
  }, []);

  // Load session groups whenever selected date changes
  useEffect(() => {
    if (!selectedDate) return;
    setIsLoadingSlots(true);
    setError(null);
    setSelectedSlot(null);

    getDoctorSessionsAction(doctorId, selectedDate).then((res) => {
      setIsLoadingSlots(false);
      if (res.success) {
        setIsLeave(Boolean(res.isLeave));
        setLeaveReason(res.leaveReason || null);
        const loaded = (res.groups as SessionGroup[]) || [];
        setGroups(loaded);
        if (initialSlotPending.current) {
          initialSlotPending.current = false;
          const wanted = loaded.flatMap((g) => g.slots).find((s) => s.startTime === initialSlot && !s.isBooked);
          if (wanted) setSelectedSlot(wanted);
        }
      } else {
        setGroups([]);
        if (res.error) setError(res.error);
      }
    });
  }, [doctorId, selectedDate, initialSlot]);

  // Hold expiration countdown timer
  useEffect(() => {
    if (!activeHold) {
      setRemainingSeconds(null);
      return;
    }

    const expiresAt = new Date(activeHold.holdExpiresAt).getTime();

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(diff);
      if (diff <= 0) {
        setActiveHold(null);
        setIsCheckoutModalOpen(false);
        setError("Your 10-minute seat hold has expired. Please select a slot again.");
        // Refresh slots
        getDoctorSessionsAction(doctorId, selectedDate).then((res) => {
          if (res.success) setGroups((res.groups as SessionGroup[]) || []);
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeHold, doctorId, selectedDate]);

  const formatTimer = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const verifyAndFinalizePayment = async (data: {
    appointmentId: string;
    paymentId: string;
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) => {
    setIsSimulatingPayment(true);
    const res = await verifyPaymentAndConfirmBookingAction(data);
    setIsSimulatingPayment(false);

    if (res.success) {
      setError(null);
      setSuccess(
        `Consultation confirmed with Dr. ${doctorName}! Token #${res.tokenNumber} assigned.`
      );
      setConfirmedDetails({
        tokenNumber: res.tokenNumber,
        receiptNo: res.receiptNo,
        paymentId: res.paymentId,
      });
      setIsCheckoutModalOpen(false);
      setActiveHold(null);
      setSelectedSlot(null);
      setReason("");

      // Refresh slot counts
      getDoctorSessionsAction(doctorId, selectedDate).then((update) => {
        if (update.success) setGroups((update.groups as SessionGroup[]) || []);
      });
    } else {
      setError(res.error || "Payment verification failed.");
      setIsCheckoutModalOpen(false);
    }
  };

  const tryLaunchRazorpayCheckout = async (hold: ActiveHold) => {
    if (hold.provider !== "RAZORPAY") {
      setIsCheckoutModalOpen(true);
      return;
    }
    const loaded = await loadRazorpayScript();
    if (loaded && (window as any).Razorpay && hold.keyId) {
      setIsCheckoutModalOpen(false);

      const options = {
        key: hold.keyId,
        amount: hold.amountPaise,
        currency: hold.currency,
        name: "Medrella Healthcare",
        description: `OPD Consultation with Dr. ${hold.doctorName}`,
        order_id: hold.orderId,
        prefill: {
          name: hold.patientName || "Patient",
          email: hold.patientEmail || "patient@medrella.test",
          contact: (hold.patientPhone || "").replace(/\D/g, "").slice(-10) || "9876543210",
        },
        theme: {
          color: "#0875df",
        },
        handler: async (response: any) => {
          await verifyAndFinalizePayment({
            appointmentId: hold.appointmentId,
            paymentId: hold.paymentId,
            providerOrderId: response.razorpay_order_id,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => {
            console.log("Razorpay checkout modal dismissed by user.");
            setIsCheckoutModalOpen(true);
          },
        },
      };

      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", (response: any) => {
          setError(`Payment failed: ${response.error?.description || "Transaction declined"}`);
          setIsCheckoutModalOpen(true);
        });
        rzp.open();
      } catch (err) {
        console.warn("Could not launch Razorpay popup:", err);
        setIsCheckoutModalOpen(true);
      }
    } else {
      setIsCheckoutModalOpen(true);
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : `/doctors/${doctorId}`;
      router.push(
        `/login?redirectTo=${encodeURIComponent(currentPath)}&message=${encodeURIComponent(
          "Please sign in to complete your booking."
        )}`
      );
      return;
    }

    if (!selectedSlot) {
      setError("Please select an available consultation slot or wave.");
      return;
    }

    if (!reason.trim()) {
      setError("Please describe the reason for your consultation.");
      return;
    }

    setError(null);
    setSuccess(null);
    setConfirmedDetails(null);

    const formData = new FormData();
    formData.append("doctorId", doctorId);
    formData.append("appointmentDate", selectedDate);
    formData.append("startTime", selectedSlot.startTime);
    formData.append("endTime", selectedSlot.endTime);
    formData.append("reason", reason);

    startTransition(async () => {
      const res = await createBookingHoldAction(formData);
      if (!res.success) {
        setError(res.error || "Booking failed. Please choose another slot.");
        return;
      }

      // Case 1: Free visit confirmed directly
      if (!res.requiresPayment) {
        setSuccess(
          `Consultation confirmed with Dr. ${doctorName} for ${selectedDate} at ${selectedSlot.startTime}!`
        );
        setConfirmedDetails({
          tokenNumber: res.tokenNumber,
        });
        setSelectedSlot(null);
        setReason("");
        getDoctorSessionsAction(doctorId, selectedDate).then((update) => {
          if (update.success) setGroups((update.groups as SessionGroup[]) || []);
        });
        return;
      }

      // Case 2: Paid visit with seat hold placed
      const hold: ActiveHold = {
        provider: res.provider!,
        keyId: res.keyId,
        orderId: res.orderId!,
        amountPaise: res.amountPaise!,
        amountRupees: res.amountRupees!,
        currency: res.currency!,
        paymentId: res.paymentId!,
        appointmentId: res.appointmentId!,
        holdExpiresAt: res.holdExpiresAt!,
        receiptNo: res.receiptNo!,
        doctorName: res.doctorName!,
        specialization: res.specialization!,
        appointmentDate: res.appointmentDate!,
        startTime: res.startTime!,
        patientName: res.patientName!,
        patientEmail: res.patientEmail!,
        patientPhone: res.patientPhone!,
      };

      setActiveHold(hold);
      setIsCheckoutModalOpen(true);

      // Check if real Razorpay checkout script can be opened
      if (res.provider === "RAZORPAY" && typeof window !== "undefined") {
        tryLaunchRazorpayCheckout(hold);
      }
    });
  };

  const handleSimulatePayment = async (shouldSucceed: boolean) => {
    if (!activeHold) return;

    if (!shouldSucceed) {
      setError("Payment simulation declined by bank card. Your 10-minute hold remains active.");
      setIsCheckoutModalOpen(false);
      return;
    }

    setIsSimulatingPayment(true);
    const paid = await simulateMockPaymentAction({
      appointmentId: activeHold.appointmentId,
      paymentId: activeHold.paymentId,
    });
    setIsSimulatingPayment(false);
    if (!paid.success) {
      setError(paid.error || "Could not simulate the payment.");
      setIsCheckoutModalOpen(false);
      return;
    }

    await verifyAndFinalizePayment({
      appointmentId: activeHold.appointmentId,
      paymentId: activeHold.paymentId,
      providerOrderId: paid.providerOrderId,
      providerPaymentId: paid.providerPaymentId,
      signature: paid.signature,
    });
  };

  const totalOpenSlots = groups.reduce(
    (acc, g) => acc + g.slots.filter((s) => !s.isBooked).length,
    0
  );

  return {
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
    setActiveHold,
    remainingSeconds,
    isCheckoutModalOpen,
    setIsCheckoutModalOpen,
    isSimulatingPayment,
    formatTimer,
    handleBooking,
    tryLaunchRazorpayCheckout,
    handleSimulatePayment,
    totalOpenSlots,
  };
}
