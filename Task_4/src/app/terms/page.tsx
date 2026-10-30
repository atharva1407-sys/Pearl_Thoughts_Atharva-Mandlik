import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Medrella Healthcare clinical appointment and outpatient service terms.",
};

export default function TermsPage() {
  return (
    <main className="max-w-3xl w-full mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 sm:p-10">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/"
            className="text-xs font-semibold text-[#0875df] hover:underline"
          >
            ← Back to Medrella Home
          </Link>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-[#14243d] mb-2 tracking-tight">
          Terms of Service
        </h1>
        <p className="text-xs font-mono text-[#5d6d84] mb-8 pb-4 border-b border-slate-100">
          Last updated: October 2026 • Ruby Hall Clinic Outpatient Services
        </p>

        <div className="space-y-6 text-sm text-[#334155] leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">1. Outpatient Appointment Services</h2>
            <p>
              Medrella Healthcare provides a unified digital scheduling platform connecting verified outpatient physicians and patients across Pune. Appointments booked through this platform are reserved exclusively for the patient registered.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">2. Cancellation & Rescheduling Policy</h2>
            <p>
              To respect practitioner schedules and ensure timely care for other patients, appointment cancellations must be executed at least 1 hour prior to the scheduled consultation time. Same-day cancellations within 60 minutes must be directed through the clinic front-desk.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">3. Medical Records & Consultations</h2>
            <p>
              Clinical encounter summaries and prescriptions issued by attending doctors are maintained under strict clinical governance standards. All accounts require individual verification.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">4. Contact & Support</h2>
            <p>
              For urgent administrative queries or outpatient support, contact the clinic coordination desk at +91 20 6645 5100 or support@medrella.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
