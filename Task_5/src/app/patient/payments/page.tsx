import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/payments";
import { refundLabel, refundBadgeClass } from "@/lib/payments/labels";
import { CreditCard, FileText, ArrowLeft, ShieldCheck, CheckCircle2, Clock3, AlertCircle } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PatientPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?message=Please sign in to view payment history.");
  }

  let patientId = user.profileId;
  if (user.role === "DOCTOR") {
    const p = await dbRepo.getPatientByUserId(user.userId);
    if (p) patientId = p.id;
  }

  const patient = patientId ? await dbRepo.getPatientById(patientId) : undefined;
  const payments = patientId ? await dbRepo.getPaymentsByPatientId(patientId) : [];
  const refundsByPayment = new Map(
    await Promise.all(payments.map(async (p) => [p.id, await dbRepo.getRefundsByPaymentId(p.id)] as const))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-heading">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/patient/dashboard"
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
            >
              <ArrowLeft size={13} />
              <span>Back to Patient Portal</span>
            </Link>
          </div>
          <div className="eyebrow">BILLING & SETTLEMENTS · RAZORPAY TEST MODE</div>
          <h1>Payment History & Receipts</h1>
          <p>
            Official consultation receipts, transaction audit logs, and refund status at Ruby Hall Clinic.
          </p>
        </div>
        <div className="heading-actions">
          <Link href="/doctors" className="btn primary">
            Book New Consultation
          </Link>
        </div>
      </div>

      {/* Test Mode Info Banner */}
      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
        <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block">Razorpay Test Mode Credentials:</span>
          <span>
            All payments and refunds shown below are simulated in test mode (rzp_test_). No real monetary transactions occurred.
          </span>
        </div>
      </div>

      {/* Payments Table */}
      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2>Transaction Records</h2>
            <p>{payments.length} payment transaction{payments.length === 1 ? "" : "s"} logged</p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50">
            No payments recorded yet. When you book a doctor consultation, receipts will appear here.
          </div>
        ) : (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Date Paid</TableHead>
                  <TableHead>Consulting Specialist</TableHead>
                  <TableHead>Visit Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice / Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const isPaid = p.status === "PAID";
                  const isRefunded = p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED";
                  const isFailed = p.status === "FAILED";

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="font-mono text-xs font-bold text-slate-800">
                          {p.receiptNo}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-700 block">
                          {formatDate(p.createdAt.toISOString().split("T")[0])}
                        </span>
                        <small className="text-[10px] text-slate-400 font-mono">
                          {p.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </small>
                      </TableCell>
                      <TableCell>
                        <b>Dr. {p.doctor.firstName} {p.doctor.lastName}</b>
                        <small className="block text-blue-600">{p.doctor.specialization}</small>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-slate-800">
                          {formatDate(p.appointment.appointmentDate)}
                        </span>
                        <small className="block font-mono text-slate-500">
                          {p.appointment.startTime} – {p.appointment.endTime} (Token #{p.appointment.tokenNumber})
                        </small>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-slate-900 text-xs">
                          {formatPaise(p.amountPaise)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {p.provider}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`badge ${
                            isPaid
                              ? "green"
                              : isRefunded
                              ? "purple"
                              : isFailed
                              ? "red"
                              : "amber"
                          }`}
                        >
                          {p.status}
                        </span>
                        {(refundsByPayment.get(p.id) ?? []).map((r) => (
                          <small key={r.id} className="block mt-1">
                            <span className={`badge ${refundBadgeClass(r.status)}`}>{refundLabel(r.status)}</span>{" "}
                            <span className="font-mono text-[11px] text-slate-600">{formatPaise(r.amountPaise)}</span>
                          </small>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/patient/payments/${p.id}/receipt`}
                          className="btn text-xs py-1 px-2.5 inline-flex items-center gap-1.5"
                        >
                          <FileText size={13} />
                          <span>View Receipt</span>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
