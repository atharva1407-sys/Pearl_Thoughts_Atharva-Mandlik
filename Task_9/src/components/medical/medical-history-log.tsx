import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { MedicalHistoryLogEntity } from "@/db/repositories/types";
import { formatKolkataDateTime } from "@/lib/time";

/** The update history of a medical profile: every saved change, newest first, with who made it and what changed. */
export function MedicalHistoryLog({ entries, patientName }: { entries: MedicalHistoryLogEntity[]; patientName: string }) {
  return (
    <Card className="space-y-4">
      <div className="card-head">
        <div>
          <h2 className="flex items-center gap-2">
            <History size={16} className="text-slate-500" /> Update History
          </h2>
          <p>
            {entries.length === 0
              ? "Changes to this record will be listed here."
              : `${entries.length} saved change${entries.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
          No updates have been made to this medical record yet.
        </div>
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={e.changedByRole === "DOCTOR" ? "blue" : "green"}>
                  {e.changedByRole === "DOCTOR" ? "Doctor" : patientName === e.changedByName ? "Patient (self)" : "Patient"}
                </Badge>
                <b className="text-slate-800">{e.changedByName}</b>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{formatKolkataDateTime(e.createdAt)}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-400">v{e.version}</span>
              </div>
              {e.changeNote && <p className="text-xs italic text-slate-600">&ldquo;{e.changeNote}&rdquo;</p>}
              <ul className="space-y-1.5">
                {e.changes.map((c) => (
                  <li key={c.field} className="text-xs text-slate-700">
                    <b>{c.label}:</b>{" "}
                    <span className="text-slate-500 line-through decoration-slate-300">{c.from}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span className="font-medium">{c.to}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
