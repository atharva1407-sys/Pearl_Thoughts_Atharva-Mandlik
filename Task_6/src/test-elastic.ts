/**
 * Elastic scheduling tests: a doctor stretches or shrinks the hours of an existing OPD session
 * (10-12 becomes 9-12, or 10-11). The slots must follow, and appointments that are already booked
 * must never be moved, cancelled or lost.
 *
 * Every date is relative to "today" in hospital time, so the suite keeps working as the calendar moves.
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "false";

async function main() {
  const E = await import("./lib/elastic-schedule");
  const S = await import("./lib/session-schedule");
  const { dbRepo } = await import("./db/repo");
  const { checkRequestedSlot } = await import("./lib/booking-rules");
  const { istDateString } = await import("./lib/time");

  let passed = 0;
  let failed = 0;
  const check = (ok: boolean, name: string) => {
    if (ok) passed++;
    else {
      failed++;
      console.error(`  ❌ FAIL: ${name}`);
    }
  };
  /** Runs fn and returns the SessionChangeBlocked it throws, or null if it did not throw one. */
  const blocked = async (fn: () => Promise<unknown>): Promise<InstanceType<typeof E.SessionChangeBlocked> | null> => {
    try {
      await fn();
      return null;
    } catch (err) {
      return err instanceof E.SessionChangeBlocked ? err : null;
    }
  };

  const today = istDateString(new Date());
  const day = (offset: number) => S.addDaysToDate(today, offset);

  // ------------------------------------------------------------------ 1. pure rules
  const base = { startTime: "10:00", endTime: "12:00", slotDurationMinutes: 30 };
  check(E.slotStarts(base).join() === "10:00,10:30,11:00,11:30", "10:00-12:00 in 30-minute slots has four slots");
  check(E.slotStarts({ ...base, endTime: "11:50" }).join() === "10:00,10:30,11:00", "a trailing part-slot is not offered");

  check(E.classifyWindowChange(base, { ...base, startTime: "09:00" }) === "EXPANDED", "starting earlier is an expansion");
  check(E.classifyWindowChange(base, { ...base, endTime: "13:00" }) === "EXPANDED", "ending later is an expansion");
  check(E.classifyWindowChange(base, { ...base, endTime: "11:00" }) === "SHRUNK", "ending earlier is a shrink");
  check(E.classifyWindowChange(base, { ...base, startTime: "10:30" }) === "SHRUNK", "starting later is a shrink");
  check(E.classifyWindowChange(base, { ...base, startTime: "09:00", endTime: "11:00" }) === "CHANGED", "moving one edge out and the other in is a mixed change");
  check(E.classifyWindowChange(base, { ...base }) === "NONE", "identical hours are no change");

  const weeklyNew = { ...base, endTime: "11:00", recurrence: "WEEKLY" as const, dayOfWeek: S.weekdayOfDate(day(7)) };
  const onDay = { appointmentDate: day(7) };
  check(E.classifyBooking({ ...onDay, startTime: "10:30" }, weeklyNew) === "KEPT", "a booking still on a slot is kept");
  check(E.classifyBooking({ ...onDay, startTime: "11:00" }, weeklyNew) === "OUTSIDE", "a booking after the new end is outside");
  check(E.classifyBooking({ ...onDay, startTime: "09:30" }, weeklyNew) === "OUTSIDE", "a booking before the new start is outside");
  check(E.classifyBooking({ appointmentDate: day(8), startTime: "10:30" }, weeklyNew) === "OUTSIDE", "a booking on a date the session no longer runs is outside");
  check(E.classifyBooking({ ...onDay, startTime: "10:15" }, weeklyNew) === "OFF_GRID", "a booking between two slots is off the grid");

  const expandImpact = E.analyzeSessionChange(base, { ...base, ...weeklyNew, startTime: "09:00", endTime: "12:00" }, []);
  check(expandImpact.slotsAdded.join() === "09:00,09:30" && expandImpact.slotsRemoved.length === 0, "expanding 10-12 to 9-12 adds the 09:00 and 09:30 slots");
  const shrinkImpact = E.analyzeSessionChange(base, { ...base, ...weeklyNew }, []);
  check(shrinkImpact.slotsRemoved.join() === "11:00,11:30" && shrinkImpact.slotsAdded.length === 0, "shrinking 10-12 to 10-11 removes the 11:00 and 11:30 slots");

  // ------------------------------------------------------------------ helpers for repo-level checks
  let counter = 0;
  const makeDoctor = async () => {
    counter++;
    const tag = `${Date.now()}-${counter}`;
    const user = await dbRepo.createUser({ id: `usr-elastic-${tag}`, email: `elastic.${tag}@example.com`, passwordHash: "x", role: "DOCTOR", isActive: true });
    return dbRepo.createDoctor({
      id: `doc-elastic-${tag}`,
      userId: user.id,
      firstName: "Elastic",
      lastName: `Doc${counter}`,
      specialization: "General",
      phone: "+91 20 0000 0000",
      licenseNumber: `ELASTIC-${tag}`,
      experienceYears: 5,
      consultationFee: 500,
    });
  };
  const weekly = (doctorId: string, date: string, extra: Record<string, unknown> = {}) => ({
    doctorId,
    name: "Morning OPD",
    dayOfWeek: S.weekdayOfDate(date),
    startTime: "10:00",
    endTime: "12:00",
    slotDurationMinutes: 30,
    isActive: true,
    schedulingType: "STREAM" as const,
    patientsPerWave: 1,
    ...extra,
  });
  const slotTimes = async (doctorId: string, date: string) =>
    ((await dbRepo.computeSessionGroups(doctorId, date)).groups[0]?.slots ?? []).map((s) => s.startTime);
  let booker = 0;
  const book = async (doctorId: string, date: string, startTime: string, endTime: string, sessionId: string) => {
    const n = ++booker;
    const tag = `${Date.now()}-${n}`;
    const user = await dbRepo.createUser({ id: `usr-elasticpat-${tag}`, email: `elasticpat.${tag}@example.com`, passwordHash: "x", role: "PATIENT", isActive: true });
    const patient = await dbRepo.createPatient({ id: `pat-elastic-${tag}`, userId: user.id, firstName: "Pat", lastName: `Elastic${n}`, phone: "+91 98765 00000" });
    const res = await dbRepo.createAppointment({ patientId: patient.id, doctorId, sessionId, appointmentDate: date, startTime, endTime, reason: "Elastic test" });
    if (!res.success || !res.appointment) throw new Error(`test booking failed: ${res.message}`);
    return res.appointment;
  };
  const unchanged = async (id: string, date: string, startTime: string) => {
    const a = await dbRepo.getAppointmentById(id);
    return !!a && a.status === "BOOKED" && a.appointmentDate === date && a.startTime === startTime;
  };

  const date = day(7);

  // ------------------------------------------------------------------ 2. expansion keeps every booking
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const a = await book(doc.id, date, "10:00", "10:30", s.id);
    const b = await book(doc.id, date, "11:30", "12:00", s.id);

    const { session, impact } = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "09:00" });
    check(session.startTime === "09:00" && session.endTime === "12:00", "the session now runs 09:00-12:00");
    check((await slotTimes(doc.id, date)).join() === "09:00,09:30,10:00,10:30,11:00,11:30", "the booking page now offers six slots, two of them new");
    check(impact.slotsAdded.join() === "09:00,09:30" && impact.keptBookings === 2 && impact.outsideBookings.length === 0, "the impact lists the new slots and says both bookings are untouched");
    check(await unchanged(a.id, date, "10:00") && await unchanged(b.id, date, "11:30"), "both appointments are still booked at the same date and time");
    const groups = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0];
    check(groups.slots.find((x) => x.startTime === "10:00")?.isBooked === true && groups.slots.find((x) => x.startTime === "09:30")?.isBooked === false, "the booked slot still shows as taken and the new slot as open");
    check((await checkRequestedSlot(doc.id, date, "09:00")).ok, "a patient can book the newly added 09:00 slot");

    await dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "13:00" });
    check((await slotTimes(doc.id, date)).length === 8, "extending the end to 13:00 adds two more slots (eight in all)");
    check(await unchanged(a.id, date, "10:00") && await unchanged(b.id, date, "11:30"), "the bookings are still untouched after a second expansion");
  }

  // ------------------------------------------------------------------ 3. shrink with nothing booked in the removed part
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const a = await book(doc.id, date, "10:00", "10:30", s.id);

    const { impact } = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "11:00" });
    check((await slotTimes(doc.id, date)).join() === "10:00,10:30", "10:00-11:00 leaves two slots");
    check(impact.slotsRemoved.join() === "11:00,11:30" && impact.outsideBookings.length === 0, "the impact lists the removed slots and no affected bookings");
    check(await unchanged(a.id, date, "10:00"), "the 10:00 appointment is untouched");
    check(!(await checkRequestedSlot(doc.id, date, "11:30")).ok, "a patient can no longer book a removed slot");
  }

  // ------------------------------------------------------------------ 4. shrink past a booking asks what to do, KEEP leaves it booked
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const early = await book(doc.id, date, "10:00", "10:30", s.id);
    const late = await book(doc.id, date, "11:30", "12:00", s.id);

    const refusal = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "11:00" }));
    check(refusal?.code === "NEEDS_RESOLUTION", "shrinking past a booking asks what should happen to it first");
    check(refusal?.impact.affectedBookings.length === 1 && refusal.impact.affectedBookings[0].id === late.id, "the prompt names the one booking that is affected");
    check(!!refusal?.impact.affectedBookings[0].patientName && /Pat Elastic/.test(refusal.impact.affectedBookings[0].patientName), "...with the patient's name");
    check((await slotTimes(doc.id, date)).length === 4, "nothing changed while the doctor has not chosen");

    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "11:00" }, { resolution: "KEEP" });
    check(applied.session.endTime === "11:00", "after choosing, the hours shrink");
    check(applied.impact.outsideBookings.length === 1, "the result still reports the booking outside the new hours");
    check(await unchanged(early.id, date, "10:00") && await unchanged(late.id, date, "11:30"), "BOTH appointments are still booked at their original times, none lost");
    check((await slotTimes(doc.id, date)).join() === "10:00,10:30", "new patients only see the shortened slots");
    check(!(await checkRequestedSlot(doc.id, date, "11:30")).ok, "the outside 11:30 slot cannot be booked by anyone else");
    check(/1 booked appointment is affected/.test(applied.impact.summary), "the summary tells the doctor one booking is affected");

    // Unrelated edits are not held up by the booking that is already outside.
    const renamed = await dbRepo.updateAvailabilitySession(doc.id, s.id, { name: "Short morning OPD", patientsPerWave: 2 });
    check(renamed.name === "Short morning OPD" && renamed.patientsPerWave === 2, "renaming or changing capacity is not blocked by an earlier outside booking");
    check(await unchanged(late.id, date, "11:30"), "the outside booking is still there after the unrelated edit");

    // Stretching back brings the slot back with the booking in it.
    await dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "12:00" });
    const g = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0];
    check(g.slots.length === 4 && g.slots.find((x) => x.startTime === "11:30")?.bookedCount === 1, "extending again restores the 11:30 slot, still holding that patient");
  }

  // ------------------------------------------------------------------ 5. a booking between the new slots no longer blocks the change
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const a = await book(doc.id, date, "10:30", "11:00", s.id);

    const longer = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { slotDurationMinutes: 45 }));
    check(longer?.code === "NEEDS_RESOLUTION" && longer.impact.offGridBookings.length === 1, "longer slots that would swallow a booking ask for a decision instead of refusing");
    check(/move them.*cancel and refund.*keep/i.test(longer?.message ?? ""), "the message explains the three options");
    const unchangedSession = (await dbRepo.getAvailabilitiesByDoctorId(doc.id))[0];
    check(unchangedSession.slotDurationMinutes === 30, "nothing is saved until the doctor decides");

    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { slotDurationMinutes: 45 }, { resolution: "KEEP" });
    check(applied.session.slotDurationMinutes === 45 && applied.impact.offGridBookings.length === 1, "choosing KEEP applies the new slot length");
    check(await unchanged(a.id, date, "10:30"), "the off-grid booking is untouched");

    const shifted = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "10:15", slotDurationMinutes: 30 }));
    check(shifted === null, "a booking that was already off the grid does not hold up a later, unrelated edit");
    check(!!(await dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "09:00", slotDurationMinutes: 30 }, { resolution: "KEEP" })), "moving the start by whole slots is fine");
  }

  // ------------------------------------------------------------------ 6. only seat-holding bookings count
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const cancelled = await book(doc.id, date, "11:30", "12:00", s.id);
    await dbRepo.updateAppointmentStatus(cancelled.id, "CANCELLED", { cancelledBy: "PATIENT", cancelReason: "Plans changed" });
    const r = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "11:00" }));
    check(r === null && (await slotTimes(doc.id, date)).length === 2, "a cancelled booking does not hold up a shrink");
  }

  // ------------------------------------------------------------------ 7. one patient booking per slot is still enforced after an edit
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date, { schedulingType: "WAVE", patientsPerWave: 2 }));
    await book(doc.id, date, "10:00", "10:30", s.id);
    await book(doc.id, date, "10:00", "10:30", s.id);
    await dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "09:00" });
    const full = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots.find((x) => x.startTime === "10:00");
    check(full?.bookedCount === 2 && full.seatsLeft === 0 && full.isBooked, "a full Wave slot stays full after the session is extended");
    let thirdRefused = false;
    try {
      await book(doc.id, date, "10:00", "10:30", s.id);
    } catch {
      thirdRefused = true;
    }
    check(thirdRefused, "a third patient is still refused for that slot");
  }

  // ------------------------------------------------------------------ 8. whole-session Stream window
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date, { startTime: "10:00", endTime: "14:00", slotDurationMinutes: 240, patientsPerWave: 20 }));
    const a = await book(doc.id, date, "10:00", "14:00", s.id);
    const r = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "13:00", slotDurationMinutes: 180 }));
    check(r === null && (await slotTimes(doc.id, date)).join() === "10:00", "a whole-session window can end earlier while its start (and bookings) stay put");
    check(await unchanged(a.id, date, "10:00"), "the booking at the session start is untouched");
    const later = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "09:00", slotDurationMinutes: 240 }));
    check(later?.code === "NEEDS_RESOLUTION" && later.impact.affectedBookings.length === 1, "stretching a whole-session window to start earlier asks what to do with the booking at the old start");
  }

  // ------------------------------------------------------------------ 9. switching a session off and moving its date
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const a = await book(doc.id, date, "11:00", "11:30", s.id);
    const off = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { isActive: false }));
    check(off === null && await unchanged(a.id, date, "11:00"), "switching a session off still works and keeps its bookings");

    const oneOff = await dbRepo.createAvailabilitySession(weekly(doc.id, date, { name: "Camp", recurrence: "ONE_TIME", specificDate: day(10), startTime: "15:00", endTime: "17:00", dayOfWeek: S.weekdayOfDate(day(10)) }));
    const c = await book(doc.id, day(10), "15:00", "15:30", oneOff.id);
    const move = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, oneOff.id, { specificDate: day(12) }));
    check(move?.code === "NEEDS_RESOLUTION", "moving a one-date session off a booked day asks what to do with the booking");
    check(await unchanged(c.id, day(10), "15:00"), "the booking on the old date is untouched");
  }

  // ------------------------------------------------------------------ 10. the full-capacity scenario: 9-10, capacity 5, all 5 booked
  const doctorIo = (doc: { id: string; userId: string }) => ({
    freeSlots: async (d: string) =>
      (await dbRepo.computeSessionGroups(doc.id, d)).groups.flatMap((g) =>
        g.slots
          .filter((x) => !x.isBooked && x.seatsLeft > 0)
          .map((x) => ({ date: d, sessionId: g.sessionId, startTime: x.startTime, endTime: x.endTime, seatsLeft: x.seatsLeft }))
      ),
    move: async (b: { id: string }, t: { date: string; startTime: string; endTime: string; sessionId: string }) => {
      const r = await dbRepo.rescheduleAppointment({
        appointmentId: b.id,
        newDate: t.date,
        newStartTime: t.startTime,
        newEndTime: t.endTime,
        newSessionId: t.sessionId,
        actorUserId: doc.userId,
        actorRole: "DOCTOR",
      });
      return { ok: r.success, message: r.message };
    },
    cancel: async (b: { id: string }) => ({
      ok: await dbRepo.updateAppointmentStatus(b.id, "CANCELLED", { cancelledBy: "DOCTOR", cancelReason: "Schedule change" }),
    }),
  });
  const resolveOpts = { today, lastBookableDate: day(30) };
  const fullHourSession = (doctorId: string, extra: Record<string, unknown> = {}) =>
    weekly(doctorId, date, { name: "Hour OPD", startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60, schedulingType: "WAVE", patientsPerWave: 5, ...extra });
  const bookFive = async (doctorId: string, sessionId: string, at = "09:00", end = "10:00") => {
    const out = [];
    for (let i = 0; i < 5; i++) out.push(await book(doctorId, date, at, end, sessionId));
    return out;
  };
  const statusOf = async (id: string) => (await dbRepo.getAppointmentById(id))?.status;
  const placeOf = async (id: string) => {
    const a = await dbRepo.getAppointmentById(id);
    return a ? `${a.appointmentDate} ${a.startTime} ${a.status}` : "missing";
  };

  // 10a. EXPANSION: more time is added, all five stay put, new seats open up
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id));
    const five = await bookFive(doc.id, s.id);
    const full = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots[0];
    check(full.bookedCount === 5 && full.seatsLeft === 0 && full.isBooked, "9-10 with capacity 5 is completely full after five bookings");

    const later = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "11:00" });
    check(later.impact.change === "EXPANDED" && later.impact.affectedBookings.length === 0 && later.impact.keptBookings === 5, "extending the end to 11:00 affects none of the five bookings");
    const g1 = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots;
    check(g1.map((x) => `${x.startTime}:${x.seatsLeft}`).join() === "09:00:0,10:00:5", "the 09:00 slot is still full and a new 10:00 slot opens with five free seats");

    const earlier = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "08:00" });
    check(earlier.impact.affectedBookings.length === 0, "extending the start to 08:00 affects none of the five bookings either");
    const g2 = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots;
    check(g2.map((x) => `${x.startTime}:${x.seatsLeft}`).join() === "08:00:5,09:00:0,10:00:5", "08:00 opens with five free seats, 09:00 stays full");
    const placed = await Promise.all(five.map((a) => placeOf(a.id)));
    check(placed.every((p) => p === `${date} 09:00 BOOKED`), "all five appointments are still booked at 09:00");
  }

  // 10b. EXPANSION of a session that is "one slot for the whole session": the slot is kept, the extra time becomes new seats
  {
    const wholeOld = { startTime: "09:00", endTime: "10:00", slotDurationMinutes: 60 };
    check(E.effectiveSlotLength({ editing: wholeOld, startTime: "08:00", endTime: "10:00", slotLength: 60, wholeSession: true }) === 60, "extending a whole-session window keeps its current slot length");
    check(E.effectiveSlotLength({ editing: wholeOld, startTime: "09:30", endTime: "10:00", slotLength: 60, wholeSession: true }) === 30, "shrinking a whole-session window makes the slot follow it");
    check(E.effectiveSlotLength({ editing: { ...wholeOld, slotDurationMinutes: 30 }, startTime: "08:00", endTime: "10:00", slotLength: 30, wholeSession: true }) === 120, "ticking whole-session on a normal session still makes one big slot");
    check(E.effectiveSlotLength({ editing: wholeOld, startTime: "08:00", endTime: "10:00", slotLength: 45, wholeSession: false }) === 45, "without the tick, the chosen slot length is used as typed");

    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id));
    const five = await bookFive(doc.id, s.id);
    const slot = E.effectiveSlotLength({ editing: wholeOld, startTime: "08:00", endTime: "10:00", slotLength: 60, wholeSession: true });
    const r = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "08:00", slotDurationMinutes: slot });
    check(r.impact.affectedBookings.length === 0 && (await slotTimes(doc.id, date)).join() === "08:00,09:00", "extending 9-10 to 8-10 is never refused and adds an 08:00 slot");
    check((await Promise.all(five.map((a) => placeOf(a.id)))).every((p) => p === `${date} 09:00 BOOKED`), "...with all five bookings untouched");
  }

  // 10c. SHRINK, the removed time is empty: nothing to decide
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { startTime: "08:00", endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id, "09:00", "10:00");
    const r = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "09:00", endTime: "10:00" });
    check(r.impact.change === "SHRUNK" && r.impact.affectedBookings.length === 0 && r.impact.slotsRemoved.join() === "08:00,10:00", "shrinking 8-11 to 9-10 drops two empty slots and affects nobody");
    check((await Promise.all(five.map((a) => placeOf(a.id)))).every((p) => p === `${date} 09:00 BOOKED`), "the five bookings are untouched");
  }

  // 10d. SHRINK past the five bookings, then each choice
  {
    // MOVE: the five move to the nearest free slot (10:00, which has five free seats)
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id);
    const ask = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "10:00" }));
    check(ask?.code === "NEEDS_RESOLUTION" && ask.impact.affectedBookings.length === 5, "starting at 10:00 affects all five 09:00 bookings and asks what to do");
    check((await slotTimes(doc.id, date)).join() === "09:00,10:00", "nothing is saved yet");

    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "10:00" }, { resolution: "MOVE" });
    const out = await E.resolveAffectedBookings("MOVE", applied.impact.affectedBookings, doctorIo(doc), resolveOpts);
    check(out.moved.length === 5 && out.kept.length === 0 && out.cancelled.length === 0, "MOVE places all five patients");
    check((await Promise.all(five.map((a) => placeOf(a.id)))).every((p) => p === `${date} 10:00 BOOKED`), "all five now sit in the 10:00 slot and are still booked");
    check(/5 appointments were moved/.test(out.summary), "the summary says five appointments were moved");
    const only = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots;
    check(only.length === 1 && only[0].startTime === "10:00" && only[0].seatsLeft === 0, "the shortened session is full again, so there is no overbooking");
  }
  {
    // MOVE with too few free seats: three move, two stay booked (never lost)
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id);
    await book(doc.id, date, "10:00", "11:00", s.id);
    await book(doc.id, date, "10:00", "11:00", s.id);
    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "10:00" }, { resolution: "MOVE" });
    // Only that one day is open for moving (next week's session would otherwise take the other two).
    const out = await E.resolveAffectedBookings("MOVE", applied.impact.affectedBookings, doctorIo(doc), { ...resolveOpts, lastBookableDate: date });
    check(out.moved.length === 3 && out.kept.length === 2, "with only three free seats, three patients move and two cannot");
    const places = await Promise.all(five.map((a) => placeOf(a.id)));
    check(places.filter((p) => p === `${date} 10:00 BOOKED`).length === 3 && places.filter((p) => p === `${date} 09:00 BOOKED`).length === 2, "the two who could not move are still booked at 09:00");
    check(places.every((p) => p.endsWith("BOOKED")), "none of the five was cancelled or lost");
    check(/2 appointments could not be changed and stay booked as before/.test(out.summary), "the summary names the two that stay");
    const slot = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots[0];
    check(slot.bookedCount === 5 && slot.seatsLeft === 0, "the 10:00 slot never goes above its capacity of five");
  }
  {
    // CANCEL: all five cancelled by the doctor and their seats freed
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id);
    const ok = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "10:00" }, { resolution: "CANCEL" });
    const out = await E.resolveAffectedBookings("CANCEL", ok.impact.affectedBookings, doctorIo(doc), resolveOpts);
    check(out.cancelled.length === 5 && out.moved.length === 0, "CANCEL cancels all five");
    check((await Promise.all(five.map((a) => statusOf(a.id)))).every((st) => st === "CANCELLED"), "all five appointments are now cancelled");
    check(/5 appointments were cancelled \(paid ones refunded in full\)/.test(out.summary), "the summary says paid appointments are refunded in full");
  }
  {
    // KEEP: nothing moves
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id);
    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { startTime: "10:00" }, { resolution: "KEEP" });
    const out = await E.resolveAffectedBookings("KEEP", applied.impact.affectedBookings, doctorIo(doc), resolveOpts);
    check(out.kept.length === 5 && out.moved.length === 0 && out.cancelled.length === 0, "KEEP changes nothing");
    check((await Promise.all(five.map((a) => placeOf(a.id)))).every((p) => p === `${date} 09:00 BOOKED`), "all five stay booked at 09:00");
  }
  {
    // Shrinking the END past the last slot: the five in 10:00 move back to the nearest slot, 09:00
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00" }));
    const five = await bookFive(doc.id, s.id, "10:00", "11:00");
    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "10:00" }, { resolution: "MOVE" });
    check(applied.impact.slotsRemoved.join() === "10:00" && applied.impact.affectedBookings.length === 5, "ending at 10:00 removes the 10:00 slot and affects its five bookings");
    const out = await E.resolveAffectedBookings("MOVE", applied.impact.affectedBookings, doctorIo(doc), resolveOpts);
    check(out.moved.length === 5 && (await Promise.all(five.map((a) => placeOf(a.id)))).every((p) => p === `${date} 09:00 BOOKED`), "all five move to the 09:00 slot");
  }

  // ------------------------------------------------------------------ 11. the moving rules in isolation
  {
    const b = { id: "b1", appointmentDate: day(7), startTime: "10:30", endTime: "11:00" };
    const slot = (d: string, t: string, left = 1) => ({ date: d, sessionId: "s", startTime: t, endTime: t, seatsLeft: left });
    const ranked = E.rankRelocationCandidates(b, [slot(day(8), "10:30"), slot(day(7), "09:00"), slot(day(7), "11:00"), slot(day(7), "10:00"), slot(day(7), "12:00", 0), slot(day(6), "10:30")]);
    check(ranked.map((x) => `${x.date === day(7) ? "same" : "next"} ${x.startTime}`).join() === "same 10:00,same 11:00,same 09:00,next 10:30", "candidates: own day first, closest time first, full or earlier-dated slots excluded");

    // own day full -> next day
    const calls: string[] = [];
    const deps = {
      freeSlots: async (d: string) => (d === day(8) ? [slot(day(8), "10:00")] : []),
      move: async (_b: unknown, t: { date: string; startTime: string }) => {
        calls.push(`${t.date} ${t.startTime}`);
        return { ok: true };
      },
      cancel: async () => ({ ok: true }),
    };
    const o = await E.resolveAffectedBookings("MOVE", [b], deps, resolveOpts);
    check(o.moved.length === 1 && calls.join() === `${day(8)} 10:00`, "when the patient's own day is full they are moved to the next day with room");

    // a failed attempt falls through to the next candidate
    let tries = 0;
    const flaky = {
      ...deps,
      freeSlots: async (d: string) => (d === day(7) ? [slot(day(7), "10:00"), slot(day(7), "11:00")] : []),
      move: async (_b: unknown, t: { startTime: string }) => {
        tries++;
        return t.startTime === "10:00" ? { ok: false, message: "slot just filled" } : { ok: true };
      },
    };
    const o2 = await E.resolveAffectedBookings("MOVE", [b], flaky, resolveOpts);
    check(o2.moved.length === 1 && o2.moved[0].to.startTime === "11:00" && tries === 2, "if the best slot fills up at the last moment, the next best is used");

    // nothing anywhere -> stays booked; a failing cancel -> stays booked
    const none = await E.resolveAffectedBookings("MOVE", [b], { ...deps, freeSlots: async () => [] }, resolveOpts);
    check(none.moved.length === 0 && none.kept.length === 1, "with no free slot anywhere the booking simply stays booked");
    const failCancel = await E.resolveAffectedBookings("CANCEL", [b], { ...deps, cancel: async () => ({ ok: false, message: "payment gateway down" }) }, resolveOpts);
    check(failCancel.cancelled.length === 0 && failCancel.kept[0]?.reason === "payment gateway down", "a cancellation that fails leaves the booking in place and says why");
    const thrown = await E.resolveAffectedBookings("MOVE", [b], { ...deps, freeSlots: async () => [slot(day(7), "11:00")], move: async () => { throw new Error("boom"); } }, resolveOpts);
    check(thrown.kept.length === 1, "an error while moving never loses the booking");
    check(E.isBookingResolution("MOVE") && E.isBookingResolution("CANCEL") && E.isBookingResolution("KEEP") && !E.isBookingResolution("DELETE"), "only MOVE, CANCEL and KEEP are accepted choices");
  }

  // ------------------------------------------------------------------ 12. EVERY slot booked, then shrink: what happens to the bookings
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00", recurrence: "ONE_TIME", specificDate: date }));
    const nine = await bookFive(doc.id, s.id, "09:00", "10:00");
    const ten = await bookFive(doc.id, s.id, "10:00", "11:00");
    const slots = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0].slots;
    check(slots.length === 2 && slots.every((x) => x.seatsLeft === 0 && x.isBooked), "9-11 with two slots of 5 is completely full: 10 of 10 seats booked");

    // Shrink: the whole 10:00 slot goes. The doctor is told in advance nobody can be moved.
    const ask = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "10:00" }));
    check(ask?.code === "NEEDS_RESOLUTION" && ask.impact.affectedBookings.length === 5, "shrinking to 9-10 affects the five patients in the 10:00 slot");
    check(ask?.impact.relocationPreview?.movable === 0 && ask.impact.relocationPreview.stuck === 5, "the prompt already says none of them can be moved because every other slot is full");

    // MOVE with every slot full: nothing can be placed, nobody is lost.
    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "10:00" }, { resolution: "MOVE" });
    const out = await E.resolveAffectedBookings("MOVE", applied.impact.affectedBookings, doctorIo(doc), resolveOpts);
    check(out.moved.length === 0 && out.kept.length === 5, "MOVE finds no free seat, so all five stay booked");
    check((await Promise.all(ten.map((a) => placeOf(a.id)))).every((p) => p === `${date} 10:00 BOOKED`), "the five are still booked at 10:00");
    check((await Promise.all(nine.map((a) => placeOf(a.id)))).every((p) => p === `${date} 09:00 BOOKED`), "the five at 09:00 are untouched");
    check(/5 appointments could not be changed and stay booked as before/.test(out.summary), "the summary tells the doctor all five stay booked");
    check((await slotTimes(doc.id, date)).join() === "09:00", "new patients only see the shortened session");

  }
  {
    // Partial room: 2 free seats elsewhere, 5 affected -> preview says 2 movable, 3 stuck
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(fullHourSession(doc.id, { endTime: "11:00", recurrence: "ONE_TIME", specificDate: date }));
    await bookFive(doc.id, s.id, "10:00", "11:00");
    await book(doc.id, date, "09:00", "10:00", s.id);
    await book(doc.id, date, "09:00", "10:00", s.id);
    await book(doc.id, date, "09:00", "10:00", s.id);
    const ask = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "10:00" }));
    check(ask?.impact.relocationPreview?.movable === 2 && ask.impact.relocationPreview.stuck === 3, "with two free seats left in 09:00, the preview says 2 can be moved and 3 cannot");

    const pure = E.planRelocations(
      [1, 2, 3].map((n) => ({ id: `p${n}`, appointmentDate: date, startTime: "10:00", endTime: "11:00" })),
      (d) => (d === date ? [{ date, sessionId: "s", startTime: "09:00", endTime: "10:00", seatsLeft: 2 }] : []),
      resolveOpts
    );
    check(pure.movable === 2 && pure.stuck === 1, "planRelocations counts seats as they are used up");
  }

  console.log(`\nElastic scheduling tests: ${passed} checks passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error in elastic scheduling tests:", err);
  process.exit(1);
});
