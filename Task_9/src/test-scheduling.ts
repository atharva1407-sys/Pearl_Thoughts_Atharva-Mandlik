/**
 * Wave & Stream scheduling tests: one-time (specific date) sessions, recurring sessions by weekday,
 * recurring sessions by date of the month, optional from/until date ranges, configurable capacity for
 * both Stream and Wave, overlap rules across all of these, and the booking engine honouring them.
 *
 * Every date is relative to "today" in hospital time, so the suite keeps working as the calendar moves.
 * It re-runs itself under several server timezones because "which day is it" must not depend on them.
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "false";

import { spawnSync } from "child_process";

const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Auckland"];

async function runChecks(): Promise<{ passed: number; failed: number }> {
  const S = await import("./lib/session-schedule");
  const { dbRepo } = await import("./db/repo");
  const { checkRequestedSlot } = await import("./lib/booking-rules");
  const { sessionSchema } = await import("./lib/validators");
  const { istDateString } = await import("./lib/time");

  let passed = 0;
  let failed = 0;
  const check = (ok: boolean, name: string) => {
    if (ok) {
      passed++;
    } else {
      failed++;
      console.error(`  ❌ FAIL [${process.env.TZ ?? "default"}]: ${name}`);
    }
  };
  const throws = async (fn: () => Promise<unknown>, pattern: RegExp): Promise<boolean> => {
    try {
      await fn();
      return false;
    } catch (err: any) {
      return pattern.test(String(err?.message));
    }
  };

  const today = istDateString(new Date());
  const day = (offset: number) => S.addDaysToDate(today, offset);
  const dom = (date: string) => Number(date.slice(8, 10));

  // ------------------------------------------------------------------ 1. pure rules
  check(S.isRealDate("2026-12-31") && !S.isRealDate("2026-02-30") && !S.isRealDate("2026-13-01") && !S.isRealDate("12-01-2026"), "isRealDate rejects impossible dates");
  check(S.weekdayOfDate("2026-12-01") === "TUE" && S.weekdayOfDate("2026-11-29") === "SUN", "weekdayOfDate is correct");
  check(S.addDaysToDate("2026-12-31", 1) === "2027-01-01" && S.addDaysToDate("2028-02-28", 1) === "2028-02-29", "addDaysToDate crosses month, year and leap day");

  const weekly = { recurrence: "WEEKLY" as const, dayOfWeek: "MON" as const, isActive: true };
  check(S.sessionAppliesOnDate(weekly, "2026-12-07") && !S.sessionAppliesOnDate(weekly, "2026-12-08"), "weekly runs only on its weekday");
  check(!S.sessionAppliesOnDate({ ...weekly, isActive: false }, "2026-12-07"), "an inactive session never runs");
  check(S.sessionAppliesOnDate({ dayOfWeek: "MON" }, "2026-12-07"), "a legacy session with no recurrence fields is weekly");

  const ranged = { ...weekly, validFrom: "2026-12-07", validUntil: "2026-12-21" };
  check(
    S.sessionAppliesOnDate(ranged, "2026-12-07") &&
      S.sessionAppliesOnDate(ranged, "2026-12-14") &&
      S.sessionAppliesOnDate(ranged, "2026-12-21") &&
      !S.sessionAppliesOnDate(ranged, "2026-11-30") &&
      !S.sessionAppliesOnDate(ranged, "2026-12-28"),
    "a from/until range limits a weekly session, both ends inclusive"
  );
  check(S.sessionAppliesOnDate({ ...weekly, validFrom: "2026-12-07" }, "2027-06-07"), "a from-date alone has no end");
  check(!S.sessionAppliesOnDate({ ...weekly, validUntil: "2026-12-07" }, "2026-12-14"), "an until-date alone stops the session");

  const monthly = { recurrence: "MONTHLY_DATE" as const, dayOfMonth: 1, isActive: true };
  check(S.sessionAppliesOnDate(monthly, "2026-12-01") && S.sessionAppliesOnDate(monthly, "2027-01-01") && !S.sessionAppliesOnDate(monthly, "2026-12-02"), "monthly runs on its date every month");
  check(!S.sessionAppliesOnDate({ ...monthly, dayOfMonth: 31 }, "2026-11-30") && S.sessionAppliesOnDate({ ...monthly, dayOfMonth: 31 }, "2026-12-31"), "monthly on the 31st skips months without a 31st");
  check(!S.sessionAppliesOnDate({ ...monthly, validUntil: "2026-12-31" }, "2027-01-01"), "a monthly session respects its until-date");

  const oneTime = { recurrence: "ONE_TIME" as const, specificDate: "2026-12-05", isActive: true };
  check(S.sessionAppliesOnDate(oneTime, "2026-12-05") && !S.sessionAppliesOnDate(oneTime, "2026-12-12") && !S.sessionAppliesOnDate(oneTime, "2026-12-04"), "a one-time session runs on its date only and never repeats");
  check(!S.sessionAppliesOnDate({ ...oneTime, validFrom: "2027-01-01" }, "2026-12-05") === false, "range fields are ignored for a one-time session");

  check(S.validateScheduleShape({ recurrence: "WEEKLY" }) !== null, "weekly without a weekday is invalid");
  check(S.validateScheduleShape({ recurrence: "MONTHLY_DATE", dayOfMonth: 0 }) !== null && S.validateScheduleShape({ recurrence: "MONTHLY_DATE", dayOfMonth: 32 }) !== null, "day of month must be 1-31");
  check(S.validateScheduleShape({ recurrence: "ONE_TIME", specificDate: "2026-02-30" }) !== null && S.validateScheduleShape({ recurrence: "ONE_TIME" }) !== null, "a one-time session needs a real date");
  check(S.validateScheduleShape({ ...weekly, validFrom: "2026-12-10", validUntil: "2026-12-01" }) !== null, "until must not be before from");
  check(S.validateScheduleShape({ ...monthly, dayOfMonth: 31, validFrom: "2026-12-01", validUntil: "2026-12-15" }) !== null, "a range containing no matching date is refused");
  check(S.validateScheduleShape({ ...weekly, validFrom: "2026-12-01", validUntil: "2026-12-31" }) === null, "a sensible weekly range is valid");
  check(S.validateScheduleNotInPast({ recurrence: "ONE_TIME", specificDate: day(-1) }, today) !== null && S.validateScheduleNotInPast({ recurrence: "ONE_TIME", specificDate: today }, today) === null, "a one-time session can't be in the past, but today is fine");
  check(S.validateScheduleNotInPast({ ...weekly, validUntil: day(-1) }, today) !== null, "a recurring session can't already have ended");

  const norm = S.normalizeSchedule({ recurrence: "ONE_TIME", specificDate: "2026-12-05", dayOfWeek: "MON", dayOfMonth: 4, validFrom: "2026-01-01" });
  check(norm.dayOfWeek === "SAT" && norm.dayOfMonth === null && norm.validFrom === null, "normalize keeps only the fields a one-time session uses (and records its weekday)");
  const normMonthly = S.normalizeSchedule({ recurrence: "MONTHLY_DATE", dayOfMonth: 15, dayOfWeek: "MON", specificDate: "2026-12-05" });
  check(normMonthly.dayOfWeek === null && normMonthly.specificDate === null && normMonthly.dayOfMonth === 15, "normalize drops weekday and date from a monthly session");

  check(S.describeSchedule(weekly) === "Every MON", "describe: weekly");
  check(S.describeSchedule(ranged) === "Every MON · 7 Dec 2026 to 21 Dec 2026", "describe: weekly with a range");
  check(S.describeSchedule(monthly) === "1st of every month" && S.describeSchedule({ ...monthly, dayOfMonth: 22 }) === "22nd of every month", "describe: monthly");
  check(S.describeSchedule(oneTime) === "Only 5 Dec 2026 (SAT)", "describe: one date");
  check(S.ordinal(11) === "11th" && S.ordinal(12) === "12th" && S.ordinal(13) === "13th" && S.ordinal(23) === "23rd" && S.ordinal(30) === "30th", "ordinals");
  check(S.summarizeSchedule([weekly, { ...weekly, dayOfWeek: "WED" }, monthly, { ...oneTime, specificDate: day(3) }], today) === "MON, WED · 1st of month · 1 special date", "profile summary lists weekdays, monthly dates and one-off dates");

  const shared = (a: any, b: any) => S.firstSharedDate(a, b, today);
  check(shared(weekly, { ...weekly, dayOfWeek: "TUE" }) === null, "different weekdays never share a date");
  check(shared(weekly, weekly) !== null, "same weekday shares dates");
  check(shared({ ...weekly, validFrom: day(0), validUntil: day(10) }, { ...weekly, validFrom: day(20), validUntil: day(40) }) === null, "same weekday with disjoint date ranges never shares a date");
  check(shared(weekly, { recurrence: "MONTHLY_DATE", dayOfMonth: 15 }) !== null, "a weekday and a date of the month do meet eventually");
  const oneOffDate = day(9);
  check(shared({ recurrence: "ONE_TIME", specificDate: oneOffDate }, { recurrence: "WEEKLY", dayOfWeek: S.weekdayOfDate(oneOffDate) }) === oneOffDate, "a one-time session shares its date with the matching weekly session");
  check(shared({ recurrence: "ONE_TIME", specificDate: oneOffDate }, { recurrence: "WEEKLY", dayOfWeek: S.weekdayOfDate(day(10)) }) === null, "...but not with another weekday");

  // ------------------------------------------------------------------ 2. validator
  const base = { name: "Clinic", startTime: "10:00", endTime: "12:00", slotDurationMinutes: "30", isActive: true, schedulingType: "STREAM", patientsPerWave: "1" };
  const fromForm = sessionSchema.safeParse({ ...base, recurrence: "ONE_TIME", dayOfWeek: "", dayOfMonth: "", specificDate: "2026-12-05", validFrom: "", validUntil: "" });
  check(fromForm.success && fromForm.data.specificDate === "2026-12-05" && fromForm.data.dayOfWeek === undefined && fromForm.data.dayOfMonth === undefined, "form values left blank are treated as not provided");
  check(!sessionSchema.safeParse({ ...base, patientsPerWave: "0" }).success && !sessionSchema.safeParse({ ...base, patientsPerWave: "21" }).success, "capacity must be 1-20");
  check(sessionSchema.safeParse({ ...base, schedulingType: "STREAM", patientsPerWave: "5" }).success, "a Stream session may have a capacity above 1");
  check(!sessionSchema.safeParse({ ...base, recurrence: "DAILY" }).success, "an unknown recurrence is rejected");
  check(!sessionSchema.safeParse({ ...base, specificDate: "05/12/2026" }).success, "dates must be YYYY-MM-DD");

  // ------------------------------------------------------------------ helpers for repo-level checks
  let counter = 0;
  const makeDoctor = async () => {
    counter++;
    const tag = `${Date.now()}-${counter}`;
    const user = await dbRepo.createUser({ id: `usr-sched-${tag}`, email: `sched.${tag}@example.com`, passwordHash: "x", role: "DOCTOR", isActive: true });
    return dbRepo.createDoctor({
      id: `doc-sched-${tag}`,
      userId: user.id,
      firstName: "Sched",
      lastName: `Doc${counter}`,
      specialization: "General",
      phone: "+91 20 0000 0000",
      licenseNumber: `SCHED-${tag}`,
      experienceYears: 5,
      consultationFee: 500,
    });
  };
  const sessionInput = (doctorId: string, extra: Record<string, unknown> = {}) => ({
    doctorId,
    name: "Clinic",
    startTime: "10:00",
    endTime: "12:00",
    slotDurationMinutes: 30,
    isActive: true,
    schedulingType: "STREAM" as const,
    patientsPerWave: 1,
    ...extra,
  });
  const groupsOn = async (doctorId: string, date: string) => (await dbRepo.computeSessionGroups(doctorId, date)).groups;
  let booker = 0;
  // Real patient rows, so the same checks also pass against a real Postgres database (foreign keys).
  const book = async (doctorId: string, date: string, startTime: string, endTime: string, sessionId?: string) => {
    const n = ++booker;
    const tag = `${Date.now()}-${n}`;
    const user = await dbRepo.createUser({ id: `usr-schedpat-${tag}`, email: `schedpat.${tag}@example.com`, passwordHash: "x", role: "PATIENT", isActive: true });
    const patient = await dbRepo.createPatient({ id: `pat-sched-${tag}`, userId: user.id, firstName: "Pat", lastName: `Sched${n}`, phone: "+91 98765 00000" });
    return dbRepo.createAppointment({ patientId: patient.id, doctorId, sessionId, appointmentDate: date, startTime, endTime, reason: "Scheduling test" });
  };

  // ------------------------------------------------------------------ 3. one-time (specific date) session
  {
    const doc = await makeDoctor();
    const date = day(10);
    const session = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { recurrence: "ONE_TIME", specificDate: date }));
    check(session.recurrence === "ONE_TIME" && session.specificDate === date && session.dayOfWeek === S.weekdayOfDate(date), "a one-time session is stored with its date");

    let wrong = 0;
    for (let i = 0; i <= 40; i++) {
      const d = day(i);
      const groups = await groupsOn(doc.id, d);
      if ((d === date) !== (groups.length === 1)) wrong++;
    }
    check(wrong === 0, "a one-time session appears on its date and on no other date (checked 41 days)");
    check((await groupsOn(doc.id, date))[0]?.slots.length === 4, "the one-time session produces its four 30-minute slots");

    check((await checkRequestedSlot(doc.id, date, "10:00")).ok, "a patient can book a slot on the one-time date");
    const nextWeek = await checkRequestedSlot(doc.id, S.addDaysToDate(date, 7), "10:00");
    check(!nextWeek.ok, "the same weekday a week later is not bookable");
    const earlier = await checkRequestedSlot(doc.id, day(3), "10:00");
    check(!earlier.ok && /not scheduled/.test(earlier.error), "a normal date gives a clear 'not scheduled' message");

    const open = await dbRepo.getNextOpenSlots([doc.id], Array.from({ length: 30 }, (_, i) => day(i)));
    check(open.get(doc.id)?.date === date, "the landing page's next-open-slot finder sees the one-time date");

    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "ONE_TIME", specificDate: day(-1) })), /past date/), "a one-time session in the past is refused");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "ONE_TIME", specificDate: "2026-02-30" })), /valid date/), "an impossible date is refused");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "ONE_TIME" })), /valid date/), "a one-time session without a date is refused");

    // Leave on that date blocks it
    await dbRepo.addDoctorLeave(doc.id, date, "Camp cancelled");
    const onLeave = await dbRepo.computeSessionGroups(doc.id, date);
    check(onLeave.isLeave && onLeave.groups.length === 0, "leave on the one-time date blocks the session");
    check(!(await checkRequestedSlot(doc.id, date, "10:00")).ok, "booking on a leave day is refused");
    await dbRepo.removeDoctorLeave(doc.id, date);
    check((await groupsOn(doc.id, date)).length === 1, "removing the leave brings the session back");

    // A booked one-time session can't be deleted
    const booked = await book(doc.id, date, "10:00", "10:30", session.id);
    check(booked.success, "a patient books the one-time session");
    check(await throws(() => dbRepo.deleteAvailabilitySession(doc.id, session.id).then((ok) => { if (!ok) throw new Error("not deleted"); }), /upcoming booked/), "a one-time session with a booking can't be deleted");
  }

  // ------------------------------------------------------------------ 4. weekly session limited to a date range
  {
    const doc = await makeDoctor();
    const from = day(2);
    const until = day(16);
    const weekdayCode = S.weekdayOfDate(from);
    const session = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { recurrence: "WEEKLY", dayOfWeek: weekdayCode, validFrom: from, validUntil: until }));
    check(session.validFrom === from && session.validUntil === until, "the date range is stored");

    let wrong = 0;
    let runs = 0;
    for (let i = 0; i <= 45; i++) {
      const d = day(i);
      const expected = S.weekdayOfDate(d) === weekdayCode && d >= from && d <= until;
      const actual = (await groupsOn(doc.id, d)).length === 1;
      if (expected) runs++;
      if (expected !== actual) wrong++;
    }
    check(wrong === 0 && runs === 3, `weekly + range runs on exactly the 3 matching dates and no others (checked 46 days, ${runs} runs)`);
    const afterUntil = await checkRequestedSlot(doc.id, S.addDaysToDate(until, 7), "10:00"); // inside the 30-day window, outside the range
    check(!afterUntil.ok && /not scheduled/.test(afterUntil.error), "a booking after the 'until' date is refused");
    const insideRange = await checkRequestedSlot(doc.id, S.addDaysToDate(from, 7), "10:00");
    check(insideRange.ok, "a booking inside the range on the matching weekday is accepted");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "WEEKLY", dayOfWeek: "MON", validFrom: day(10), validUntil: day(5) })), /on or after/), "until before from is refused");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "WEEKLY", dayOfWeek: "MON", validUntil: day(-3) })), /already in the past/), "a range that has already ended is refused");

    // Same weekday and hours but a range that does not touch the first one is fine; an overlapping range is not.
    const later = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { recurrence: "WEEKLY", dayOfWeek: weekdayCode, validFrom: day(23), validUntil: day(60) }));
    check(Boolean(later.id), "same weekday and hours with a later, separate date range is allowed");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { recurrence: "WEEKLY", dayOfWeek: weekdayCode, validFrom: day(10), validUntil: day(30) })), /overlaps with existing session/), "an overlapping date range with overlapping hours is refused");
  }

  // ------------------------------------------------------------------ 5. recurring by date of the month
  {
    const doc = await makeDoctor();
    const target = dom(day(5));
    const from = day(0);
    const until = day(70);
    const session = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { recurrence: "MONTHLY_DATE", dayOfMonth: target, validFrom: from, validUntil: until }));
    check(session.recurrence === "MONTHLY_DATE" && session.dayOfMonth === target && session.dayOfWeek === null, "a monthly session is stored with its date and no weekday");

    let wrong = 0;
    let runs = 0;
    for (let i = 0; i <= 75; i++) {
      const d = day(i);
      const expected = dom(d) === target && d >= from && d <= until;
      const actual = (await groupsOn(doc.id, d)).length === 1;
      if (expected) runs++;
      if (expected !== actual) wrong++;
    }
    check(wrong === 0 && runs >= 2, `monthly session runs only on the ${S.ordinal(target)} within its range (checked 76 days, ${runs} runs)`);
    check((await checkRequestedSlot(doc.id, day(5), "10:30")).ok, "a patient can book on the monthly date");
    check(!(await checkRequestedSlot(doc.id, day(6), "10:30")).ok, "the next day is not bookable");
    check((await dbRepo.getAvailabilitiesByDoctorId(doc.id)).length === 1, "the monthly session is listed for the doctor");

    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "MONTHLY_DATE" })), /between 1 and 31/), "a monthly session needs a date of the month");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "MONTHLY_DATE", dayOfMonth: 40 })), /between 1 and 31/), "date of the month above 31 is refused");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00", recurrence: "MONTHLY_DATE", dayOfMonth: 31, validFrom: "2099-01-01", validUntil: "2099-01-15" })), /never run/), "a monthly session whose range has no such date is refused");
  }

  // ------------------------------------------------------------------ 6. overlap rules across recurrence kinds
  {
    const doc = await makeDoctor();
    const date = day(12);
    const weekdayCode = S.weekdayOfDate(date);
    const otherWeekday = S.weekdayOfDate(day(13));
    await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "09:00", endTime: "13:00", recurrence: "WEEKLY", dayOfWeek: weekdayCode }));

    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "10:00", endTime: "12:00", recurrence: "ONE_TIME", specificDate: date })), /overlaps with existing session/), "a one-time session overlapping a weekly session that runs that day is refused");
    const offDay = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "10:00", endTime: "12:00", recurrence: "ONE_TIME", specificDate: day(13) }));
    check(offDay.dayOfWeek === otherWeekday, "a one-time session on a day the weekly session does not run is allowed");
    const evening = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "17:00", endTime: "19:00", recurrence: "ONE_TIME", specificDate: date }));
    check(Boolean(evening.id), "a one-time session at different hours on the same day is allowed");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "10:00", endTime: "11:00", recurrence: "MONTHLY_DATE", dayOfMonth: 15 })), /overlaps with existing session/), "a monthly session overlapping an open-ended weekly one is refused");
    check(await throws(() => dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "18:00", endTime: "20:00", recurrence: "ONE_TIME", specificDate: date })), /overlaps with existing session/), "two one-time sessions overlapping on one date are refused");

    // An inactive session is not an obstacle, and an inactive new session is not checked
    const sleeper = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "09:00", endTime: "13:00", recurrence: "WEEKLY", dayOfWeek: weekdayCode, isActive: false }));
    check(sleeper.isActive === false, "an inactive session may sit on top of an active one");
    check(await throws(() => dbRepo.updateAvailabilitySession(doc.id, sleeper.id, { isActive: true }), /overlaps with existing session/), "activating it is refused while it clashes");

    // Updates: change a one-time date, capacity-only edits and recurrence switches
    const moved = await dbRepo.updateAvailabilitySession(doc.id, offDay.id, { specificDate: day(14), patientsPerWave: 4 });
    check(moved.specificDate === day(14) && moved.patientsPerWave === 4 && moved.dayOfWeek === S.weekdayOfDate(day(14)), "a one-time session can be moved to another date and keeps the weekday in step");
    check(await throws(() => dbRepo.updateAvailabilitySession(doc.id, offDay.id, { specificDate: date }), /overlaps with existing session/), "moving a one-time session onto a clashing date is refused");
    const switched = await dbRepo.updateAvailabilitySession(doc.id, evening.id, { recurrence: "WEEKLY", dayOfWeek: otherWeekday });
    check(switched.recurrence === "WEEKLY" && switched.specificDate === null && switched.dayOfWeek === otherWeekday, "a one-time session can be turned into a weekly one");
    const toMonthly = await dbRepo.updateAvailabilitySession(doc.id, evening.id, { recurrence: "MONTHLY_DATE", dayOfMonth: 20 });
    check(toMonthly.recurrence === "MONTHLY_DATE" && toMonthly.dayOfWeek === null && toMonthly.dayOfMonth === 20, "...and into a monthly one");

    // Editing a session that already ended must not demand a future date
    const ended = { ...evening, id: "avail-ended", name: "Old camp", recurrence: "ONE_TIME" as const, specificDate: day(-5), dayOfWeek: S.weekdayOfDate(day(-5)), dayOfMonth: null, validFrom: null, validUntil: null, startTime: "06:00", endTime: "07:00" };
    const { db } = await import("./db/index");
    if (db) {
      const schema = await import("./db/schema");
      await db.insert(schema.availabilities).values({ ...ended, doctorId: doc.id });
    } else {
      (dbRepo as any).memAvailabilities.push(ended);
    }
    const renamed = await dbRepo.updateAvailabilitySession(doc.id, "avail-ended", { name: "Old camp (renamed)" });
    check(renamed.name === "Old camp (renamed)", "renaming a session whose date has passed is allowed");
    check(await throws(() => dbRepo.updateAvailabilitySession(doc.id, "avail-ended", { specificDate: day(-2) }), /past date/), "moving it to another past date is refused");
  }

  // ------------------------------------------------------------------ 7. Stream capacity is configurable
  {
    const doc = await makeDoctor();
    const date = day(4);
    const stream = await dbRepo.createAvailabilitySession(
      sessionInput(doc.id, { startTime: "14:00", endTime: "16:00", recurrence: "ONE_TIME", specificDate: date, schedulingType: "STREAM", patientsPerWave: 2 })
    );
    check(stream.schedulingType === "STREAM" && stream.patientsPerWave === 2, "a Stream session keeps the capacity the doctor set (it used to be forced to 1)");

    const group = (await groupsOn(doc.id, date))[0];
    check(group.slots.length === 4 && group.slots.every((s) => s.capacity === 2 && s.seatsLeft === 2), "every Stream slot offers the configured number of seats");

    const a = await book(doc.id, date, "14:00", "14:30", stream.id);
    const b = await book(doc.id, date, "14:00", "14:30", stream.id);
    const c = await book(doc.id, date, "14:00", "14:30", stream.id);
    check(a.success && b.success, "two patients can book the same Stream slot when capacity is 2");
    check(!c.success && /full capacity|already/.test(c.message), "a third booking in that slot is refused");
    check(a.appointment?.tokenNumber === 1 && b.appointment?.tokenNumber === 2, "patients in the slot get consecutive token numbers");

    const after = (await groupsOn(doc.id, date))[0];
    const full = after.slots.find((s) => s.startTime === "14:00")!;
    const other = after.slots.find((s) => s.startTime === "14:30")!;
    check(full.isBooked && full.seatsLeft === 0 && full.bookedCount === 2, "the full slot reports no seats left");
    check(!other.isBooked && other.seatsLeft === 2, "the neighbouring slot is untouched");

    const d = await book(doc.id, date, "14:30", "15:00", stream.id);
    check(d.success, "a patient books the neighbouring slot");
    const blocked = await dbRepo.rescheduleAppointment({ appointmentId: d.appointment!.id, newDate: date, newStartTime: "14:00", newEndTime: "14:30", newSessionId: stream.id, actorUserId: doc.userId, actorRole: "DOCTOR" });
    check(!blocked.success && /fully booked/.test(blocked.message), "rescheduling into a full Stream slot is refused");
    const moved = await dbRepo.rescheduleAppointment({ appointmentId: d.appointment!.id, newDate: date, newStartTime: "15:00", newEndTime: "15:30", newSessionId: stream.id, actorUserId: doc.userId, actorRole: "DOCTOR" });
    check(moved.success, "rescheduling into a Stream slot with free seats works");

    // The booking rules still derive the session (and so the capacity) from the doctor's schedule
    const gate = await checkRequestedSlot(doc.id, date, "15:30");
    check(gate.ok && gate.session.id === stream.id && gate.session.patientsPerWave === 2, "the booking gate returns the session with its configured capacity");

    // Without a session id the database layer works the session out from the doctor, date and time (Postgres only).
    const { db: liveDb } = await import("./db/index");
    if (liveDb) {
      const x = await book(doc.id, date, "15:30", "16:00");
      const y = await book(doc.id, date, "15:30", "16:00");
      const z = await book(doc.id, date, "15:30", "16:00");
      check(x.success && x.appointment?.sessionId === stream.id, "Postgres: a booking with no session id is matched to the right session by date and time");
      check(y.success && !z.success, "Postgres: capacity from the matched session is enforced");
    }

    // Capacity 1 Stream still behaves as before; Wave keeps its own capacity
    const single = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "08:00", endTime: "09:00", recurrence: "ONE_TIME", specificDate: date, patientsPerWave: 1 }));
    const first = await book(doc.id, date, "08:00", "08:30", single.id);
    const second = await book(doc.id, date, "08:00", "08:30", single.id);
    check(first.success && !second.success, "a Stream session with capacity 1 still allows one patient per slot");
    const wave = await dbRepo.createAvailabilitySession(sessionInput(doc.id, { startTime: "17:00", endTime: "18:00", recurrence: "ONE_TIME", specificDate: date, schedulingType: "WAVE", patientsPerWave: 3 }));
    const waveBookings = [await book(doc.id, date, "17:00", "17:30", wave.id), await book(doc.id, date, "17:00", "17:30", wave.id), await book(doc.id, date, "17:00", "17:30", wave.id), await book(doc.id, date, "17:00", "17:30", wave.id)];
    check(waveBookings.slice(0, 3).every((r) => r.success) && !waveBookings[3].success, "a Wave session still holds exactly its configured number of patients per slot");

    // Changing capacity on an existing session
    const raised = await dbRepo.updateAvailabilitySession(doc.id, single.id, { patientsPerWave: 2 });
    check(raised.patientsPerWave === 2 && (await book(doc.id, date, "08:00", "08:30", single.id)).success, "raising a Stream session's capacity frees seats immediately");
    const floor = await dbRepo.updateAvailabilitySession(doc.id, single.id, { patientsPerWave: 0 });
    check(floor.patientsPerWave >= 1, "capacity can never drop below 1");
  }

  // ------------------------------------------------------------------ 7b. Several one-off dates at once
  {
    const doc = await makeDoctor();
    const dates = [day(5), day(9), day(13), day(9)]; // one duplicate on purpose
    const made = await dbRepo.createSessionsForDates(sessionInput(doc.id, { patientsPerWave: 2 }), dates);
    check(made.length === 3 && made.every((m) => m.recurrence === "ONE_TIME" && m.patientsPerWave === 2), "one request creates one session per distinct date");
    check((await groupsOn(doc.id, day(9))).length === 1 && (await groupsOn(doc.id, day(10))).length === 0, "each created date has the session and nothing else does");

    const before = (await dbRepo.getAvailabilitiesByDoctorId(doc.id)).length;
    check(await throws(() => dbRepo.createSessionsForDates(sessionInput(doc.id, { startTime: "11:00", endTime: "13:00" }), [day(20), day(9)]), /overlaps with existing session/), "if any date clashes the whole request is refused");
    check((await dbRepo.getAvailabilitiesByDoctorId(doc.id)).length === before, "...and none of the other dates were created");
    check(await throws(() => dbRepo.createSessionsForDates(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00" }), [day(20), day(-1)]), /past date/), "a past date in the list refuses the whole request");
    check(await throws(() => dbRepo.createSessionsForDates(sessionInput(doc.id, { startTime: "15:00", endTime: "16:00" }), []), /at least one date/), "an empty list is refused");
  }

  // ------------------------------------------------------------------ 7c. A whole session as one slot (arrival window with a total capacity)
  {
    const doc = await makeDoctor();
    const date = day(3);
    check(sessionSchema.safeParse({ ...base, startTime: "10:00", endTime: "14:00", slotDurationMinutes: "240", patientsPerWave: "20" }).success, "a 4-hour slot length is accepted");
    const windowSession = await dbRepo.createAvailabilitySession(
      sessionInput(doc.id, { startTime: "10:00", endTime: "14:00", slotDurationMinutes: 240, patientsPerWave: 20, recurrence: "ONE_TIME", specificDate: date })
    );
    const slots = (await groupsOn(doc.id, date))[0].slots;
    check(slots.length === 1 && slots[0].startTime === "10:00" && slots[0].endTime === "14:00" && slots[0].seatsLeft === 20, "the whole session is a single slot with 20 seats");
    const gate = await checkRequestedSlot(doc.id, date, "10:00");
    check(gate.ok && gate.endTime === "14:00", "the booking gate accepts the window and returns its closing time");
    check(!(await checkRequestedSlot(doc.id, date, "11:00")).ok, "a start time inside the window (not at its start) is refused");
    let accepted = 0;
    let tokens: number[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await book(doc.id, date, "10:00", "14:00", windowSession.id);
      if (r.success) {
        accepted++;
        tokens.push(r.appointment!.tokenNumber ?? 0);
      }
    }
    check(accepted === 20, "exactly 20 patients are accepted and the 21st is refused");
    check(tokens.join() === Array.from({ length: 20 }, (_, i) => i + 1).join(), "patients are seen in token order 1 to 20");
  }

  // ------------------------------------------------------------------ 8. Existing weekly sessions are untouched
  {
    const doc = await makeDoctor();
    const weekdayCode = S.weekdayOfDate(day(6));
    const classic = await dbRepo.createAvailabilitySession({ doctorId: doc.id, name: "Classic", dayOfWeek: weekdayCode, startTime: "09:00", endTime: "11:00", slotDurationMinutes: 30, isActive: true, schedulingType: "STREAM", patientsPerWave: 1 });
    check(classic.recurrence === "WEEKLY" && classic.dayOfMonth === null && classic.specificDate === null && classic.validFrom === null, "creating a session the old way gives a plain weekly session");
    let hits = 0;
    for (let i = 0; i < 28; i++) if ((await groupsOn(doc.id, day(i))).length === 1) hits++;
    check(hits === 4, "a plain weekly session runs once a week, forever (4 times in 28 days)");
  }

  return { passed, failed };
}

async function main() {
  if (process.env.TZ_CHILD) {
    const { failed } = await runChecks();
    process.exit(failed ? 1 : 0);
  }

  const { passed, failed } = await runChecks();
  console.log(`Scheduling checks in the default timezone: ${passed} passed, ${failed} failed`);

  let zoneFailures = 0;
  for (const tz of ZONES) {
    const res = spawnSync(`npx --yes tsx "${__filename}"`, {
      env: { ...process.env, TZ: tz, TZ_CHILD: "1" },
      shell: true,
      encoding: "utf8",
    });
    const ok = res.status === 0;
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}: scheduling rules hold with the server in ${tz}`);
    if (!ok) {
      zoneFailures++;
      console.error((res.stderr || "").split("\n").filter((l) => l.includes("FAIL")).join("\n"));
    }
  }

  const bad = failed + zoneFailures;
  console.log(`\nScheduling tests: ${passed} checks passed, ${failed} failed; ${ZONES.length - zoneFailures}/${ZONES.length} timezones ok`);
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error in scheduling tests:", err);
  process.exit(1);
});
