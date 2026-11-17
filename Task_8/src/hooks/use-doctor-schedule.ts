"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSessionAction,
  updateSessionAction,
  deleteSessionAction,
  addDoctorLeaveAction,
  removeDoctorLeaveAction,
} from "@/actions/availability";
import type { AvailabilityEntity, DoctorLeaveEntity } from "@/db/repo";
import { describeSchedule, recurrenceOf, type DayCode, type SessionRecurrence } from "@/lib/session-schedule";
import { istDateString } from "@/lib/time";
import {
  analyzeSessionChange,
  effectiveSlotLength,
  type BookingResolution,
  type SessionChangeImpact,
} from "@/lib/elastic-schedule";

export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function useDoctorSchedule(initialSessions: AvailabilityEntity[], initialLeaves: DoctorLeaveEntity[], doctorId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"weekly" | "specific" | "leaves">("weekly");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<AvailabilityEntity | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState<SessionRecurrence>("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = useState<DayCode>("MON");
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [specificDate, setSpecificDate] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [pendingExtraDate, setPendingExtraDate] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slotDurationMinutes, setSlotDurationMinutes] = useState(15);
  const [wholeSession, setWholeSession] = useState(false);
  const [schedulingType, setSchedulingType] = useState<"STREAM" | "WAVE">("STREAM");
  const [patientsPerSlot, setPatientsPerSlot] = useState(1);
  const [isActive, setIsActive] = useState(true);

  // Resolution State
  const [pendingResolution, setPendingResolution] = useState<SessionChangeImpact | null>(null);
  const [resolution, setResolution] = useState<BookingResolution>("MOVE");

  // Feedback State
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Leave Form
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const today = istDateString(new Date());

  const resetForm = () => {
    setEditingSession(null);
    setName("");
    setRecurrence("WEEKLY");
    setDayOfWeek("MON");
    setDayOfMonth(1);
    setSpecificDate("");
    setExtraDates([]);
    setPendingExtraDate("");
    setValidFrom("");
    setValidUntil("");
    setStartTime("09:00");
    setEndTime("13:00");
    setSlotDurationMinutes(15);
    setWholeSession(false);
    setSchedulingType("STREAM");
    setPatientsPerSlot(1);
    setIsActive(true);
    setErrorMessage(null);
    setPendingResolution(null);
    setResolution("MOVE");
  };

  const handleOpenAddModal = (defaultRecurrence?: SessionRecurrence) => {
    resetForm();
    if (defaultRecurrence) {
      setRecurrence(defaultRecurrence);
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (session: AvailabilityEntity) => {
    setEditingSession(session);
    setName(session.name);
    const rec = recurrenceOf(session);
    setRecurrence(rec);
    setDayOfWeek(session.dayOfWeek ?? "MON");
    setDayOfMonth(session.dayOfMonth ?? 1);
    setSpecificDate(session.specificDate ?? "");
    setExtraDates([]);
    setPendingExtraDate("");
    setWholeSession(session.slotDurationMinutes > 60 && session.slotDurationMinutes === minutesBetween(session.startTime, session.endTime));
    setValidFrom(session.validFrom ?? "");
    setValidUntil(session.validUntil ?? "");
    setStartTime(session.startTime);
    setEndTime(session.endTime);
    setSlotDurationMinutes(session.slotDurationMinutes);
    setSchedulingType(session.schedulingType);
    setPatientsPerSlot(session.patientsPerWave || 1);
    setIsActive(session.isActive);
    setErrorMessage(null);
    setPendingResolution(null);
    setResolution("MOVE");
    setIsModalOpen(true);
  };

  const chooseSchedulingType = (next: "STREAM" | "WAVE") => {
    if (next === schedulingType) return;
    if (patientsPerSlot === (schedulingType === "STREAM" ? 1 : 3)) setPatientsPerSlot(next === "STREAM" ? 1 : 3);
    setSchedulingType(next);
  };

  const savedSlotLength = effectiveSlotLength({
    editing: editingSession
      ? { startTime: editingSession.startTime, endTime: editingSession.endTime, slotDurationMinutes: editingSession.slotDurationMinutes }
      : null,
    startTime,
    endTime,
    slotLength: slotDurationMinutes,
    wholeSession,
  });
  const keepsSlotOnExtend = wholeSession && savedSlotLength !== minutesBetween(startTime, endTime);

  const slotPreview = useMemo(() => {
    if (!editingSession) return null;
    if (!(minutesBetween(startTime, endTime) > 0) || savedSlotLength < 1) return null;
    return analyzeSessionChange(
      {
        startTime: editingSession.startTime,
        endTime: editingSession.endTime,
        slotDurationMinutes: editingSession.slotDurationMinutes,
      },
      { startTime, endTime, slotDurationMinutes: savedSlotLength },
      []
    );
  }, [editingSession, startTime, endTime, savedSlotLength]);

  useEffect(() => {
    setPendingResolution(null);
  }, [startTime, endTime, slotDurationMinutes, wholeSession, recurrence, dayOfWeek, dayOfMonth, specificDate, validFrom, validUntil, isActive]);

  const submitSession = (chosenResolution: BookingResolution | null) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    if (editingSession) {
      formData.append("sessionId", editingSession.id);
    }
    const windowMinutes = minutesBetween(startTime, endTime);
    if (wholeSession && (windowMinutes < 10 || windowMinutes > 600)) {
      setErrorMessage("For one slot over the whole session, the session must be between 10 minutes and 10 hours long.");
      return;
    }
    formData.append("name", name);
    formData.append("recurrence", recurrence);
    if (recurrence === "WEEKLY") formData.append("dayOfWeek", dayOfWeek);
    if (recurrence === "MONTHLY_DATE") formData.append("dayOfMonth", String(dayOfMonth));
    if (recurrence === "ONE_TIME") {
      formData.append("specificDate", specificDate);
      if (!editingSession) extraDates.forEach((d) => formData.append("specificDate", d));
    }
    if (recurrence !== "ONE_TIME") {
      formData.append("validFrom", validFrom);
      formData.append("validUntil", validUntil);
    }
    formData.append("startTime", startTime);
    formData.append("endTime", endTime);
    formData.append("slotDurationMinutes", String(savedSlotLength));
    formData.append("schedulingType", schedulingType);
    formData.append("patientsPerWave", patientsPerSlot.toString());
    formData.append("isActive", isActive ? "true" : "false");
    if (chosenResolution) formData.append("bookingResolution", chosenResolution);

    startTransition(async () => {
      const res: { success: boolean; message?: string; error?: string; needsResolution?: boolean; impact?: SessionChangeImpact } =
        editingSession ? await updateSessionAction(formData) : await createSessionAction(formData);

      if (res.success) {
        setSuccessMessage(res.message || "Session saved!");
        setPendingResolution(null);
        setIsModalOpen(false);
        router.refresh();
      } else if (res.needsResolution && res.impact) {
        setPendingResolution(res.impact);
      } else {
        setErrorMessage(res.error || "Failed to save session.");
      }
    });
  };

  const handleSaveSession = (e: React.FormEvent) => {
    e.preventDefault();
    submitSession(null);
  };

  const handleDeleteSession = (session: AvailabilityEntity) => {
    if (!window.confirm(`Are you sure you want to delete session "${session.name}" (${describeSchedule(session)})?`)) {
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
    if (!window.confirm(`Cancel leave for ${date}?`)) return;
    setErrorMessage(null);

    startTransition(async () => {
      const res = await removeDoctorLeaveAction(date);
      if (res.success) {
        setSuccessMessage(res.message || "Leave cancelled.");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Failed to cancel leave.");
      }
    });
  };

  const weeklySessions = initialSessions.filter((s) => recurrenceOf(s) === "WEEKLY");
  const specificSessions = initialSessions.filter((s) => recurrenceOf(s) !== "WEEKLY");

  return {
    isPending,
    today,
    activeTab,
    setActiveTab,
    isModalOpen,
    setIsModalOpen,
    editingSession,
    weeklySessions,
    specificSessions,
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
  };
}
