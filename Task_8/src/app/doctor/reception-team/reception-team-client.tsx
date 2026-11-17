"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, Link2, Trash2, KeyRound, ShieldCheck } from "lucide-react";
import {
  createReceptionistAction,
  assignReceptionistAction,
  revokeReceptionistAction,
  resetReceptionistPasswordAction,
} from "@/actions/reception-team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  canResetPassword: boolean;
}

type Notice = { kind: "success" | "error"; text: string } | null;

export function ReceptionTeamClient({ team }: { team: TeamMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const report = (res: { success: boolean; message?: string; error?: string }) => {
    setNotice(
      res.success
        ? { kind: "success", text: res.message || "Done." }
        : { kind: "error", text: res.error || "Something went wrong." }
    );
    if (res.success) router.refresh();
    return res.success;
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setNotice(null);
    startTransition(async () => {
      if (report(await createReceptionistAction(formData))) form.reset();
    });
  };

  const handleAssign = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      if (report(await assignReceptionistAction(assignEmail))) setAssignEmail("");
    });
  };

  const handleRevoke = (member: TeamMember) => {
    if (
      !window.confirm(
        `Remove ${member.firstName} ${member.lastName} from your queue? They lose access to your patients immediately.`
      )
    ) {
      return;
    }
    setNotice(null);
    startTransition(async () => {
      report(await revokeReceptionistAction(member.id));
    });
  };

  const handleReset = (member: TeamMember) => {
    setNotice(null);
    startTransition(async () => {
      if (report(await resetReceptionistPasswordAction(member.id, newPassword))) {
        setResetFor(null);
        setNewPassword("");
      }
    });
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`px-4 py-2.5 rounded-lg text-sm border ${
            notice.kind === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Current team */}
      <Card className="p-0 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Your receptionists ({team.length})</h2>
            <p className="text-xs text-slate-500">
              {team.length > 0
                ? "They check patients in and mark them unavailable. Check-in controls are hidden from you while you have at least one."
                : "None yet. Until you add one, you can check patients in yourself."}
            </p>
          </div>
        </div>

        {team.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">No receptionist is assigned to your queue.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {team.map((member) => (
              <li key={member.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {member.firstName} {member.lastName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {member.email} · {member.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.canResetPassword && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setResetFor(resetFor === member.id ? null : member.id);
                          setNewPassword("");
                          setNotice(null);
                        }}
                        className="text-xs inline-flex items-center gap-1"
                      >
                        <KeyRound size={13} />
                        <span>Reset password</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRevoke(member)}
                      className="text-xs inline-flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </Button>
                  </div>
                </div>

                {resetFor === member.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="New password (8+ characters)"
                      aria-label={`New password for ${member.firstName}`}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      size="sm"
                      type="button"
                      disabled={isPending || newPassword.length < 8}
                      onClick={() => handleReset(member)}
                      className="text-xs inline-flex items-center gap-1"
                    >
                      {isPending && <Loader2 size={13} className="animate-spin" />}
                      <span>Save password</span>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create */}
        <Card className="p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <UserPlus size={16} className="text-blue-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create a receptionist account</h2>
              <p className="text-xs text-slate-500">
                They sign in with the Receptionist button on the login page. Share the starting password securely.
              </p>
            </div>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input name="firstName" required placeholder="First name" aria-label="First name" autoComplete="off" />
              <Input name="lastName" required placeholder="Last name" aria-label="Last name" autoComplete="off" />
            </div>
            <Input name="email" type="email" required placeholder="Email (their login)" aria-label="Email" autoComplete="off" />
            <Input name="phone" type="tel" required placeholder="Phone" aria-label="Phone" autoComplete="off" />
            <Input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Starting password (8+ characters)"
              aria-label="Starting password"
              autoComplete="new-password"
            />
            <Button type="submit" disabled={isPending} className="text-xs inline-flex items-center gap-1.5">
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              <span>Create and assign</span>
            </Button>
          </form>
        </Card>

        {/* Assign existing */}
        <Card className="p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-blue-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Assign an existing receptionist</h2>
              <p className="text-xs text-slate-500">
                A receptionist can work for several doctors. Enter the email they already sign in with.
              </p>
            </div>
          </div>
          <form onSubmit={handleAssign} className="space-y-3">
            <Input
              type="email"
              required
              placeholder="Receptionist email"
              aria-label="Receptionist email"
              autoComplete="off"
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={isPending} className="text-xs inline-flex items-center gap-1.5">
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              <span>Assign to my queue</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
