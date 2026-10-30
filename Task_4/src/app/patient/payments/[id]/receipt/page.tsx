import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/payments";
import { refundLabel, refundBadgeClass, refundHint } from "@/lib/payments/labels";
import { ArrowLeft, Printer, ShieldCheck, CheckCircle2 } from "lucide-react";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentReceiptPage({ params }: ReceiptPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?message=Please sign in to view receipts.");
  }

  const payment = await dbRepo.getPaymentById(id);
  if (!payment) {
    notFound();
  }

  const appointment = await dbRepo.getAppointmentById(payment.appointmentId);
  if (!appointment) {
    notFound();
  }

  // Authorization check
  const isPatientOwner = user.role === "PATIENT" && payment.patientId === user.profileId;
  const isDoctorOwner = user.role === "DOCTOR" && appointment.doctorId === user.profileId;
  if (!isPatientOwner && !isDoctorOwner) {
    return (
      <div className="p-8 text-center text-xs text-red-600">
        Unauthorized: You do not have permission to view this receipt.
      </div>
    );
  }

  const doctor = await dbRepo.getDoctorById(appointment.doctorId);
  const patient = await dbRepo.getPatientById(payment.patientId);
  const refunds = await dbRepo.getRefundsByPaymentId(payment.id);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4">
      {/* Navigation & Print Actions */}
      <div className="flex items-center justify-between no-print">
        <Link
          href="/patient/payments"
          className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
        >
          <ArrowLeft size={14} />
          <span>Back to Payments</span>
        </Link>
        <PrintButton />
      </div>

      {/* Printable Receipt Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6 printable-receipt">
        {/* Receipt Header */}
        <div className="border-b border-slate-200 pb-6 flex items-start justify-between">
          <div>
            <div className="text-xl font-extrabold text-blue-900 tracking-tight">
              RUBY HALL CLINIC
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              40 Sassoon Road, Sangamvadi, Pune, Maharashtra 411001
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Phone: +91 20 6645 5100 · Clinical OPD Services
            </div>
          </div>
          <div className="text-right">
            <span className="badge green text-xs font-mono font-bold">
              {payment.status}
            </span>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Receipt No: <b className="text-slate-800">{payment.receiptNo}</b>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Date: {payment.paidAt ? formatDate(payment.paidAt.toISOString().split("T")[0]) : formatDate(payment.createdAt.toISOString().split("T")[0])}
            </div>
          </div>
        </div>

        {/* Patient & Doctor Grid */}
        <div className="grid grid-cols-2 gap-6 text-xs border-b border-slate-100 pb-6">
          <div>
            <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider block mb-1">
              Patient Details
            </span>
            <div className="font-bold text-sm text-slate-800">
              {patient ? `${patient.firstName} ${patient.lastName}` : "Valued Patient"}
            </div>
            <div className="text-slate-600 mt-0.5">Phone: {patient?.phone || "N/A"}</div>
            <div className="text-slate-500 text-[11px] font-mono mt-0.5">
              ID: {payment.patientId}
            </div>
          </div>

          <div>
            <span className="text-slate-400 uppercase font-bold text-[10px] tracking-wider block mb-1">
              Consulting Specialist
            </span>
            <div className="font-bold text-sm text-slate-800">
              Dr. {doctor?.firstName} {doctor?.lastName}
            </div>
            <div className="text-blue-700 font-semibold mt-0.5">
              {doctor?.specialization || "Specialist"}
            </div>
            <div className="text-slate-500 text-[11px] mt-0.5">
              Reg Lic: {doctor?.licenseNumber || "MC-PUNE"}
            </div>
          </div>
        </div>

        {/* Appointment Information */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-2">
          <div className="font-bold text-slate-800 flex items-center justify-between">
            <span>Consultation Session</span>
            <span className="text-blue-700 font-black text-sm">
              Queue Token #{appointment.tokenNumber}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-600">
            <div>
              <span className="text-slate-400 block text-[11px]">Date & Time</span>
              <b>{formatDate(appointment.appointmentDate)} · {appointment.startTime} – {appointment.endTime}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Reason for Visit</span>
              <span>{appointment.reason || "General OPD Medical Consultation"}</span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Billing Breakdown
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-left">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Fee (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-2.5 font-medium text-slate-800">
                  Specialist Consultation Fee (Dr. {doctor?.firstName} {doctor?.lastName})
                </td>
                <td className="py-2.5 text-right font-mono font-bold text-slate-800">
                  {formatPaise(payment.amountPaise)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-slate-500">Hospital Administration & Facility Charge</td>
                <td className="py-2 text-right font-mono text-slate-500">₹0.00</td>
              </tr>
              <tr className="border-t border-slate-200 font-bold text-sm text-slate-900">
                <td className="py-3">Total Paid</td>
                <td className="py-3 text-right font-mono text-blue-700">
                  {formatPaise(payment.amountPaise)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Refund Details (if any): one block per refund, with its real status */}
        {refunds.map((refund) => (
          <div key={refund.id} className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl text-xs space-y-2">
            <div className="font-bold text-purple-900 flex items-center justify-between">
              <span>Refund</span>
              <span className={`badge ${refundBadgeClass(refund.status)}`}>{refundLabel(refund.status)}</span>
            </div>
            <div className="flex justify-between items-center text-purple-800">
              <span>{refund.status === "PROCESSED" ? "Amount refunded:" : "Amount being refunded:"}</span>
              <b className="font-mono">{formatPaise(refund.amountPaise)}</b>
            </div>
            <div className="text-[11px] text-purple-700">{refundHint(refund.status)}</div>
            <div className="text-[11px] text-purple-700">
              Reason: {refund.reason || "Appointment cancellation refund"}
            </div>
            {refund.providerRefundId && (
              <div className="text-[11px] font-mono text-purple-600">Refund ID: {refund.providerRefundId}</div>
            )}
          </div>
        ))}

        {/* Payment Gateway Audit Metadata */}
        <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Payment Provider:</span>
            <span className="font-mono text-slate-600">{payment.provider} (Test Sandbox)</span>
          </div>
          <div className="flex justify-between">
            <span>Provider Order ID:</span>
            <span className="font-mono text-slate-600">{payment.providerOrderId}</span>
          </div>
          {payment.providerPaymentId && (
            <div className="flex justify-between">
              <span>Provider Payment ID:</span>
              <span className="font-mono text-slate-600">{payment.providerPaymentId}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-2 text-amber-700">
            <ShieldCheck size={14} />
            <span>This is an official computer-generated receipt for simulated test transactions.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
