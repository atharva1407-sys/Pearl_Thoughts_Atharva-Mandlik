"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { describeSchedule, recurrenceOf, type DayCode, type SessionRecurrence } from "@/lib/session-schedule";
import { istDateString } from "@/lib/time";
import { analyzeSessionChange, effectiveSlotLength, type BookingResolution, type SessionChangeImpact } from "@/lib/elastic-schedule";
import { useDoctorSchedule, minutesBetween } from "@/hooks/use-doctor-schedule";

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
const SLOT_LENGTHS = [10, 15, 20, 30, 45, 60, 90, 120];

const RECURRENCE_OPTIONS: Array<{ value: SessionRecurrence; label: string }> = [
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY_DATE", label: "Date of month" },
  { value: "ONE_TIME", label: "One date only" },
];

function SessionCard({
  session,
  today,
  onEdit,
  onDelete,
}: {
  session: AvailabilityEntity;
  today: string;
  onEdit: (session: AvailabilityEntity) => void;
  onDelete: (session: AvailabilityEntity) => void;
}) {
  const kind = recurrenceOf(session);
  const isPast =
    (kind === "ONE_TIME" && Boolean(session.specificDate) && (session.specificDate as string) < today) ||
    (kind !== "ONE_TIME" && Boolean(session.validUntil) && (session.validUntil as string) < today);
  const muted = !session.isActive || isPast;
  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        muted ? "bg-slate-100/70 border-slate-200 text-slate-400 opacity-70" : "bg-white border-slate-200 shadow-2xs"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-xs text-slate-900">{session.name}</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                session.schedulingType === "WAVE" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
              }`}
            >
              {session.schedulingType === "WAVE" ? "Wave" : "Stream"} · {session.patientsPerWave}/slot
            </span>
            {!session.isActive && (
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Disabled</span>
            )}
            {isPast && <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Ended</span>}
          </div>
          <div className="text-xs text-slate-600 mt-1">{describeSchedule(session)}</div>
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
            onClick={() => onEdit(session)}
            className="p-1.5 text-slate-500 hover:text-[#0875df] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            title="Edit Session"
          >
            <Edit2 size={13} />
          </Button>
          <Button variant="bare"
            type="button"
            onClick={() => onDelete(session)}
            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            title="Delete Session"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SessionsClient({ initialSessions, initialLeaves, doctorId }: SessionsClientProps) {
  const {
    isPending,
    today,
    isModalOpen,
    setIsModalOpen,
    editingSession,
    weeklySessions,
    name,
    setName,
    recurrence,
    setRecurrence,
    dayOfWeek,
    setDayOfWeek,
    dayOfMonth,
    setDayOfMonth,
    specificDate,
    setSpecificDate,
    extraDates,
    setExtraDates,
    pendingExtraDate,
    setPendingExtraDate,
    validFrom,
    setValidFrom,
    validUntil,
    setValidUntil,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    slotDurationMinutes,
    setSlotDurationMinutes,
    wholeSession,
    setWholeSession,
    schedulingType,
    patientsPerSlot,
    setPatientsPerSlot,
    isActive,
    setIsActive,
    pendingResolution,
    setPendingResolution,
    resolution,
    setResolution,
    errorMessage,
    setErrorMessage,
    successMessage,
    setSuccessMessage,
    leaveDate,
    setLeaveDate,
    leaveReason,
    setLeaveReason,
    handleOpenAddModal,
    handleOpenEditModal,
    chooseSchedulingType,
    savedSlotLength,
    keepsSlotOnExtend,
    slotPreview,
    handleSaveSession,
    submitSession,
    handleDeleteSession,
    handleAddLeave,
    handleRemoveLeave,
  } = useDoctorSchedule(initialSessions, initialLeaves, doctorId);

  const monthlySessions = initialSessions
    .filter((s) => recurrenceOf(s) === "MONTHLY_DATE")
    .sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0) || a.startTime.localeCompare(b.startTime));
  const oneTimeSessions = initialSessions
    .filter((s) => recurrenceOf(s) === "ONE_TIME")
    .sort((a, b) => (a.specificDate ?? "").localeCompare(b.specificDate ?? "") || a.startTime.localeCompare(b.startTime));

  const openAddModal = (preset?: { day?: DayCode; recurrence?: SessionRecurrence }) => {
    handleOpenAddModal(preset?.recurrence);
    if (preset?.day) setDayOfWeek(preset.day);
  };
  const openEditModal = handleOpenEditModal;

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
            <h2>OPD Sessions Roster</h2>
            <p>
              Create sessions that repeat every week, on a day of every month, or run on one date only. Each session is
              Stream or Wave and has its own slot length and patients per slot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline"
              type="button"
              onClick={() => openAddModal({ recurrence: "ONE_TIME" })}
              className="text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar size={14} />
              <span>Add One-Date Session</span>
            </Button>
            <Button variant="default"
              type="button"
              onClick={() => openAddModal()}
              className="text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>Add OPD Session</span>
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {DAYS.map((day) => {
            const daySessions = weeklySessions
              .filter((s) => s.dayOfWeek === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            return (
              <div key={day} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 w-12">{day}</span>
                    <span className="text-xs text-slate-500">
                      {daySessions.length === 0
                        ? "No weekly sessions (Day off)"
                        : `${daySessions.length} weekly session${daySessions.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  <Button variant="bare"
                    type="button"
                    onClick={() => openAddModal({ day })}
                    className="text-xs font-semibold text-[#0875df] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Add {day} Session</span>
                  </Button>
                </div>

                {daySessions.length === 0 ? (
                  <div className="py-3 text-center text-xs text-slate-400 italic">
                    No repeating weekly session on this day.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {daySessions.map((session) => (
                      <SessionCard key={session.id} session={session} today={today} onEdit={openEditModal} onDelete={handleDeleteSession} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">Monthly dates</span>
                <span className="text-xs text-slate-500">
                  {monthlySessions.length === 0
                    ? "None"
                    : `${monthlySessions.length} session${monthlySessions.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <Button variant="bare"
                type="button"
                onClick={() => openAddModal({ recurrence: "MONTHLY_DATE" })}
                className="text-xs font-semibold text-[#0875df] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Monthly Session</span>
              </Button>
            </div>
            {monthlySessions.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-400 italic">
                Sessions that repeat on a date of the month, such as the 1st or the 15th.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {monthlySessions.map((session) => (
                  <SessionCard key={session.id} session={session} today={today} onEdit={openEditModal} onDelete={handleDeleteSession} />
                ))}
              </div>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">One-date sessions</span>
                <span className="text-xs text-slate-500">
                  {oneTimeSessions.length === 0
                    ? "None"
                    : `${oneTimeSessions.length} session${oneTimeSessions.length === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
            {oneTimeSessions.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-400 italic">
                Extra clinics for a single date, such as a Sunday camp. They never repeat.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {oneTimeSessions.map((session) => (
                  <SessionCard key={session.id} session={session} today={today} onEdit={openEditModal} onDelete={handleDeleteSession} />
                ))}
              </div>
            )}
          </div>
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
<DialogContent showCloseButton={false} className="max-w-md gap-0 overflow-y-auto rounded-2xl border-slate-200 p-0">
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

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <Label className="font-bold text-slate-800 block mb-1">When does it run?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <Button variant="bare"
                        key={opt.value}
                        type="button"
                        onClick={() => setRecurrence(opt.value)}
                        className={`p-2 rounded-lg font-semibold text-center border cursor-pointer transition-all ${
                          recurrence === opt.value
                            ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {recurrence === "WEEKLY" && (
                  <div>
                    <Label className="font-bold text-slate-700 block mb-1">Day of Week *</Label>
                    <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(v as DayCode)}>
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
                )}

                {recurrence === "MONTHLY_DATE" && (
                  <div>
                    <Label className="font-bold text-slate-700 block mb-1">Date of the Month (1-31) *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      required
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                      className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Runs on this date every month. Months that do not have the date (for example the 31st in June) are skipped.
                    </p>
                  </div>
                )}

                {recurrence === "ONE_TIME" && (
                  <div>
                    <Label className="font-bold text-slate-700 block mb-1">Date *</Label>
                    <Input
                      type="date"
                      required
                      min={today}
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Runs on this date only and never repeats. Patients can book up to 30 days ahead.
                    </p>
                    {!editingSession && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                        <Label className="font-bold text-slate-700 block">Same session on more dates (optional)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            min={today}
                            value={pendingExtraDate}
                            onChange={(e) => setPendingExtraDate(e.target.value)}
                            className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                          />
                          <Button variant="outline"
                            type="button"
                            disabled={!pendingExtraDate || pendingExtraDate === specificDate || extraDates.includes(pendingExtraDate)}
                            onClick={() => {
                              setExtraDates((prev) => [...prev, pendingExtraDate].sort());
                              setPendingExtraDate("");
                            }}
                            className="shrink-0 cursor-pointer"
                          >
                            Add date
                          </Button>
                        </div>
                        {extraDates.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {extraDates.map((d) => (
                              <span key={d} className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-100 rounded-full px-2 py-0.5 text-[11px] font-mono">
                                {d}
                                <Button variant="bare"
                                  type="button"
                                  aria-label={`Remove ${d}`}
                                  onClick={() => setExtraDates((prev) => prev.filter((x) => x !== d))}
                                  className="text-blue-500 hover:text-blue-900 cursor-pointer"
                                >
                                  <X size={11} />
                                </Button>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-500">Each date becomes its own one-date session. If any date clashes, none are created.</p>
                      </div>
                    )}
                  </div>
                )}

                {recurrence !== "ONE_TIME" && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <Label className="font-bold text-slate-700 block mb-1">Runs from (optional)</Label>
                      <Input
                        type="date"
                        value={validFrom}
                        onChange={(e) => setValidFrom(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <Label className="font-bold text-slate-700 block mb-1">Runs until (optional)</Label>
                      <Input
                        type="date"
                        min={validFrom || undefined}
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                      />
                    </div>
                    <p className="col-span-2 text-[10px] text-slate-500 -mt-1">
                      Leave both empty to repeat with no end. Set them to limit it, for example 1 Dec to 31 Dec.
                    </p>
                  </div>
                )}
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

              <div>
                <Label className="font-bold text-slate-700 block mb-1">Slot Length (Minutes)</Label>
                <Select disabled={wholeSession} value={String(slotDurationMinutes)} onValueChange={(v) => setSlotDurationMinutes(Number(v))}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLOT_LENGTHS.map((m) => (
                      <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-start gap-2 mt-2">
                  <Checkbox
                    id="wholeSessionCheck"
                    checked={wholeSession}
                    onCheckedChange={(v) => setWholeSession(v === true)}
                  />
                  <Label htmlFor="wholeSessionCheck" className="text-slate-700 font-medium leading-snug">
                    One slot for the whole session
                    <span className="block text-[10px] font-normal text-slate-500">
                      For example 10:00 to 12:00 with 20 patients per slot: patients book the session and are seen in token order.
                    </span>
                  </Label>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <Label className="font-bold text-slate-800 block mb-1">Scheduling Paradigm</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="bare"
                      type="button"
                      onClick={() => chooseSchedulingType("STREAM")}
                      className={`p-2 rounded-lg font-semibold text-center border cursor-pointer transition-all ${
                        schedulingType === "STREAM"
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      Stream
                    </Button>
                    <Button variant="bare"
                      type="button"
                      onClick={() => chooseSchedulingType("WAVE")}
                      className={`p-2 rounded-lg font-semibold text-center border cursor-pointer transition-all ${
                        schedulingType === "WAVE"
                          ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      Wave
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <Label className={`font-bold block mb-1 ${schedulingType === "WAVE" ? "text-purple-900" : "text-blue-900"}`}>
                    Patients per Slot (capacity) *
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={patientsPerSlot}
                    onChange={(e) => setPatientsPerSlot(Number(e.target.value))}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {schedulingType === "WAVE"
                      ? "Wave: several patients arrive together at the start of each slot (for example 3 per slot)."
                      : "Stream: patients are seen one after another through the session. Use 1 for strictly one patient per slot, or raise it to accept more bookings in each slot."}
                  </p>
                </div>
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

              {editingSession && slotPreview && slotPreview.change !== "NONE" && (
                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 space-y-1" data-testid="elastic-preview">
                  <div className="font-bold">
                    {slotPreview.change === "EXPANDED"
                      ? "Extending this session"
                      : slotPreview.change === "SHRUNK"
                        ? "Shortening this session"
                        : "Changing this session"}
                    {": "}
                    {editingSession.startTime}–{editingSession.endTime} → {startTime}–{endTime}
                  </div>
                  <div>{slotPreview.summary}</div>
                  {keepsSlotOnExtend && (
                    <div className="text-[10px] text-blue-700">
                      The current slot length ({savedSlotLength} minutes) is kept, so people already booked stay in their
                      slot and the extra time becomes new slots. Extend by a full slot to add seats.
                    </div>
                  )}
                  <div className="text-[10px] text-blue-700">
                    Booked appointments stay as they are. If the change affects any, you choose what happens to them
                    before anything is saved.
                  </div>
                </div>
              )}

              {pendingResolution && (
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 space-y-3" role="alert" data-testid="elastic-confirm">
                  <div className="font-bold">
                    {pendingResolution.affectedBookings.length} booked{" "}
                    {pendingResolution.affectedBookings.length === 1 ? "appointment is" : "appointments are"} affected by the new hours
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5" data-testid="elastic-affected">
                    {pendingResolution.affectedBookings.slice(0, 5).map((b) => (
                      <li key={b.id}>
                        {b.appointmentDate} at {b.startTime}
                        {b.patientName ? ` · ${b.patientName}` : ""}
                      </li>
                    ))}
                    {pendingResolution.affectedBookings.length > 5 && (
                      <li>and {pendingResolution.affectedBookings.length - 5} more</li>
                    )}
                  </ul>
                  <fieldset className="space-y-1.5" data-testid="elastic-options">
                    <legend className="font-bold mb-1">What should happen to them?</legend>
                    {(
                      [
                        {
                          value: "MOVE" as const,
                          title: "Move to the nearest free slot (recommended)",
                          text: !pendingResolution.relocationPreview
                            ? "Same day first, then the next days. Patients get an email. Anyone who cannot be placed stays booked as before."
                            : pendingResolution.relocationPreview.movable === 0
                              ? "Every other slot is full, so none of them can be moved. They would stay booked as before."
                              : pendingResolution.relocationPreview.stuck === 0
                                ? `All ${pendingResolution.relocationPreview.movable} can be moved (same day first, then the next days). Patients get an email.`
                                : `${pendingResolution.relocationPreview.movable} can be moved (patients get an email). ${pendingResolution.relocationPreview.stuck} have no free slot and would stay booked as before.`,
                        },
                        {
                          value: "CANCEL" as const,
                          title: "Cancel and refund",
                          text: "Patients are cancelled by you, any payment is refunded in full, and they are emailed.",
                        },
                        {
                          value: "KEEP" as const,
                          title: "Keep as booked",
                          text: "They keep their original time, outside the new hours. New patients can only book the new slots.",
                        },
                      ]
                    ).map((o) => (
                      <label
                        key={o.value}
                        className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${
                          resolution === o.value ? "border-amber-500 bg-white" : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="bookingResolution"
                          value={o.value}
                          checked={resolution === o.value}
                          onChange={() => setResolution(o.value)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block font-semibold">{o.title}</span>
                          <span className="block text-[10px] font-normal">{o.text}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <Button
                    variant="default"
                    type="button"
                    disabled={isPending}
                    onClick={() => submitSession(resolution)}
                    className={`px-4 py-2 font-bold cursor-pointer ${resolution === "CANCEL" ? "bg-red-600 hover:bg-red-700" : ""}`}
                  >
                    {resolution === "MOVE"
                      ? pendingResolution.relocationPreview?.movable === 0
                        ? "Apply the change (they stay booked)"
                        : "Move them and apply the change"
                      : resolution === "CANCEL"
                        ? `Cancel ${pendingResolution.affectedBookings.length} and apply the change`
                        : "Keep them and apply the change"}
                  </Button>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-start gap-2" role="alert" data-testid="session-modal-error">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

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
