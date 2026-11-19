import Link from "next/link";
import { CalendarDays, Pill, Stethoscope } from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { VisitRecordDialog } from "@/components/medical/visit-record-dialog";
import { VISIT_STATUS_LABEL } from "@/domain/medical-history";
import type { VisitHistoryItem } from "@/domain/patient-record";
import type { AppointmentStatus } from "@/db/repositories/types";
import { formatKolkataTimeShort } from "@/lib/time";
import { formatDate } from "@/lib/utils";

const STATUS_VARIANT: Record<AppointmentStatus, BadgeVariant> = {
  PENDING_PAYMENT: "gray",
  BOOKED: "blue",
  CHECKED_IN: "sky",
  IN_CONSULTATION: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
  NO_SHOW: "amber",
  EXPIRED: "gray",
};

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="whitespace-pre-wrap text-xs text-slate-700">{value}</p>
    </div>
  );
}

/**
 * A patient's visits as a chronological list: date, doctor, consultation status and what was recorded.
 * Pass the items already in the order to show. `viewerDoctorId` lets a doctor add or edit details on their OWN
 * completed visits only; the server action re-checks that, this just decides whether to show the button.
 */
export function VisitTimeline({
  items,
  patientName,
  viewerDoctorId,
  prescriptionsHref,
  emptyText = "No visits yet.",
}: {
  items: VisitHistoryItem[];
  patientName: string;
  viewerDoctorId?: string;
  /** Where a patient can read the full prescription. Omitted for doctors. */
  prescriptionsHref?: string;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map(({ appointment: a, record, prescription }) => {
        const isOwnCompleted = Boolean(viewerDoctorId) && a.doctorId === viewerDoctorId && a.status === "COMPLETED";
        return (
          <li key={a.id} id={`visit-${a.id}`}>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CalendarDays size={14} className="text-slate-400" />
                    <b className="text-sm text-slate-900">{formatDate(a.appointmentDate)}</b>
                    <span className="font-mono text-xs text-blue-600">
                      {a.startTime} – {a.endTime}
                    </span>
                    {a.rescheduledAt && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800">Rescheduled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Stethoscope size={13} className="text-slate-400" />
                    <span>
                      Dr. {a.doctor.firstName} {a.doctor.lastName} · {a.doctor.specialization}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-400">Token #{a.tokenNumber}</span>
                  <Badge variant={STATUS_VARIANT[a.status]}>{VISIT_STATUS_LABEL[a.status]}</Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Reason for visit" value={a.reason} />
                {a.status === "COMPLETED" && (a.checkedInAt || a.consultationStartedAt) && (
                  <Detail
                    label="Timeline"
                    value={[
                      a.checkedInAt ? `Checked in ${formatKolkataTimeShort(a.checkedInAt)}` : null,
                      a.consultationStartedAt ? `Consultation started ${formatKolkataTimeShort(a.consultationStartedAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                )}
                {(a.status === "CANCELLED" || a.status === "NO_SHOW") && (
                  <Detail
                    label={a.status === "CANCELLED" ? "Cancellation" : "Missed visit"}
                    value={
                      a.status === "CANCELLED"
                        ? `Cancelled${a.cancelledBy ? ` by ${a.cancelledBy.toLowerCase()}` : ""}${a.cancelReason ? ` – ${a.cancelReason}` : ""}`
                        : "The patient did not arrive for this appointment."
                    }
                  />
                )}
              </div>

              {a.status === "COMPLETED" && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                  {record ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Detail label="Diagnosis" value={record.diagnosis} />
                      <Detail label="Symptoms" value={record.symptoms} />
                      <Detail label="Consultation notes" value={record.notes} />
                      <Detail label="Follow-up advice" value={record.followUp} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No visit details have been recorded for this consultation.</p>
                  )}

                  {prescription && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <Pill size={11} /> Prescription
                      </div>
                      <p className="text-xs text-slate-700">
                        {prescription.medicines.map((m) => `${m.name} (${m.dosage}, ${m.frequency}, ${m.duration})`).join("; ")}
                      </p>
                      {prescriptionsHref && (
                        <Link href={prescriptionsHref} className="text-[11px] font-semibold text-blue-600 hover:underline">
                          View full prescription
                        </Link>
                      )}
                    </div>
                  )}

                  {isOwnCompleted && (
                    <VisitRecordDialog
                      appointmentId={a.id}
                      patientName={patientName}
                      initial={
                        record
                          ? {
                              diagnosis: record.diagnosis,
                              symptoms: record.symptoms ?? "",
                              notes: record.notes ?? "",
                              followUp: record.followUp ?? "",
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
