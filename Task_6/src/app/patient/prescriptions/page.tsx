import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pill } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo } from "@/db/repo";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PatientPrescriptionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?message=Please sign in to view your prescriptions.");

  // A signed-in patient only ever sees their own prescriptions.
  // A patient's id is already in the session; only a doctor viewing their own patient record needs a lookup.
  const patientId = user.role === "PATIENT" ? user.profileId : (await dbRepo.getPatientByUserId(user.userId))?.id;
  const prescriptions = patientId ? await dbRepo.getPrescriptionsByPatientId(patientId) : [];

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <Link href="/patient/dashboard" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <ArrowLeft size={13} />
            <span>Back to Patient Portal</span>
          </Link>
          <div className="eyebrow">CLINICAL RECORDS · RUBY HALL CLINIC</div>
          <h1>My Prescriptions</h1>
          <p>Medicines written by your doctor after each consultation. Follow your doctor&apos;s advice, not the assistant&apos;s.</p>
        </div>
      </div>

      {prescriptions.length === 0 ? (
        <Card className="space-y-2 py-10 text-center">
          <Pill className="mx-auto text-slate-400" size={28} />
          <p className="text-sm text-slate-600">No prescriptions yet. They appear here once a doctor adds one after your visit.</p>
        </Card>
      ) : (
        prescriptions.map((rx) => (
          <Card key={rx.id} className="space-y-3">
            <div className="card-head">
              <div>
                <h2>
                  Dr. {rx.doctor.firstName} {rx.doctor.lastName}
                </h2>
                <p>
                  {rx.doctor.specialization} · Visit on {formatDate(rx.appointment.appointmentDate)}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Dosage</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rx.medicines.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <b>{m.name}</b>
                      </TableCell>
                      <TableCell>{m.dosage}</TableCell>
                      <TableCell>{m.frequency}</TableCell>
                      <TableCell>{m.duration}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rx.notes && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{rx.notes}</p>}
          </Card>
        ))
      )}
    </div>
  );
}
