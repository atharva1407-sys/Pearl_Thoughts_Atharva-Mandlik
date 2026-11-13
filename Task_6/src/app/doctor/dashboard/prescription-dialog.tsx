"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, Plus, Trash2 } from "lucide-react";
import { getPrescriptionForEditAction, savePrescriptionAction } from "@/actions/prescriptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Row {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

const EMPTY_ROW: Row = { name: "", dosage: "", frequency: "", duration: "" };

/** Lets the treating doctor write or edit the prescription of a completed consultation. */
export function PrescriptionDialog({ appointmentId, patientName }: { appointmentId: string; patientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function openDialog() {
    setError(null);
    setSaved(false);
    setOpen(true);
    setLoading(true);
    const res = await getPrescriptionForEditAction(appointmentId);
    setLoading(false);
    if (res.success && res.medicines.length > 0) {
      setRows(res.medicines.map((m) => ({ ...m })));
      setNotes(res.notes ?? "");
    }
  }

  function update(i: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await savePrescriptionAction({ appointmentId, medicines: rows, notes });
      if (res.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog} className="gap-1 text-xs">
        <FilePlus2 size={13} /> Prescription
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prescription for {patientName}</DialogTitle>
            <DialogDescription>The patient can read this from their portal and through the assistant.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <div className="col-span-2 space-y-1 sm:col-span-1">
                    <Label className="text-[11px]">Medicine</Label>
                    <Input value={row.name} maxLength={80} onChange={(e) => update(i, "name", e.target.value)} placeholder="e.g. Paracetamol 500 mg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Dosage</Label>
                    <Input value={row.dosage} maxLength={60} onChange={(e) => update(i, "dosage", e.target.value)} placeholder="1 tablet" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Frequency</Label>
                    <Input value={row.frequency} maxLength={60} onChange={(e) => update(i, "frequency", e.target.value)} placeholder="Twice a day" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Duration</Label>
                    <Input value={row.duration} maxLength={60} onChange={(e) => update(i, "duration", e.target.value)} placeholder="5 days" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Remove medicine"
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length >= 12}
                onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW }])}
                className="gap-1"
              >
                <Plus size={13} /> Add medicine
              </Button>
              <div className="space-y-1">
                <Label className="text-[11px]">Advice / notes (optional)</Label>
                <Textarea value={notes} maxLength={600} onChange={(e) => setNotes(e.target.value)} placeholder="Diet, follow-up date, precautions…" />
              </div>
              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              {saved && <p className="text-xs font-semibold text-emerald-700">Prescription saved.</p>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={save} disabled={isPending || loading}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Save prescription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
