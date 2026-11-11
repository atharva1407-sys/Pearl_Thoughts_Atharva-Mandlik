"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Timer } from "lucide-react";
import {
  cancelAppointmentAction,
  simulateMockPaymentAction,
  verifyPaymentAndConfirmBookingAction,
} from "@/actions/appointments";
import type { PaymentHold } from "@/lib/agent/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type PayStatus = "idle" | "paying" | "paid" | "released" | "expired";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: any) => void) => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Pays for a seat the assistant is holding. It uses the same payment actions as the booking page:
 * the server verifies the signature and asks the gateway before anything is confirmed.
 */
export function PaymentCard({
  hold,
  onResult,
}: {
  hold: PaymentHold;
  /** Tells the chat what happened so the assistant can say it (and read it aloud). */
  onResult: (message: string) => void;
}) {
  const [status, setStatus] = useState<PayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(hold.holdExpiresAt).getTime() - Date.now()) / 1000))
  );

  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (status === "paid" || status === "released" || status === "expired") return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(hold.holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setStatus("expired");
    }, 1000);
    return () => clearInterval(timer);
  }, [hold.holdExpiresAt, status]);

  // Tell the chat once when the hold runs out, so the assistant can say it.
  useEffect(() => {
    if (status === "expired") {
      onResultRef.current("The payment time ran out, so the seat was released. Nothing was charged. Tell me if you would like to book again.");
    }
  }, [status]);

  const expired = status === "expired";
  const busy = status === "paying";

  async function finish(data: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    const res = await verifyPaymentAndConfirmBookingAction({
      appointmentId: hold.appointmentId,
      paymentId: hold.paymentId,
      ...data,
    });
    if (res.success) {
      setStatus("paid");
      setError(null);
      onResult(
        `Payment received. Your appointment with ${hold.doctorName} on ${hold.appointmentDate} at ${hold.startTime} is confirmed${
          "tokenNumber" in res && res.tokenNumber ? ` (token #${res.tokenNumber})` : ""
        }. A receipt is on its way to your email.`
      );
    } else {
      // The server explains (still being confirmed by the bank, seat lost with refund, etc.).
      setStatus("idle");
      setError(res.error || "The payment could not be verified.");
    }
  }

  async function payWithRazorpay() {
    if (!hold.keyId) {
      setError("Online payment is not available right now. Please try again later.");
      return;
    }
    setStatus("paying");
    setError(null);
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      setStatus("idle");
      setError("The payment window could not load. Check your connection and try again; your seat is still held.");
      return;
    }
    const rzp = new window.Razorpay({
      key: hold.keyId,
      amount: hold.amountPaise,
      currency: hold.currency,
      name: "Medrella Healthcare",
      description: `OPD consultation with ${hold.doctorName}`,
      order_id: hold.orderId,
      prefill: {
        name: hold.patientName,
        email: hold.patientEmail,
        contact: (hold.patientPhone || "").replace(/\D/g, "").slice(-10),
      },
      theme: { color: "#1769e8" },
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        void finish({
          providerOrderId: response.razorpay_order_id,
          providerPaymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
      modal: {
        ondismiss: () => {
          setStatus((s) => (s === "paying" ? "idle" : s));
        },
      },
    });
    rzp.on("payment.failed", (response: { error?: { description?: string } }) => {
      setStatus("idle");
      setError(`The payment failed: ${response.error?.description || "the bank declined it"}. Your seat is still held, so you can try again.`);
    });
    rzp.open();
  }

  async function payWithTestGateway() {
    setStatus("paying");
    setError(null);
    const paid = await simulateMockPaymentAction({ appointmentId: hold.appointmentId, paymentId: hold.paymentId });
    if (!paid.success) {
      setStatus("idle");
      setError(paid.error || "Could not run the test payment.");
      return;
    }
    await finish({ providerOrderId: paid.providerOrderId, providerPaymentId: paid.providerPaymentId, signature: paid.signature });
  }

  function declineTestPayment() {
    setError("The test payment was declined by the bank. Nothing was charged and your seat is still held.");
  }

  async function release() {
    setStatus("paying");
    const res = await cancelAppointmentAction(hold.appointmentId);
    if (res.success) {
      setStatus("released");
      onResult("I released the seat and nothing was charged.");
    } else {
      setStatus("idle");
      setError(res.error || "Could not release the seat.");
    }
  }

  return (
    <Card className="space-y-2.5 p-3.5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <CreditCard size={15} className="text-[#1769e8]" />
        Pay ₹{hold.amountRupees} to confirm
      </div>
      <ul className="space-y-0.5 text-xs text-slate-600">
        <li>
          {hold.doctorName} · {hold.appointmentDate} at {hold.startTime}
        </li>
        <li>Receipt {hold.receiptNo}</li>
      </ul>

      {status === "paid" ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={14} /> Payment received. Booking confirmed.
        </p>
      ) : status === "released" ? (
        <p className="text-xs font-semibold text-slate-600">Seat released. Nothing was charged.</p>
      ) : expired ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Timer size={14} /> The seat hold ended. Ask me to book again.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Timer size={13} /> Seat held for {clock(secondsLeft)}
          </p>
          <div className="flex flex-wrap gap-2">
            {hold.provider === "RAZORPAY" ? (
              <Button size="sm" onClick={payWithRazorpay} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Pay ₹{hold.amountRupees}
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={payWithTestGateway} disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Pay ₹{hold.amountRupees} (test)
                </Button>
                <Button size="sm" variant="outline" onClick={declineTestPayment} disabled={busy}>
                  Simulate failure
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={release} disabled={busy}>
              Release seat
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-red-700" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </Card>
  );
}
