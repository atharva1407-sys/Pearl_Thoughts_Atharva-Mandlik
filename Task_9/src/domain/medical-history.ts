import type {
  AppointmentStatus,
  MedicalAllergy,
  MedicalCondition,
  MedicalProfileChange,
  MedicalProfileData,
  MedicalProfileEntity,
} from "@/db/repositories/types";

/**
 * Pure rules for patient medical history and visit history (no database access, easy to test):
 *  - what a medical profile looks like and how two versions differ,
 *  - who may view or edit a patient's record,
 *  - how a patient's appointments are split into upcoming / completed / other and ordered in time.
 */

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const ALLERGY_SEVERITIES = ["MILD", "MODERATE", "SEVERE"] as const;
export const CONDITION_STATUSES = ["ACTIVE", "MANAGED", "RESOLVED"] as const;

export const EMPTY_MEDICAL_PROFILE: MedicalProfileData = {
  bloodGroup: null,
  heightCm: null,
  weightKg: null,
  allergies: [],
  conditions: [],
  currentMedications: null,
  pastSurgeries: null,
  familyHistory: null,
  notes: null,
};

/** The editable part of a stored profile (or an empty profile when the patient has none yet). */
export function profileToData(profile?: MedicalProfileEntity | null): MedicalProfileData {
  if (!profile) return { ...EMPTY_MEDICAL_PROFILE, allergies: [], conditions: [] };
  return {
    bloodGroup: profile.bloodGroup ?? null,
    heightCm: profile.heightCm ?? null,
    weightKg: profile.weightKg ?? null,
    allergies: (profile.allergies ?? []).map((a) => ({ ...a })),
    conditions: (profile.conditions ?? []).map((c) => ({ ...c })),
    currentMedications: profile.currentMedications ?? null,
    pastSurgeries: profile.pastSurgeries ?? null,
    familyHistory: profile.familyHistory ?? null,
    notes: profile.notes ?? null,
  };
}

const FIELD_LABELS: Record<keyof MedicalProfileData, string> = {
  bloodGroup: "Blood group",
  heightCm: "Height",
  weightKg: "Weight",
  allergies: "Allergies",
  conditions: "Existing conditions",
  currentMedications: "Current medications",
  pastSurgeries: "Past surgeries",
  familyHistory: "Family history",
  notes: "Other notes",
};

const SEVERITY_LABEL: Record<MedicalAllergy["severity"], string> = {
  MILD: "mild",
  MODERATE: "moderate",
  SEVERE: "severe",
};

const CONDITION_STATUS_LABEL: Record<MedicalCondition["status"], string> = {
  ACTIVE: "active",
  MANAGED: "managed",
  RESOLVED: "resolved",
};

export function describeAllergy(a: MedicalAllergy): string {
  return `${a.name} (${SEVERITY_LABEL[a.severity]})${a.reaction ? ` – ${a.reaction}` : ""}`;
}

export function describeCondition(c: MedicalCondition): string {
  return `${c.name} (${CONDITION_STATUS_LABEL[c.status]})${c.notes ? ` – ${c.notes}` : ""}`;
}

/** One field as short display text. `"None"` when it is empty. */
function describeField(field: keyof MedicalProfileData, data: MedicalProfileData): string {
  switch (field) {
    case "allergies":
      return data.allergies.length ? data.allergies.map(describeAllergy).join("; ") : "None";
    case "conditions":
      return data.conditions.length ? data.conditions.map(describeCondition).join("; ") : "None";
    case "heightCm":
      return data.heightCm == null ? "None" : `${data.heightCm} cm`;
    case "weightKg":
      return data.weightKg == null ? "None" : `${data.weightKg} kg`;
    default: {
      const v = data[field] as string | null;
      return v && v.trim() ? v.trim() : "None";
    }
  }
}

/** Order does not matter for a list of allergies/conditions, so compare the sorted descriptions. */
function comparable(field: keyof MedicalProfileData, data: MedicalProfileData): string {
  if (field === "allergies") return data.allergies.map(describeAllergy).sort().join("|");
  if (field === "conditions") return data.conditions.map(describeCondition).sort().join("|");
  return describeField(field, data);
}

