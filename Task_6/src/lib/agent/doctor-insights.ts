import type { AvailabilityEntity } from "@/db/repo";
import { appointmentOccupiesSeat } from "../seat-occupancy";
import { sessionAppliesOnDate, sessionCapacity } from "../session-schedule";

/**
 * Pure calculations behind the doctor assistant: appointment statistics and scheduling-conflict
 * detection. No database or framework imports, so they are easy to test and cannot leak data.
 */

export interface InsightAppointment {
  id: string;
  patientName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  holdExpiresAt?: Date | string | null;
}

export interface AppointmentStats {
  total: number;
  booked: number;
  completed: number;
  cancelled: number;
  noShow: number;
  pendingPayment: number;
  expired: number;
  /** Completed visits as a share of visits that were due (completed + no-show + booked), 0 to 100. */
  completionRate: number | null;
}

export function summarizeStatuses(appointments: { status: string }[]): AppointmentStats {
  const count = (s: string) => appointments.filter((a) => a.status === s).length;
  const completed = count("COMPLETED");
  const noShow = count("NO_SHOW");
  const booked = count("BOOKED");
  const due = completed + noShow + booked;
  return {
    total: appointments.length,
    booked,
    completed,
    cancelled: count("CANCELLED"),
    noShow,
    pendingPayment: count("PENDING_PAYMENT"),
    expired: count("EXPIRED"),
    completionRate: due > 0 ? Math.round((completed / due) * 100) : null,
  };
}

export type ConflictKind = "OVERLAP" | "OVER_CAPACITY" | "ON_LEAVE" | "OUTSIDE_HOURS";

export interface ScheduleConflict {
  kind: ConflictKind;
  date: string;
  description: string;
  appointmentIds: string[];
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Finds upcoming appointments that do not fit the doctor's schedule:
 *  - OVERLAP: two visits whose times overlap without sharing the same slot
 *  - OVER_CAPACITY: more patients in one slot than the session allows
 *  - ON_LEAVE: a visit on a day the doctor marked as leave
 *  - OUTSIDE_HOURS: a visit that no active session covers
 * Only visits that still hold a seat and have not been finished are considered.
 */
export function detectConflicts(input: {
  appointments: InsightAppointment[];
  sessions: AvailabilityEntity[];
  leaveDates: string[];
  now?: Date;
}): ScheduleConflict[] {
  const now = input.now ?? new Date();
  const active = input.appointments.filter(
    (a) => appointmentOccupiesSeat(a, now) && a.status !== "COMPLETED" && a.status !== "NO_SHOW"
  );
  const leaves = new Set(input.leaveDates);
  const conflicts: ScheduleConflict[] = [];

  const byDate = new Map<string, InsightAppointment[]>();
  for (const a of active) byDate.set(a.appointmentDate, [...(byDate.get(a.appointmentDate) ?? []), a]);

  for (const [date, day] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (leaves.has(date)) {
      conflicts.push({
        kind: "ON_LEAVE",
        date,
        description: `${day.length} appointment${day.length === 1 ? " is" : "s are"} booked on ${date}, which is marked as leave.`,
        appointmentIds: day.map((a) => a.id),
      });
      continue;
    }

    const daySessions = input.sessions.filter((s) => sessionAppliesOnDate(s, date));

    for (const a of day) {
      const start = toMinutes(a.startTime);
      const covered = daySessions.some((s) => start >= toMinutes(s.startTime) && start < toMinutes(s.endTime));
      if (!covered) {
        conflicts.push({
          kind: "OUTSIDE_HOURS",
          date,
          description: `${a.patientName} at ${a.startTime} on ${date} is outside your active sessions.`,
          appointmentIds: [a.id],
        });
      }
    }

    const bySlot = new Map<string, InsightAppointment[]>();
    for (const a of day) bySlot.set(a.startTime, [...(bySlot.get(a.startTime) ?? []), a]);
    for (const [startTime, group] of bySlot) {
      const start = toMinutes(startTime);
      const session = daySessions.find((s) => start >= toMinutes(s.startTime) && start < toMinutes(s.endTime));
      if (!session) continue;
      const capacity = sessionCapacity(session);
      if (group.length > capacity) {
        conflicts.push({
          kind: "OVER_CAPACITY",
          date,
          description: `${group.length} patients are booked at ${startTime} on ${date} but that slot allows ${capacity}.`,
          appointmentIds: group.map((a) => a.id),
        });
      }
    }

    const sorted = [...day].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (a.startTime === b.startTime) continue;
        if (toMinutes(b.startTime) < toMinutes(a.endTime)) {
          conflicts.push({
            kind: "OVERLAP",
            date,
            description: `${a.patientName} (${a.startTime}-${a.endTime}) overlaps ${b.patientName} (${b.startTime}-${b.endTime}) on ${date}.`,
            appointmentIds: [a.id, b.id],
          });
        }
      }
    }
  }
  return conflicts;
}
