import crypto from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "../schema";
import type { RepositoryContext } from "./context";
import type {
  DoctorEntity,
  DoctorReceptionistEntity,
  ReceptionistEntity,
  ReceptionistWithEmail,
  UserEntity,
} from "./types";

export interface CreateReceptionistAccountInput {
  userId: string;
  receptionistId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdByDoctorId: string;
}

/**
 * Front-desk staff and their doctor assignments.
 *
 * A receptionist only ever sees and acts on the doctors listed in `doctor_receptionists`; every queue page and
 * every appointment action asks this repository who the receptionist is assigned to.
 */
export class ReceptionistRepository {
  constructor(private ctx: RepositoryContext) {}

  /** Creates the login (role RECEPTIONIST) and the profile together, or neither. */
  public async createReceptionistAccount(input: CreateReceptionistAccountInput): Promise<ReceptionistEntity> {
    this.ctx.checkProductionDatabase();
    const email = input.email.trim().toLowerCase();
    const db = this.ctx.getDb();

    if (db) {
      return await db.transaction(async (tx) => {
        await tx.insert(schema.users).values({
          id: input.userId,
          email,
          passwordHash: input.passwordHash,
          role: "RECEPTIONIST",
          isActive: true,
        });
        const [row] = await tx
          .insert(schema.receptionists)
          .values({
            id: input.receptionistId,
            userId: input.userId,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            createdByDoctorId: input.createdByDoctorId,
          })
          .returning();
        return row as ReceptionistEntity;
      });
    }

    const mem = this.ctx.getMem();
    if (mem.users.some((u) => u.email.toLowerCase() === email)) {
      throw new Error("An account with this email already exists.");
    }
    const now = new Date();
    const user: UserEntity = {
      id: input.userId,
      email,
      passwordHash: input.passwordHash,
      role: "RECEPTIONIST",
      isActive: true,
      createdAt: now,
    };
    const receptionist: ReceptionistEntity = {
      id: input.receptionistId,
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      createdByDoctorId: input.createdByDoctorId,
      createdAt: now,
    };
    mem.users.push(user);
    mem.receptionists.push(receptionist);
    return { ...receptionist };
  }