export function fieldLabel(field: keyof MedicalProfileData): string {
  return FIELD_LABELS[field];
}

/** Every field whose value differs between two versions of a profile, with display text for before and after. */
export function diffMedicalProfile(before: MedicalProfileData, after: MedicalProfileData): MedicalProfileChange[] {
  const changes: MedicalProfileChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as (keyof MedicalProfileData)[]) {
    if (comparable(field, before) === comparable(field, after)) continue;
    changes.push({
      field,
      label: FIELD_LABELS[field],
      from: describeField(field, before),
      to: describeField(field, after),
    });
  }
  return changes;
}

// ---------- Access rules ----------

export type RecordViewer = {
  role: "PATIENT" | "DOCTOR" | "RECEPTIONIST";
};

export interface RecordAccess {
  canView: boolean;
  canEdit: boolean;
}

/**
 * Who may open a patient's medical record.
 *  - The patient themselves: view and edit their own record.
 *  - A doctor who has treated or is booked to treat this patient: view and edit it (they need it to practise safely).
 *  - Anyone else, receptionists included: no access. Front-desk staff manage queues, not clinical data.
 */
export function resolveRecordAccess(
  viewer: RecordViewer | null,
  facts: { isOwnRecord: boolean; doctorHasTreated: boolean }
): RecordAccess {
  const none: RecordAccess = { canView: false, canEdit: false };
  if (!viewer || viewer.role === "RECEPTIONIST") return none;
  if (facts.isOwnRecord) return { canView: true, canEdit: true };
  if (viewer.role === "DOCTOR" && facts.doctorHasTreated) return { canView: true, canEdit: true };
  return none;
}

/** Appointment statuses that count as a doctor–patient relationship for record access. */
export const TREATING_STATUSES: AppointmentStatus[] = ["BOOKED", "CHECKED_IN", "IN_CONSULTATION", "COMPLETED"];

// ---------- Visit history ----------

export const UPCOMING_STATUSES: AppointmentStatus[] = ["BOOKED", "CHECKED_IN", "IN_CONSULTATION"];

export type VisitBucket = "UPCOMING" | "COMPLETED" | "OTHER";

export function visitBucket(status: AppointmentStatus): VisitBucket {
  if (UPCOMING_STATUSES.includes(status)) return "UPCOMING";
  if (status === "COMPLETED") return "COMPLETED";
  return "OTHER";
}

export const VISIT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  BOOKED: "Confirmed",
  CHECKED_IN: "Checked in",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Missed (no-show)",
  EXPIRED: "Payment expired",
};

type Dated = { appointmentDate: string; startTime: string };

const visitKey = (v: Dated) => `${v.appointmentDate} ${v.startTime}`;

/** Newest visit first. */
export function compareVisitsNewestFirst(a: Dated, b: Dated): number {
  return visitKey(b).localeCompare(visitKey(a));
}

/** Soonest visit first. */
export function compareVisitsSoonestFirst(a: Dated, b: Dated): number {
  return visitKey(a).localeCompare(visitKey(b));
}

/**
 * Splits a patient's appointments for display. Upcoming run soonest-first (what is next); completed and
 * cancelled/missed run newest-first (the chronological history, most recent at the top).
 */
export function splitVisits<T extends Dated & { status: AppointmentStatus }>(visits: T[]) {
  const upcoming: T[] = [];
  const completed: T[] = [];
  const other: T[] = [];
  for (const v of visits) {
    const bucket = visitBucket(v.status);
    if (bucket === "UPCOMING") upcoming.push(v);
    else if (bucket === "COMPLETED") completed.push(v);
    else other.push(v);
  }
  upcoming.sort(compareVisitsSoonestFirst);
  completed.sort(compareVisitsNewestFirst);
  other.sort(compareVisitsNewestFirst);
  return { upcoming, completed, other };
}
