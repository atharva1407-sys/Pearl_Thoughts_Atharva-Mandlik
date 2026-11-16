import Link from "next/link";
import { CheckCircle2, AlertCircle, Mail, ArrowLeft } from "lucide-react";
import { unsubscribeWithTokenAction } from "@/actions/notifications";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const resolvedParams = await searchParams;
  const token = resolvedParams?.token;

  let result: { success: boolean; message?: string; error?: string } = {
    success: false,
    error: "No unsubscribe token provided. Please use the link provided in your email.",
  };

  if (token) {
    result = await unsubscribeWithTokenAction(token);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white font-bold text-xl mb-3 shadow-md">
            M
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Medrella Healthcare</h2>
          <p className="text-xs text-slate-500 mt-1">Outpatient Notification Management</p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200/80 sm:px-10">
          {result.success ? (
            <div className="text-center space-y-4">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Unsubscribed Successfully</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                You have been unsubscribed from optional promotional emails and health updates.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left">
                <p className="text-[11px] text-slate-500 leading-normal">
                  <strong>Important Notice:</strong> Essential operational emails (appointment confirmations, payment receipts, refund notices, and clinical schedule reminders) will continue to be sent to ensure timely care delivery.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/"
                  className="btn primary text-xs w-full justify-center inline-flex items-center gap-2"
                >
                  <ArrowLeft size={14} />
                  <span>Return to Medrella Home</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-amber-100 text-amber-600">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Unsubscribe Link Error</h3>
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {result.error}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                If your link has expired, you can manage your notification preferences directly by signing into your account.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  href="/login"
                  className="btn primary text-xs w-full justify-center inline-flex items-center gap-2"
                >
                  <Mail size={14} />
                  <span>Sign In to Manage Preferences</span>
                </Link>
                <Link
                  href="/"
                  className="btn text-xs w-full justify-center text-slate-600 hover:text-slate-900"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
