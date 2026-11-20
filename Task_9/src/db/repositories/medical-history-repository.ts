import crypto from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../schema";
import { TREATING_STATUSES, diffMedicalProfile, profileToData } from "@/domain/medical-history";
import type { RepositoryContext } from "./context";
import type {
  MedicalHistoryLogEntity,
  MedicalProfileData,
  MedicalProfileEntity,
  VisitRecordEntity,
} from "./types";

export interface MedicalProfileActor {
  userId: string;
  role: "PATIENT" | "DOCTOR";
  name: string;
}

export interface SaveMedicalProfileInput {
  patientId: string;
  data: MedicalProfileData;
  /** The version the editor was looking at (0 when the patient had no profile). A different stored version means a stale edit. */
  expectedVersion: number;
  changeNote?: string | null;
  actor: MedicalProfileActor;
}

export type SaveMedicalProfileResult =
  | { success: true; changed: false; profile?: MedicalProfileEntity }
  | { success: true; changed: true; profile: MedicalProfileEntity; log: MedicalHistoryLogEntity }
  | { success: false; error: "CONFLICT"; current?: MedicalProfileEntity };

export interface UpsertVisitRecordInput {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  diagnosis: string;
  symptoms?: string | null;
  notes?: string | null;
  followUp?: string | null;
}

/**
 * Patient medical profiles, their change history, and per-visit clinical records.
 *
 * Saving a profile and writing its history entry happen together (one transaction in Postgres) so the history can
 * never disagree with the profile. Postgres and the in-memory store behave the same.
 */
export class MedicalHistoryRepository {
  constructor(private ctx: RepositoryContext) {}

