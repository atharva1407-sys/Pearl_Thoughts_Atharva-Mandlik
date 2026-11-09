import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { getInsuranceProvider } from "@/lib/insurance";
import { formatPaise, rupeesToPaise } from "@/lib/payments";
import { InsuranceClient, type InsuranceView } from "./insurance-client";

export const dynamic = "force-dynamic";

export default async function InsurancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/patient/insurance");
  if (user.role !== "PATIENT") redirect("/doctor/dashboard");

  const provider = getInsuranceProvider();
  if (!provider) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Insurance</h1>
        <p className="text-sm text-slate-500">Insurance services are not enabled for this hospital yet.</p>
      </div>
    );
  }

  const [policies, appointments, preauths, claims] = await Promise.all([
    dbRepo.getInsurancePoliciesByPatientId(user.profileId),
    dbRepo.getAppointmentsByPatientId(user.profileId),
    dbRepo.getPreauthsByPatientId(user.profileId),
    dbRepo.getClaimsByPatientId(user.profileId),
  ]);
  const preauthByAppt = new Map(preauths.map((r) => [r.appointmentId, r]));
  const claimByAppt = new Map(claims.map((c) => [c.appointmentId, c]));

  const view: InsuranceView = {
    simulated: provider.isSimulated,
    policies: policies.map((p) => ({
      id: p.id,
      insurerName: p.insurerName,
      policyNumber: `••••${p.policyNumber.slice(-4)}`,
      status: p.status,
      sumInsured: formatPaise(p.sumInsuredPaise),
      copayPercent: p.copayPercent,
    })),
    upcoming: appointments
      .filter((a) => a.status === "BOOKED" && a.doctor.consultationFee > 0)
      .sort((a, b) => (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime))
      .map((a) => {
        const r = preauthByAppt.get(a.id);
        return {
          appointmentId: a.id,
          doctor: `Dr. ${a.doctor.firstName} ${a.doctor.lastName}`,
          when: `${a.appointmentDate} at ${a.startTime}`,
          fee: formatPaise(rupeesToPaise(a.doctor.consultationFee)),
          preauth: r
            ? {
                status: r.status,
                approved: r.approvedAmountPaise != null ? formatPaise(r.approvedAmountPaise) : null,
                note: r.statusNote ?? null,
                reference: r.providerReference ?? null,
              }
            : null,
        };
      }),
    completed: appointments
      .filter((a) => a.status === "COMPLETED" && a.doctor.consultationFee > 0)
      .sort((a, b) => (b.appointmentDate + b.startTime).localeCompare(a.appointmentDate + a.startTime))
      .slice(0, 10)
      .map((a) => {
        const c = claimByAppt.get(a.id);
        return {
          appointmentId: a.id,
          doctor: `Dr. ${a.doctor.firstName} ${a.doctor.lastName}`,
          when: `${a.appointmentDate} at ${a.startTime}`,
          fee: formatPaise(rupeesToPaise(a.doctor.consultationFee)),
          claim: c
            ? {
                status: c.status,
                settled: c.settledAmountPaise != null ? formatPaise(c.settledAmountPaise) : null,
                note: c.statusNote ?? null,
                reference: c.providerReference ?? null,
              }
            : null,
        };
      }),
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-bold tracking-wider text-slate-400">PATIENT CARE · INSURANCE</div>
        <h1 className="text-2xl font-bold text-slate-900">Insurance &amp; Cashless</h1>
        <p className="text-sm text-slate-500">
          Add your policy, ask for cashless pre-authorisation on upcoming visits and track claims for completed ones.
        </p>
      </div>
      <InsuranceClient view={view} />
    </div>
  );
}
