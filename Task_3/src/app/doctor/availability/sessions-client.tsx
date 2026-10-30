"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  addDoctorLeaveAction,
  removeDoctorLeaveAction
} from "@/actions/availability";
import {
  Plus,
  Edit2,
  Trash2,
  Layers,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  CalendarOff,
  X
} from "lucide-react";
import type { AvailabilityEntity, DoctorLeaveEntity } from "@/db/repo";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
interface SessionsClientProps {
  initialSessions: AvailabilityEntity[];
  initialLeaves: DoctorLeaveEntity[];
  doctorId: string;
}

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export function SessionsClient({ initialSessions, initialLeaves, doctorId }: SessionsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<AvailabilityEntity | null>(null);

  // Form State
  const [name, setName] = useState("Morning OPD");
  const [dayOfWeek, setDayOfWeek] = useState<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">("MON");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(30);
  const [schedulingType, setSchedulingType] = useState<"STREAM" | "WAVE">("STREAM");
  const [patientsPerWave, setPatientsPerWave] = useState(3);
  const [isActive, setIsActive] = useState(true);

  // Leave Form State
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const openAddModal = (presetDay?: typeof DAYS[number]) => {
    setEditingSession(null);
    setName(presetDay ? "Morning OPD" : "OPD Session");
    setDayOfWeek(presetDay || "MON");
    setStartTime("09:00");
    setEndTime("13:00");
    setSlotDurationMinutes(30);
    setSchedulingType("STREAM");
    setPatientsPerWave(3);
    setIsActive(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (session: AvailabilityEntity) => {
    setEditingSession(session);
    setName(session.name);
    setDayOfWeek(session.dayOfWeek);
    setStartTime(session.startTime);
    setEndTime(session.endTime);
    setSlotDurationMinutes(session.slotDurationMinutes);
    setSchedulingType(session.schedulingType);
    setPatientsPerWave(session.patientsPerWave || 3);
    setIsActive(session.isActive);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    if (editingSession) {
      formData.append("sessionId", editingSession.id);
    }
    formData.append("name", name);
    formData.append("dayOfWeek", dayOfWeek);
    formData.append("startTime", startTime);
    formData.append("endTime", endTime);
    formData.append("slotDurationMinutes", slotDurationMinutes.toString());
    formData.append("schedulingType", schedulingType);
    formData.append("patientsPerWave", patientsPerWave.toString());
    formData.append("isActive", isActive ? "true" : "false");

    startTransition(async () => {
      const res = editingSession
        ? await updateSessionAction(formData)
        : await createSessionAction(formData);

      if (res.success) {
        setSuccessMessage(res.message || "Session saved!");
        setIsModalOpen(false);
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to save session.");
      }
    });
  };

  const handleDeleteSession = (session: AvailabilityEntity) => {
    if (!window.confirm(`Are you sure you want to delete session "${session.name}" on ${session.dayOfWeek}?`)) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await deleteSessionAction(session.id);
      if (res.success) {
        setSuccessMessage(`Session "${session.name}" deleted.`);
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to delete session.");
      }
    });
  };

  const handleAddLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDate) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await addDoctorLeaveAction(leaveDate, leaveReason);
      if (res.success) {
        setSuccessMessage(res.message || "Leave registered.");
        setLeaveDate("");
        setLeaveReason("");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to add leave.");
      }
    });
  };

  const handleRemoveLeave = (date: string) => {
    startTransition(async () => {
      const res = await removeDoctorLeaveAction(date);
      if (res.success) {
        setSuccessMessage(res.message || "Leave cancelled.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to remove leave.");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Alerts */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button variant="bare" onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-800">
            <X size={14} />
          </Button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
          <Button variant="bare" onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Main Sessions Card */}
      <Card className="space-y-6">
        <div className="card-head">
          <div>
            <h2>Weekly Consultation Sessions Roster</h2>
            <p>Define multiple non-overlapping OPD sessions per day (e.g. Morning & Evening shifts) with Stream or Wave scheduling.</p>
          </div>
          <Button variant="default"
            type="button"
            onClick={() => openAddModal()}
            className="text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            <span>Add OPD Session</span>
          </Button>
        </div>

        <div className="space-y-6">
          {DAYS.map((day) => {
            const daySessions = initialSessions
              .filter((s) => s.dayOfWeek === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div key={day} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 w-12">{day}</span>
                    <span className="text-xs text-slate-500">
                      {daySessions.length === 0
                        ? "No clinic sessions (Day off)"
                        : `${daySessions.length} session${daySessions.length === 1 ? "" : "s"} scheduled`}
                    </span>
                  </div>
                  <Button variant="bare"
                    type="button"
                    onClick={() => openAddModal(day)}
                    className="text-xs font-semibold text-[#0875df] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add {day} Session</span>
                  </Button>
                </div>

                {daySessions.length === 0 ? (
                  <div className="py-3 text-center text-xs text-slate-400 italic">
                    Doctor is not seeing outpatients on this day.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {daySessions.map((session) => (
                      <div
                        key={session.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          session.isActive
                            ? "bg-white border-slate-200 shadow-2xs"
                            : "bg-slate-100/70 border-slate-200 text-slate-400 opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{session.name}</span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  session.schedulingType === "WAVE"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {session.schedulingType === "WAVE"
                                  ? `Wave (${session.patientsPerWave}/wave)`
                                  : "Stream"}
                              </span>
                              {!session.isActive && (
                                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                                  Disabled
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-slate-600 mt-1 flex items-center gap-1">
                              <Clock size={12} className="text-slate-400" />
                              <span>{session.startTime} – {session.endTime}</span>
                              <span className="text-slate-400">•</span>
                              <span>{session.slotDurationMinutes}m slots</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button variant="bare"
                              type="button"
                              onClick={() => openEditModal(session)}
                              className="p-1.5 text-slate-500 hover:text-[#0875df] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Session"
                            >
                              <Edit2 size={13} />
                            </Button>
                            <Button variant="bare"
                              type="button"
                              onClick={() => handleDeleteSession(session)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Session"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Doctor Leave / Blocked Dates Section */}
      <Card className="space-y-6">
        <div className="card-head">
          <div>
            <h2>Clinical Leave & Blocked Dates</h2>
            <p>Block specific calendar dates for conferences, holidays, or emergency absences. Patients cannot book on leave dates.</p>
          </div>
          <Badge variant="amber">Outpatient Blackout</Badge>
        </div>

        <form onSubmit={handleAddLeave} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
            <CalendarOff size={15} className="text-amber-600" />
            <span>Register Clinical Leave Date</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] font-bold text-slate-600 block mb-1">Leave Date *</Label>
              <Input
                type="date"
                required
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <Label className="text-[11px] font-bold text-slate-600 block mb-1">Reason / Note (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Annual Medical Conference, Personal Leave"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div className="flex items-end">
              <Button variant="default"
                type="submit"
                disabled={isPending || !leaveDate}
                className="w-full text-xs py-2 justify-center cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Booking Leave..." : "Book Leave Date"}
              </Button>
            </div>
          </div>
        </form>

        {initialLeaves.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            No upcoming clinical leave dates booked.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {initialLeaves.map((leave) => (
              <div key={leave.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <b className="font-mono text-slate-900">{leave.leaveDate}</b>
                  {leave.reason && <span className="text-slate-500 ml-2">({leave.reason})</span>}
                </div>
                <Button variant="bare"
                  type="button"
                  onClick={() => handleRemoveLeave(leave.leaveDate)}
                  className="text-red-600 hover:underline font-semibold cursor-pointer"
                >
                  Remove Leave
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add / Edit Session Modal */}
      {isModalOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) setIsModalOpen(false); }}>
<DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-hidden rounded-2xl border-slate-200 p-0">
<DialogDescription className="sr-only">Create or edit an OPD session.</DialogDescription>
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <Layers size={17} />
                </span>
                <DialogTitle className="font-bold text-sm text-slate-900">
                  {editingSession ? "Edit OPD Session" : "Create New OPD Session"}
                </DialogTitle>
              </div>
              <Button variant="bare" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </Button>
            </div>

            <form onSubmit={handleSaveSession} className="p-6 space-y-4 text-xs">
              <div>
                <Label className="font-bold text-slate-700 block mb-1">Session Name *</Label>
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Morning OPD, Evening Clinic, Post-Op Followups"
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-bold text-slate-700 block mb-1">Day of Week *</Label>
                  <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(v as any)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-bold text-slate-700 block mb-1">Slot Length (Minutes)</Label>
                  <Select value={String(slotDurationMinutes)} onValueChange={(v) => setSlotDurationMinutes(Number(v))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="20">20 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="60">60 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="font-bold text-slate-700 block mb-1">Start Time (HH:MM) *</Label>
                  <Input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <Label className="font-bold text-slate-700 block mb-1">End Time (HH:MM) *</Label>
                  <Input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <Label className="font-bold text-slate-800 block mb-1">Scheduling Paradigm</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="bare"
                      type="button"
                      onClick={() => setSchedulingType("STREAM")}
                      className={`p-2 rounded-lg font-semibold text-center border cursor-pointer transition-all ${
                        schedulingType === "STREAM"
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      Stream (1:1)
                    </Button>
                    <Button variant="bare"
                      type="button"
                      onClick={() => setSchedulingType("WAVE")}
                      className={`p-2 rounded-lg font-semibold text-center border cursor-pointer transition-all ${
                        schedulingType === "WAVE"
                          ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      Wave Scheduling
                    </Button>
                  </div>
                </div>

                {schedulingType === "WAVE" && (
                  <div className="pt-2 border-t border-slate-200">
                    <Label className="font-bold text-purple-900 block mb-1">
                      Patients per Wave Start *
                    </Label>
                    <Input
                      type="number"
                      min={2}
                      max={10}
                      value={patientsPerWave}
                      onChange={(e) => setPatientsPerWave(Number(e.target.value))}
                      className="w-full p-2 border border-purple-200 rounded-lg bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Enables batch arrivals (e.g. 3 patients arrive simultaneously at slot start, seen consecutively).
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActiveCheck"
                  checked={isActive}
                  onCheckedChange={(v) => setIsActive(v === true)}
                />
                <Label htmlFor="isActiveCheck" className="text-slate-700 font-medium">
                  Active (Patients can book appointments during this session)
                </Label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <Button variant="outline"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2"
                >
                  Cancel
                </Button>
                <Button variant="default"
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 font-bold cursor-pointer flex items-center gap-1.5"
                >
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  <span>{isPending ? "Saving..." : editingSession ? "Update Session" : "Create Session"}</span>
                </Button>
              </div>
            </form>
          </DialogContent>
</Dialog>
      )}
    </div>
  );
}
