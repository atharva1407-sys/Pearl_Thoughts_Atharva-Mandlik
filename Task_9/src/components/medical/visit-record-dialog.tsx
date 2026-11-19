"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Loader2 } from "lucide-react";
import { saveVisitRecordAction } from "@/actions/medical-history";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Lets the treating doctor record (or correct) what they found at one of their own completed visits. */
export function VisitRecordDialog({
  appointmentId,
  patientName,
  initial,
}: {
  appointmentId: string;
  patientName: string;
  initial?: { diagnosis: string; symptoms: string; notes: string; followUp: string };
}) {
  const router = useRouter();
  const start = initial ?? { diagnosis: "", symptoms: "", notes: "", followUp: "" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setForm(initial ?? { diagnosis: "", symptoms: "", notes: "", followUp: "" });
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveVisitRecordAction({ appointmentId, ...form });
      if (res.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog} className="gap-1 text-xs">
        <ClipboardPen size={13} /> {initial ? "Edit visit details" : "Add visit details"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Visit details for {patientName}</DialogTitle>
            <DialogDescription>The patient can read this in their medical history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Diagnosis</Label>
              <Input maxLength={200} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Viral fever" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Symptoms (optional)</Label>
              <Textarea maxLength={600} value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Consultation notes (optional)</Label>
              <Textarea maxLength={1500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Follow-up advice (optional)</Label>
              <Input maxLength={400} value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} placeholder="e.g. Review in 2 weeks" />
            </div>
            {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
