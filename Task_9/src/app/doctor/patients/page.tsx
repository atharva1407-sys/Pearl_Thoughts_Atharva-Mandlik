import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo, toLocalDateString } from "@/db/repo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TREATING_STATUSES } from "@/domain/medical-history";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorPatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in as a doctor to view your patients.");
  }
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();

  // "My patients" = everyone with a real booking with this doctor. Cancelled and unpaid bookings do not count.
  const appointments = (await dbRepo.getAppointmentsByDoctorId(user.profileId)).filter((a) =>
    TREATING_STATUSES.includes(a.status)
  );

  const byPatient = new Map<
    string,
    { patient: (typeof appointments)[number]["patient"]; completed: number; last?: string; next?: string }
  >();
  const today = toLocalDateString(new Date());
  for (const a of appointments) {
    const row = byPatient.get(a.patientId) ?? { patient: a.patient, completed: 0 };
    if (a.status === "COMPLETED") {
      row.completed++;
      if (!row.last || a.appointmentDate > row.last) row.last = a.appointmentDate;
    } else if (a.appointmentDate >= today && (!row.next || a.appointmentDate < row.next)) {
      row.next = a.appointmentDate;
    }
    byPatient.set(a.patientId, row);
  }

  const rows = [...byPatient.entries()]
    .filter(([, r]) => !query || `${r.patient.firstName} ${r.patient.lastName} ${r.patient.phone}`.toLowerCase().includes(query))
    .sort(
      ([, a], [, b]) =>
        (b.last ?? "").localeCompare(a.last ?? "") || a.patient.firstName.localeCompare(b.patient.firstName)
    );

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PHYSICIAN CARE · PATIENT RECORDS</div>
          <h1>My Patients</h1>
          <p>Open a patient to review their medical history, past visits and update the record.</p>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2 className="flex items-center gap-2">
              <Users size={16} className="text-blue-500" /> Patients
            </h2>
            <p>
              {rows.length} patient{rows.length === 1 ? "" : "s"}
              {query ? ` matching “${q.trim()}”` : ""}
            </p>
          </div>
          <form action="/doctor/patients" className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                aria-label="Search patients"
                placeholder="Search name or phone"
                className="h-9 w-56 rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <button type="submit" className="btn text-xs">
              Search
            </button>
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500">
            {query ? "No patients match your search." : "You have no patients yet. They appear here once someone books with you."}
          </div>
        ) : (
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Completed visits</TableHead>
                  <TableHead>Last visit</TableHead>
                  <TableHead>Next appointment</TableHead>
                  <TableHead>Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(([id, r]) => (
                  <TableRow key={id}>
                    <TableCell>
                      <b>
                        {r.patient.firstName} {r.patient.lastName}
                      </b>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.patient.phone}</TableCell>
                    <TableCell>
                      <Badge variant={r.completed > 0 ? "green" : "gray"}>{r.completed}</Badge>
                    </TableCell>
                    <TableCell>{r.last ? formatDate(r.last) : "—"}</TableCell>
                    <TableCell>{r.next ? formatDate(r.next) : "—"}</TableCell>
                    <TableCell>
                      <Link href={`/doctor/patients/${id}`} className="text-xs font-bold text-blue-600 hover:underline">
                        Open record
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
