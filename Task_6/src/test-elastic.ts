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

  // ------------------------------------------------------------------ 4. shrink past a booking needs confirmation and keeps it
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const early = await book(doc.id, date, "10:00", "10:30", s.id);
    const late = await book(doc.id, date, "11:30", "12:00", s.id);

    const refusal = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "11:00" }));
    check(refusal?.code === "NEEDS_CONFIRMATION", "shrinking past a booking asks for confirmation first");
    check(refusal?.impact.outsideBookings.length === 1 && refusal.impact.outsideBookings[0].id === late.id, "the prompt names the one booking that falls outside");
    check(!!refusal?.impact.outsideBookings[0].patientName && /Pat Elastic/.test(refusal.impact.outsideBookings[0].patientName), "...with the patient's name");
    check((await slotTimes(doc.id, date)).length === 4, "nothing changed while the doctor has not confirmed");

    const applied = await dbRepo.updateAvailabilitySessionWithImpact(doc.id, s.id, { endTime: "11:00" }, { acknowledgeOutsideBookings: true });
    check(applied.session.endTime === "11:00", "after confirming, the hours shrink");
    check(applied.impact.outsideBookings.length === 1, "the result still reports the booking outside the new hours");
    check(await unchanged(early.id, date, "10:00") && await unchanged(late.id, date, "11:30"), "BOTH appointments are still booked at their original times, none lost");
    check((await slotTimes(doc.id, date)).join() === "10:00,10:30", "new patients only see the shortened slots");
    check(!(await checkRequestedSlot(doc.id, date, "11:30")).ok, "the outside 11:30 slot cannot be booked by anyone else");
    check(/stays? booked outside the new hours/.test(applied.impact.summary), "the summary tells the doctor the booking stays");

    // Unrelated edits are not held up by the booking that is already outside.
    const renamed = await dbRepo.updateAvailabilitySession(doc.id, s.id, { name: "Short morning OPD", patientsPerWave: 2 });
    check(renamed.name === "Short morning OPD" && renamed.patientsPerWave === 2, "renaming or changing capacity is not blocked by an earlier outside booking");
    check(await unchanged(late.id, date, "11:30"), "the outside booking is still there after the unrelated edit");

    // Stretching back brings the slot back with the booking in it.
    await dbRepo.updateAvailabilitySession(doc.id, s.id, { endTime: "12:00" });
    const g = (await dbRepo.computeSessionGroups(doc.id, date)).groups[0];
    check(g.slots.length === 4 && g.slots.find((x) => x.startTime === "11:30")?.bookedCount === 1, "extending again restores the 11:30 slot, still holding that patient");
  }

  // ------------------------------------------------------------------ 5. a booking between the new slots refuses the change
  {
    const doc = await makeDoctor();
    const s = await dbRepo.createAvailabilitySession(weekly(doc.id, date));
    const a = await book(doc.id, date, "10:30", "11:00", s.id);

    const longer = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { slotDurationMinutes: 45 }, { acknowledgeOutsideBookings: true }));
    check(longer?.code === "OFF_GRID" && longer.impact.offGridBookings.length === 1, "longer slots that would swallow a booking are refused, even when confirming");
    const shifted = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "10:15" }, { acknowledgeOutsideBookings: true }));
    check(shifted?.code === "OFF_GRID", "starting 15 minutes later (so slots no longer line up with the booking) is refused");
    check(/reschedule or cancel/i.test(shifted?.message ?? ""), "the refusal explains what the doctor can do");
    const session = (await dbRepo.getAvailabilitiesByDoctorId(doc.id))[0];
    check(session.startTime === "10:00" && session.slotDurationMinutes === 30, "the session is unchanged after the refusal");
    check(await unchanged(a.id, date, "10:30"), "the booking is untouched");
    check(!!(await dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "09:00" })), "moving the start by whole slots is fine");
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
    const later = await blocked(() => dbRepo.updateAvailabilitySession(doc.id, s.id, { startTime: "09:00", slotDurationMinutes: 240 }, { acknowledgeOutsideBookings: true }));
    check(later?.code === "OFF_GRID", "moving the start of a whole-session window past a booking at the old start is refused");
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
    check(move?.code === "NEEDS_CONFIRMATION", "moving a one-date session off a booked day asks for confirmation");
    check(await unchanged(c.id, day(10), "15:00"), "the booking on the old date is untouched");
  }

  console.log(`\nElastic scheduling tests: ${passed} checks passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error in elastic scheduling tests:", err);
  process.exit(1);
});