  public async getReceptionistById(id: string): Promise<ReceptionistEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db.select().from(schema.receptionists).where(eq(schema.receptionists.id, id)).limit(1);
      return rows[0] as ReceptionistEntity | undefined;
    }
    const found = this.ctx.getMem().receptionists.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  public async getReceptionistByUserId(userId: string): Promise<ReceptionistEntity | undefined> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.receptionists)
        .where(eq(schema.receptionists.userId, userId))
        .limit(1);
      return rows[0] as ReceptionistEntity | undefined;
    }
    const found = this.ctx.getMem().receptionists.find((r) => r.userId === userId);
    return found ? { ...found } : undefined;
  }

  /** The receptionist whose login email is `email`, or undefined when that email is not a receptionist account. */
  public async getReceptionistByEmail(email: string): Promise<ReceptionistWithEmail | undefined> {
    this.ctx.checkProductionDatabase();
    const clean = email.trim().toLowerCase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ receptionist: schema.receptionists, email: schema.users.email })
        .from(schema.receptionists)
        .innerJoin(schema.users, eq(schema.receptionists.userId, schema.users.id))
        .where(and(eq(schema.users.email, clean), eq(schema.users.role, "RECEPTIONIST")))
        .limit(1);
      const row = rows[0];
      return row ? { ...(row.receptionist as ReceptionistEntity), email: row.email } : undefined;
    }
    const mem = this.ctx.getMem();
    const user = mem.users.find((u) => u.email.toLowerCase() === clean && u.role === "RECEPTIONIST");
    if (!user) return undefined;
    const profile = mem.receptionists.find((r) => r.userId === user.id);
    return profile ? { ...profile, email: user.email } : undefined;
  }

  /** Assigns a receptionist to a doctor. Returns false when they were already assigned (safe to repeat). */
  public async assignReceptionist(doctorId: string, receptionistId: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const inserted = await db
        .insert(schema.doctorReceptionists)
        .values({ id: `drc_${crypto.randomUUID()}`, doctorId, receptionistId })
        .onConflictDoNothing()
        .returning();
      return inserted.length > 0;
    }
    const mem = this.ctx.getMem();
    if (mem.doctorReceptionists.some((a) => a.doctorId === doctorId && a.receptionistId === receptionistId)) {
      return false;
    }
    const assignment: DoctorReceptionistEntity = {
      id: `drc_${crypto.randomUUID()}`,
      doctorId,
      receptionistId,
      assignedAt: new Date(),
    };
    mem.doctorReceptionists.push(assignment);
    return true;
  }

  /** Removes the assignment. Returns false when there was none. Takes effect on the receptionist's next request. */
  public async revokeReceptionist(doctorId: string, receptionistId: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const deleted = await db
        .delete(schema.doctorReceptionists)
        .where(
          and(
            eq(schema.doctorReceptionists.doctorId, doctorId),
            eq(schema.doctorReceptionists.receptionistId, receptionistId)
          )
        )
        .returning();
      return deleted.length > 0;
    }
    const mem = this.ctx.getMem();
    const before = mem.doctorReceptionists.length;
    mem.doctorReceptionists = mem.doctorReceptionists.filter(
      (a) => !(a.doctorId === doctorId && a.receptionistId === receptionistId)
    );
    return mem.doctorReceptionists.length < before;
  }

  /** Receptionists assigned to a doctor, with their login emails, newest assignment last. */
  public async getReceptionistsForDoctor(doctorId: string): Promise<ReceptionistWithEmail[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ receptionist: schema.receptionists, email: schema.users.email })
        .from(schema.doctorReceptionists)
        .innerJoin(schema.receptionists, eq(schema.doctorReceptionists.receptionistId, schema.receptionists.id))
        .innerJoin(schema.users, eq(schema.receptionists.userId, schema.users.id))
        .where(eq(schema.doctorReceptionists.doctorId, doctorId))
        .orderBy(asc(schema.doctorReceptionists.assignedAt));
      return rows.map((r) => ({ ...(r.receptionist as ReceptionistEntity), email: r.email }));
    }
    const mem = this.ctx.getMem();
    const result: ReceptionistWithEmail[] = [];
    for (const a of mem.doctorReceptionists.filter((x) => x.doctorId === doctorId)) {
      const profile = mem.receptionists.find((r) => r.id === a.receptionistId);
      const user = profile ? mem.users.find((u) => u.id === profile.userId) : undefined;
      if (profile && user) result.push({ ...profile, email: user.email });
    }
    return result;
  }

  public async doctorHasReceptionist(doctorId: string): Promise<boolean> {
    const assigned = await this.getReceptionistsForDoctor(doctorId);
    return assigned.length > 0;
  }

  /** Ids of the doctors this receptionist may work for. Empty means: not assigned to anyone. */
  public async getAssignedDoctorIds(receptionistId: string): Promise<string[]> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select({ doctorId: schema.doctorReceptionists.doctorId })
        .from(schema.doctorReceptionists)
        .where(eq(schema.doctorReceptionists.receptionistId, receptionistId));
      return rows.map((r) => r.doctorId);
    }
    return this.ctx
      .getMem()
      .doctorReceptionists.filter((a) => a.receptionistId === receptionistId)
      .map((a) => a.doctorId);
  }

  public async getAssignedDoctors(receptionistId: string): Promise<DoctorEntity[]> {
    const ids = await this.getAssignedDoctorIds(receptionistId);
    if (ids.length === 0) return [];
    const db = this.ctx.getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.doctors)
        .where(inArray(schema.doctors.id, ids))
        .orderBy(asc(schema.doctors.firstName), asc(schema.doctors.lastName));
      return rows as DoctorEntity[];
    }
    return this.ctx
      .getMem()
      .doctors.filter((d) => ids.includes(d.id))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
      .map((d) => ({ ...d }));
  }

  /** Replaces the login password hash (used when the creating doctor resets a receptionist's password). */
  public async updateUserPasswordHash(userId: string, passwordHash: string): Promise<boolean> {
    this.ctx.checkProductionDatabase();
    const db = this.ctx.getDb();
    if (db) {
      const updated = await db
        .update(schema.users)
        .set({ passwordHash })
        .where(eq(schema.users.id, userId))
        .returning({ id: schema.users.id });
      return updated.length > 0;
    }
    const user = this.ctx.getMem().users.find((u) => u.id === userId);
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  }
}
