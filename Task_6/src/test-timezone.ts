/**
 * Timezone safety tests. Appointment times are hospital time (Asia/Kolkata), but production servers
 * (Vercel) run in UTC. Every rule below must give the same answer whatever timezone the server uses,
 * so this file re-runs itself under several server timezones.
 */

process.env.DATABASE_URL = "disabled-for-local-test";
process.env.USE_MOCK_PAYMENTS = "true";
process.env.ENABLE_SEED_DATA = "false";

import { spawnSync } from "child_process";

const ZONES = ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"];

async function runChecks(): Promise<number> {
  const { computeRefund } = await import("./lib/refund-policy");
  const { hasAppointmentStarted, checkRequestedSlot } = await import("./lib/booking-rules");
  const { buildSessionSlotGroups, toLocalDateString, dayOfWeekFor } = await import("./db/repo");
  const { istDateString, istMinutesOfDay } = await import("./lib/time");

  let failed = 0;
  const check = (ok: boolean, name: string) => {
    if (!ok) {
      failed++;
      console.error(`  ❌ FAIL [${process.env.TZ}]: ${name}`);
    }
  };

  // Appointment: 2026-11-10 10:00 IST = 2026-11-10T04:30:00Z
  const base = { appointmentDate: "2026-11-10", startTime: "10:00", cancelledBy: "PATIENT" as const, amountPaidPaise: 100000 };
  const refundAt = (iso: string) => computeRefund({ ...base, now: new Date(iso) });

  check(refundAt("2026-11-09T04:30:00Z").refundPercentage === 100, "exactly 24h before start refunds 100%");
  check(refundAt("2026-11-09T05:00:00Z").refundPercentage === 50, "23.5h before start refunds 50%");
  check(refundAt("2026-11-09T20:00:00Z").refundPercentage === 50, "8.5h before start refunds 50%");
  check(refundAt("2026-11-10T02:30:00Z").refundPercentage === 50, "exactly 2h before start refunds 50%");
  check(refundAt("2026-11-10T02:31:00Z").refundPercentage === 0, "under 2h before start refunds 0%");
  check(Math.abs(refundAt("2026-11-09T04:30:00Z").hoursUntilStart - 24) < 0.001, "hours until start is measured in hospital time");

  const visit = { appointmentDate: "2026-11-10", startTime: "09:00" };
  check(!hasAppointmentStarted(visit, new Date("2026-11-10T03:00:00Z")), "08:30 IST: a 09:00 visit has not started");
  check(hasAppointmentStarted(visit, new Date("2026-11-10T04:00:00Z")), "09:30 IST: a 09:00 visit has started");

  check(toLocalDateString(new Date("2026-11-09T19:00:00Z")) === "2026-11-10", "00:30 IST on the 10th is the 10th, not the 9th");
  check(toLocalDateString(new Date("2026-11-10T18:00:00Z")) === "2026-11-10", "23:30 IST on the 10th is still the 10th");
  check(istDateString(new Date("2026-11-10T18:30:00Z")) === "2026-11-11", "00:00 IST rolls over to the next day");
  check(istMinutesOfDay(new Date("2026-11-10T04:30:00Z")) === 600, "04:30Z is minute 600 (10:00) in IST");

  const date = "2026-11-10";
  const session = {
    id: "s1",
    doctorId: "d1",
    name: "Morning",
    dayOfWeek: dayOfWeekFor(date),
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMinutes: 30,
    isActive: true,
    schedulingType: "STREAM" as const,
    patientsPerWave: 1,
  };
  // 10:00 IST: the 09:00, 09:30 and 10:00 slots are gone, and the next 15 minutes are too soon.
  const groups = buildSessionSlotGroups([session as any], [], date, new Date("2026-11-10T04:30:00Z"));
  const slots = groups[0]?.slots ?? [];
  const open = (t: string) => slots.find((s) => s.startTime === t && !s.isBooked) !== undefined;
  check(!open("09:00") && !open("09:30") && !open("10:00"), "slots earlier than now (hospital time) cannot be booked");
  check(open("11:00") && open("12:30"), "later slots stay open");
  const earlyGroups = buildSessionSlotGroups([session as any], [], date, new Date("2026-11-09T19:00:00Z")); // 00:30 IST on the 10th
  check((earlyGroups[0]?.slots ?? []).filter((s) => !s.isBooked).length === 8, "at 00:30 IST the whole day is still open");

  const futureDay = istDateString(new Date(Date.now() + 3 * 86_400_000));
  const refused = await checkRequestedSlot("missing-doctor", istDateString(new Date(Date.now() - 2 * 86_400_000)), "10:00");
  check(!refused.ok, "a past date is refused");
  const far = await checkRequestedSlot("missing-doctor", istDateString(new Date(Date.now() + 40 * 86_400_000)), "10:00");
  check(!far.ok && /30 days/.test(far.error), "a date beyond the booking window is refused");
  check(futureDay.length === 10, "date helper returns a plain date");

  return failed;
}

async function main() {
  if (process.env.TZ_CHILD) {
    const failed = await runChecks();
    process.exit(failed ? 1 : 0);
  }

  let total = 0;
  for (const tz of ZONES) {
    const res = spawnSync(`npx --yes tsx "${__filename}"`, {
      env: { ...process.env, TZ: tz, TZ_CHILD: "1" },
      shell: true,
      encoding: "utf8",
    });
    const ok = res.status === 0;
    console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}: timezone rules hold with the server in ${tz}`);
    if (!ok) {
      total++;
      console.error((res.stderr || "").split("\n").filter((l) => l.includes("FAIL")).join("\n"));
    }
  }
  console.log(`\nTimezone tests: ${ZONES.length - total} passed, ${total} failed (of ${ZONES.length})`);
  process.exit(total ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error in test suite:", err);
  process.exit(1);
});
