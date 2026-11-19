"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { saveMedicalProfileAction } from "@/actions/medical-history";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ALLERGY_SEVERITIES,
  BLOOD_GROUPS,
  CONDITION_STATUSES,
  describeAllergy,
  describeCondition,
} from "@/domain/medical-history";
import type { MedicalProfileData } from "@/db/repositories/types";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const SEVERITY_VARIANT: Record<string, BadgeVariant> = { MILD: "gray", MODERATE: "amber", SEVERE: "red" };
const STATUS_VARIANT: Record<string, BadgeVariant> = { ACTIVE: "amber", MANAGED: "blue", RESOLVED: "green" };

interface FormState {
  bloodGroup: string;
  heightCm: string;
  weightKg: string;
  allergies: { name: string; severity: string; reaction: string }[];
  conditions: { name: string; status: string; notes: string }[];
  currentMedications: string;
  pastSurgeries: string;
  familyHistory: string;
  notes: string;
  changeNote: string;
}

function toForm(d: MedicalProfileData): FormState {
  return {
    bloodGroup: d.bloodGroup ?? "",
    heightCm: d.heightCm == null ? "" : String(d.heightCm),
    weightKg: d.weightKg == null ? "" : String(d.weightKg),
    allergies: d.allergies.map((a) => ({ name: a.name, severity: a.severity, reaction: a.reaction ?? "" })),
    conditions: d.conditions.map((c) => ({ name: c.name, status: c.status, notes: c.notes ?? "" })),
    currentMedications: d.currentMedications ?? "",
    pastSurgeries: d.pastSurgeries ?? "",
    familyHistory: d.familyHistory ?? "",
    notes: d.notes ?? "",
    changeNote: "",
  };
}

const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function TextFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <p className="whitespace-pre-wrap text-xs text-slate-700">{value || <span className="text-slate-400">Not recorded</span>}</p>
    </div>
  );
}

/**
 * A patient's standing medical information, with an Edit dialog for people allowed to change it.
 * `version` is sent back with every save so a stale form is refused instead of silently overwriting a newer edit.
 */