  public async getMedicalProfile(patientId: string): Promise<MedicalProfileEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patientMedicalProfiles)
        .where(eq(schema.patientMedicalProfiles.patientId, patientId))
        .limit(1);
      return rows[0] as MedicalProfileEntity | undefined;
    }
    const found = this.ctx.getMem().medicalProfiles.find((p) => p.patientId === patientId);
    return found ? cloneProfile(found) : undefined;
  }

  public async saveMedicalProfile(input: SaveMedicalProfileInput): Promise<SaveMedicalProfileResult> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    const now = new Date();

    if (db) {
      try {
        return await db.transaction(async (tx): Promise<SaveMedicalProfileResult> => {
          // Lock the row so two editors cannot both build on the same version.
          const [existing] = (await tx
            .select()
            .from(schema.patientMedicalProfiles)
            .where(eq(schema.patientMedicalProfiles.patientId, input.patientId))
            .for("update")
            .limit(1)) as MedicalProfileEntity[];

          if ((existing?.version ?? 0) !== input.expectedVersion) {
            return { success: false, error: "CONFLICT", current: existing };
          }
          const changes = diffMedicalProfile(profileToData(existing), input.data);
          if (changes.length === 0) return { success: true, changed: false, profile: existing };

          const version = (existing?.version ?? 0) + 1;
          const values = {
            ...input.data,
            version,
            updatedByUserId: input.actor.userId,
            updatedByRole: input.actor.role,
            updatedByName: input.actor.name,
            updatedAt: now,
          };

          let profile: MedicalProfileEntity;
          if (existing) {
            const [row] = await tx
              .update(schema.patientMedicalProfiles)
              .set(values)
              .where(eq(schema.patientMedicalProfiles.id, existing.id))
              .returning();
            profile = row as MedicalProfileEntity;
          } else {
            const [row] = await tx
              .insert(schema.patientMedicalProfiles)
              .values({ id: `mp_${crypto.randomUUID()}`, patientId: input.patientId, ...values })
              .returning();
            profile = row as MedicalProfileEntity;
          }

          const [logRow] = await tx
            .insert(schema.patientMedicalHistoryLog)
            .values({
              id: `mh_${crypto.randomUUID()}`,
              patientId: input.patientId,
              version,
              changes,
              changeNote: input.changeNote ?? null,
              changedByUserId: input.actor.userId,
              changedByRole: input.actor.role,
              changedByName: input.actor.name,
            })
            .returning();
          return { success: true, changed: true, profile, log: logRow as MedicalHistoryLogEntity };
        });
      } catch (err) {
        // Two first-time saves racing on the unique (patient) index: the loser is simply a stale edit.
        if ((err as { code?: string }).code === "23505") return { success: false, error: "CONFLICT" };
        throw err;
      }
    }

    // In-memory store: no await between the check and the write, so this is atomic.
    const mem = this.ctx.getMem();
    const existing = mem.medicalProfiles.find((p) => p.patientId === input.patientId);
    if ((existing?.version ?? 0) !== input.expectedVersion) {
      return { success: false, error: "CONFLICT", current: existing ? cloneProfile(existing) : undefined };
    }
    const changes = diffMedicalProfile(profileToData(existing), input.data);
    if (changes.length === 0) {
      return { success: true, changed: false, profile: existing ? cloneProfile(existing) : undefined };
    }

    const version = (existing?.version ?? 0) + 1;
    const next: MedicalProfileEntity = {
      id: existing?.id ?? `mp_${crypto.randomUUID()}`,
      patientId: input.patientId,
      ...cloneData(input.data),
      version,
      updatedByUserId: input.actor.userId,
      updatedByRole: input.actor.role,
      updatedByName: input.actor.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) Object.assign(existing, next);
    else mem.medicalProfiles.push(next);

    const log: MedicalHistoryLogEntity = {
      id: `mh_${crypto.randomUUID()}`,
      patientId: input.patientId,
      version,
      changes,
      changeNote: input.changeNote ?? null,
      changedByUserId: input.actor.userId,
      changedByRole: input.actor.role,
      changedByName: input.actor.name,
      createdAt: now,
    };
    mem.medicalHistoryLog.push(log);
    return { success: true, changed: true, profile: cloneProfile(next), log: { ...log } };
  }

  /** Every saved change to a patient's profile, newest first. */
  public async getMedicalHistoryLog(patientId: string, limit = 100): Promise<MedicalHistoryLogEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.patientMedicalHistoryLog)
        .where(eq(schema.patientMedicalHistoryLog.patientId, patientId))
        .orderBy(desc(schema.patientMedicalHistoryLog.version))
        .limit(limit);
      return rows as MedicalHistoryLogEntity[];
    }
    return this.ctx
      .getMem()
      .medicalHistoryLog.filter((l) => l.patientId === patientId)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map((l) => ({ ...l }));
  }

  // --- Visit records (one per completed appointment) ---

  public async upsertVisitRecord(input: UpsertVisitRecordInput): Promise<VisitRecordEntity> {
    this.ctx.checkProductionDatabase();
    const now = new Date();
    const db = this.ctx.getDb();
    const fields = {
      diagnosis: input.diagnosis,
      symptoms: input.symptoms ?? null,
      notes: input.notes ?? null,
      followUp: input.followUp ?? null,
    };
    if (db) {
      const [row] = await db
        .insert(schema.visitRecords)
        .values({
          id: `vr_${crypto.randomUUID()}`,
          appointmentId: input.appointmentId,
          doctorId: input.doctorId,
          patientId: input.patientId,
          ...fields,
        })
        .onConflictDoUpdate({
          target: schema.visitRecords.appointmentId,
          set: { ...fields, updatedAt: now },
        })
        .returning();
      return row as VisitRecordEntity;
    }
    const mem = this.ctx.getMem();
    const existing = mem.visitRecords.find((r) => r.appointmentId === input.appointmentId);
    if (existing) {
      Object.assign(existing, fields, { updatedAt: now });
      return { ...existing };
    }
    const created: VisitRecordEntity = {
      id: `vr_${crypto.randomUUID()}`,
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    };
    mem.visitRecords.push(created);
    return { ...created };
  }

  public async getVisitRecordsByPatientId(patientId: string): Promise<VisitRecordEntity[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.visitRecords)
        .where(eq(schema.visitRecords.patientId, patientId));
      return rows as VisitRecordEntity[];
    }
    return this.ctx
      .getMem()
      .visitRecords.filter((r) => r.patientId === patientId)
      .map((r) => ({ ...r }));
  }

  /** True when this doctor has (or had) a real booking with the patient: the basis for opening their record. */
  public async doctorHasTreatedPatient(doctorId: string, patientId: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ id: schema.appointments.id })
        .from(schema.appointments)
        .where(
          and(
            eq(schema.appointments.doctorId, doctorId),
            eq(schema.appointments.patientId, patientId),
            inArray(schema.appointments.status, TREATING_STATUSES)
          )
        )
        .limit(1);
      return rows.length > 0;
    }
    return this.ctx
      .getMem()
      .appointments.some(
        (a) => a.doctorId === doctorId && a.patientId === patientId && TREATING_STATUSES.includes(a.status)
      );
  }
}

function cloneData(d: MedicalProfileData): MedicalProfileData {
  return {
    ...d,
    allergies: d.allergies.map((a) => ({ ...a })),
    conditions: d.conditions.map((c) => ({ ...c })),
  };
}

function cloneProfile(p: MedicalProfileEntity): MedicalProfileEntity {
  return { ...p, ...cloneData(p) };
}
