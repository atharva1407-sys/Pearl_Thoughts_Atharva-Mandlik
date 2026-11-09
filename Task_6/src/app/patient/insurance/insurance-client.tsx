"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import {
  addPolicyAction,
  refreshClaimAction,
  refreshPreauthAction,
  requestPreauthAction,
  submitClaimAction,
  verifyPolicyAction,
} from "@/actions/insurance";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface InsuranceView {
  simulated: boolean;
  policies: {
    id: string;
    insurerName: string;
    policyNumber: string;
    status: "PENDING_VERIFICATION" | "ACTIVE" | "INACTIVE";
    sumInsured: string;
    copayPercent: number;
  }[];
  upcoming: {
    appointmentId: string;
    doctor: string;
    when: string;
    fee: string;
    preauth: { status: string; approved: string | null; note: string | null; reference: string | null } | null;
  }[];
  completed: {
    appointmentId: string;
    doctor: string;
    when: string;
    fee: string;
    claim: { status: string; settled: string | null; note: string | null; reference: string | null } | null;
  }[];
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  ACTIVE: "green",
  APPROVED: "green",
  SETTLED: "green",
  INACTIVE: "red",
  REJECTED: "red",
  CANCELLED: "gray",
  QUERY: "amber",
  IN_REVIEW: "amber",
  SUBMITTED: "blue",
  REQUESTED: "blue",
  PENDING_VERIFICATION: "amber",
};
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function InsuranceClient({ view }: { view: InsuranceView }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const activePolicies = view.policies.filter((p) => p.status === "ACTIVE");
  const [policyChoice, setPolicyChoice] = useState<string>(activePolicies[0]?.id ?? "");
  const chosenPolicy = activePolicies.find((p) => p.id === policyChoice)?.id ?? activePolicies[0]?.id ?? "";

  function run(task: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const res = await task();
      setMessage(
        res.success
          ? { ok: true, text: res.message ?? "Done." }
          : { ok: false, text: ("error" in res && res.error) || "Something went wrong." }
      );
    });
  }

  return (
    <div className="space-y-5">
      {view.simulated && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <FlaskConical size={15} className="mt-0.5 shrink-0" />
          <div>
            <b>Demo insurer.</b> Results are simulated; no real insurer is contacted. Try policy numbers: ending in
            <code className="mx-1">0</code>= inactive, <code className="mx-1">QRY…</code>= insurer query,
            <code className="mx-1">LOW…</code>= tiny cover (pre-auth rejected), <code className="mx-1">REJ…</code>= claims rejected.
          </div>
        </div>
      )}

      {message && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-xs font-semibold ${
            message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your policies</CardTitle>
        </CardHeader>
        {view.policies.length === 0 ? (
          <p className="mb-3 text-sm text-slate-500">No policy on file yet. Add one below.</p>
        ) : (
          <ul className="mb-4 divide-y divide-slate-100">
            {view.policies.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {p.insurerName} <span className="font-mono text-xs font-normal text-slate-500">{p.policyNumber}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Sum insured {p.sumInsured} · co-pay {p.copayPercent}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[p.status]}>{label(p.status)}</Badge>
                  <Button size="sm" disabled={isPending} onClick={() => run(() => verifyPolicyAction(p.id))}>
                    <RefreshCw size={12} /> Re-verify
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            run(async () => {
              const res = await addPolicyAction(data);
              if (res.success) form.reset();
              return res;
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="insurerName">Insurer</Label>
            <Input id="insurerName" name="insurerName" placeholder="e.g. Star Health" required maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policyNumber">Policy number</Label>
            <Input id="policyNumber" name="policyNumber" placeholder="e.g. POL-12345" required maxLength={24} />
          </div>
          <Button type="submit" variant="default" disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add &amp; verify
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming visits · cashless pre-authorisation</CardTitle>
          {activePolicies.length > 1 && (
            <div className="w-56">
              <Select value={chosenPolicy} onValueChange={setPolicyChoice}>
                <SelectTrigger className="h-9 text-xs" aria-label="Policy to use">
                  <SelectValue placeholder="Choose policy" />
                </SelectTrigger>
                <SelectContent>
                  {activePolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.insurerName} {p.policyNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        {view.upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming paid visits.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {view.upcoming.map((a) => (
              <li key={a.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">{a.doctor}</div>
                  <div className="text-xs text-slate-500">
                    {a.when} · fee {a.fee}
                  </div>
                  {a.preauth?.approved && (
                    <div className="text-xs font-semibold text-emerald-700">Insurer covers {a.preauth.approved}</div>
                  )}
                  {a.preauth?.note && <div className="text-xs text-slate-500">{a.preauth.note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {a.preauth && <Badge variant={STATUS_BADGE[a.preauth.status]}>{label(a.preauth.status)}</Badge>}
                  {(!a.preauth || ["REJECTED", "CANCELLED"].includes(a.preauth.status)) && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isPending || !chosenPolicy}
                      onClick={() => run(() => requestPreauthAction({ appointmentId: a.appointmentId, policyId: chosenPolicy }))}
                    >
                      <ShieldCheck size={13} /> Request cashless
                    </Button>
                  )}
                  {a.preauth && ["SUBMITTED", "QUERY"].includes(a.preauth.status) && (
                    <Button size="sm" disabled={isPending} onClick={() => run(() => refreshPreauthAction(a.appointmentId))}>
                      <RefreshCw size={12} /> Check status
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {activePolicies.length === 0 && view.upcoming.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">Add and verify an active policy to request cashless approval.</p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed visits · claims</CardTitle>
        </CardHeader>
        {view.completed.length === 0 ? (
          <p className="text-sm text-slate-500">No completed paid visits yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {view.completed.map((a) => (
              <li key={a.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">{a.doctor}</div>
                  <div className="text-xs text-slate-500">
                    {a.when} · fee {a.fee}
                  </div>
                  {a.claim?.settled && <div className="text-xs font-semibold text-emerald-700">Settled {a.claim.settled}</div>}
                  {a.claim?.note && <div className="text-xs text-slate-500">{a.claim.note}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {a.claim && <Badge variant={STATUS_BADGE[a.claim.status]}>{label(a.claim.status)}</Badge>}
                  {!a.claim && (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isPending || !chosenPolicy}
                      onClick={() => run(() => submitClaimAction({ appointmentId: a.appointmentId, policyId: chosenPolicy }))}
                    >
                      File claim
                    </Button>
                  )}
                  {a.claim && ["SUBMITTED", "IN_REVIEW"].includes(a.claim.status) && (
                    <Button size="sm" disabled={isPending} onClick={() => run(() => refreshClaimAction(a.appointmentId))}>
                      <RefreshCw size={12} /> Check status
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
