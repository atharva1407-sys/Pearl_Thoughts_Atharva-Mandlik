import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Medrella Healthcare patient confidentiality and medical data privacy policy.",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-xs font-mono text-[#5d6d84] mb-8 pb-4 border-b border-slate-100">
          Last updated: October 2026 • Ruby Hall Clinical Confidentiality Standards
        </p>

        <div className="space-y-6 text-sm text-[#334155] leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">1. Patient Confidentiality & Protection</h2>
            <p>
              At Medrella Healthcare, safeguarding patient personal and health data is our highest institutional priority. All clinical records, consultation notes, and appointment histories are stored with end-to-end security and access-restricted database pooling.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">2. Scoped Clinical Access</h2>
            <p>
              In accordance with strict healthcare isolation principles, doctors are granted access solely to patients with whom they have direct, confirmed outpatient appointments or clinical encounters. Cross-practitioner patient data exposure is strictly prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">3. Data Retention & Account Deletion</h2>
            <p>
              Users may manage or request account removal through their profile settings. Physician account deletion requires resolution of all active scheduled appointments to ensure continuity of care.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-[#14243d] mb-2">4. Clinical Inquiries</h2>
            <p>
              For data privacy inquiries, please contact our Data Governance Officer at privacy@medrella.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