export function MedicalProfileCard({
  patientId,
  data,
  version,
  canEdit,
  lastUpdated,
}: {
  patientId: string;
  data: MedicalProfileData;
  version: number;
  canEdit: boolean;
  /** Pre-formatted, e.g. "Updated 12 Nov 2026, 4:05 pm by Dr. Ananya Sharma". */
  lastUpdated?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(data));
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isEmpty =
    version === 0 ||
    (!data.bloodGroup &&
      data.heightCm == null &&
      data.weightKg == null &&
      data.allergies.length === 0 &&
      data.conditions.length === 0 &&
      !data.currentMedications &&
      !data.pastSurgeries &&
      !data.familyHistory &&
      !data.notes);

  function openDialog() {
    setForm(toForm(data));
    setError(null);
    setConflict(false);
    setOpen(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setError(null);
    setConflict(false);
    startTransition(async () => {
      const res = await saveMedicalProfileAction({
        patientId,
        expectedVersion: version,
        changeNote: form.changeNote,
        data: {
          bloodGroup: form.bloodGroup,
          heightCm: toNumberOrNull(form.heightCm),
          weightKg: toNumberOrNull(form.weightKg),
          allergies: form.allergies.map((a) => ({ name: a.name, severity: a.severity, reaction: a.reaction })),
          conditions: form.conditions.map((c) => ({ name: c.name, status: c.status, notes: c.notes })),
          currentMedications: form.currentMedications,
          pastSurgeries: form.pastSurgeries,
          familyHistory: form.familyHistory,
          notes: form.notes,
        },
      });
      if (res.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
        if ("conflict" in res && res.conflict) setConflict(true);
      }
    });
  }

  function reload() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="card-head">
        <div>
          <h2 className="flex items-center gap-2">
            <HeartPulse size={16} className="text-rose-500" /> Medical Information
          </h2>
          <p>{lastUpdated || "Allergies, existing conditions and key health details."}</p>
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={openDialog} className="gap-1 text-xs">
            <Pencil size={13} /> {isEmpty ? "Add information" : "Update"}
          </Button>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500">
          No medical information has been recorded yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TextFact label="Blood group" value={data.bloodGroup} />
            <TextFact label="Height" value={data.heightCm == null ? null : `${data.heightCm} cm`} />
            <TextFact label="Weight" value={data.weightKg == null ? null : `${data.weightKg} kg`} />
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Allergies</div>
            {data.allergies.length === 0 ? (
              <p className="text-xs text-slate-400">None recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.allergies.map((a) => (
                  <Badge key={a.name} variant={SEVERITY_VARIANT[a.severity]} title={describeAllergy(a)}>
                    {describeAllergy(a)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Existing conditions</div>
            {data.conditions.length === 0 ? (
              <p className="text-xs text-slate-400">None recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.conditions.map((c) => (
                  <Badge key={c.name} variant={STATUS_VARIANT[c.status]} title={describeCondition(c)}>
                    {describeCondition(c)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextFact label="Current medications" value={data.currentMedications} />
            <TextFact label="Past surgeries" value={data.pastSurgeries} />
            <TextFact label="Family history" value={data.familyHistory} />
            <TextFact label="Other notes" value={data.notes} />
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update medical information</DialogTitle>
            <DialogDescription>
              Every change is saved to the record&apos;s update history with your name and the time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Blood group</Label>
                <select className={SELECT_CLASS} value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Height (cm)</Label>
                <Input type="number" inputMode="numeric" min={30} max={260} value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Weight (kg)</Label>
                <Input type="number" inputMode="numeric" min={1} max={500} value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-700">Allergies</legend>
              {form.allergies.map((a, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                  <Input
                    aria-label="Allergy"
                    className="col-span-2 sm:col-span-1"
                    placeholder="e.g. Penicillin"
                    maxLength={80}
                    value={a.name}
                    onChange={(e) => set("allergies", form.allergies.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <select
                    aria-label="Severity"
                    className={SELECT_CLASS}
                    value={a.severity}
                    onChange={(e) => set("allergies", form.allergies.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)))}
                  >
                    {ALLERGY_SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Reaction"
                    placeholder="Reaction (optional)"
                    maxLength={120}
                    value={a.reaction}
                    onChange={(e) => set("allergies", form.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)))}
                  />
                  <Button type="button" variant="outline" size="sm" aria-label="Remove allergy" onClick={() => set("allergies", form.allergies.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={form.allergies.length >= 30}
                onClick={() => set("allergies", [...form.allergies, { name: "", severity: "MILD", reaction: "" }])}
              >
                <Plus size={13} /> Add allergy
              </Button>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-700">Existing conditions</legend>
              {form.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                  <Input
                    aria-label="Condition"
                    className="col-span-2 sm:col-span-1"
                    placeholder="e.g. Type 2 diabetes"
                    maxLength={80}
                    value={c.name}
                    onChange={(e) => set("conditions", form.conditions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <select
                    aria-label="Status"
                    className={SELECT_CLASS}
                    value={c.status}
                    onChange={(e) => set("conditions", form.conditions.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}
                  >
                    {CONDITION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Condition note"
                    placeholder="Note (optional)"
                    maxLength={120}
                    value={c.notes}
                    onChange={(e) => set("conditions", form.conditions.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))}
                  />
                  <Button type="button" variant="outline" size="sm" aria-label="Remove condition" onClick={() => set("conditions", form.conditions.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={form.conditions.length >= 30}
                onClick={() => set("conditions", [...form.conditions, { name: "", status: "ACTIVE", notes: "" }])}
              >
                <Plus size={13} /> Add condition
              </Button>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Current medications</Label>
                <Textarea maxLength={800} value={form.currentMedications} onChange={(e) => set("currentMedications", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Past surgeries</Label>
                <Textarea maxLength={800} value={form.pastSurgeries} onChange={(e) => set("pastSurgeries", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Family history</Label>
                <Textarea maxLength={800} value={form.familyHistory} onChange={(e) => set("familyHistory", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Other notes</Label>
                <Textarea maxLength={1000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Reason for this update (optional)</Label>
              <Input maxLength={200} value={form.changeNote} onChange={(e) => set("changeNote", e.target.value)} placeholder="e.g. New allergy found during consultation" />
            </div>

            {error && <p role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {conflict ? (
              <Button type="button" onClick={reload}>
                Reload latest
              </Button>
            ) : (
              <Button type="button" onClick={save} disabled={isPending}>
                {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Save changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
