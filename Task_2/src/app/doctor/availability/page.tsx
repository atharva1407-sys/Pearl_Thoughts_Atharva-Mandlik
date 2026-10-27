import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { updateAvailabilityAction } from "@/actions/availability";
import { dbRepo } from "@/db/repo";

export default async function DoctorAvailabilityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in to access availability management.");
  }

  const doctor = dbRepo.getDoctorById(user.profileId);
  const availabilities = dbRepo.getAvailabilitiesByDoctorId(user.profileId);

  const days: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"> = [
    "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/doctor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors mb-3"
        >
          ← Back to Doctor Dashboard
        </Link>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs font-medium ml-4">
          <span>●</span>
          <span>Shift Configurator</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white mt-1">Weekly Shift Management</h1>
        <p className="text-xs text-zinc-400">
          Configure recurring clinic shifts and consultation window durations for Dr. {doctor?.firstName} {doctor?.lastName}.
        </p>
      </div>

      <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <h2 className="font-bold text-white text-base">Recurring Weekly Shifts</h2>
        <p className="text-xs text-zinc-500">
          Time slots will automatically calculate for patients based on your active days and slot durations.
        </p>

        <div className="divide-y divide-zinc-800/80">
          {days.map((day) => {
            const shift = availabilities.find((a) => a.dayOfWeek === day) || {
              dayOfWeek: day,
              startTime: "09:00",
              endTime: "17:00",
              slotDurationMinutes: 30,
              isActive: false,
            };

            return (
              <form
                key={day}
                action={async (formData: FormData) => {
                  "use server";
                  await updateAvailabilityAction(formData);
                }}
                className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <input type="hidden" name="dayOfWeek" value={day} />

                <div className="w-24">
                  <div className="font-bold text-white text-sm">{day}</div>
                  <div className="text-[11px] text-zinc-500">
                    {shift.isActive ? "Holding Shifts" : "Off Day"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Start:</span>
                    <input
                      type="time"
                      name="startTime"
                      defaultValue={shift.startTime}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-white font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">End:</span>
                    <input
                      type="time"
                      name="endTime"
                      defaultValue={shift.endTime}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-white font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Slot:</span>
                    <select
                      name="slotDurationMinutes"
                      defaultValue={shift.slotDurationMinutes}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-white text-xs focus:outline-none"
                    >
                      <option value="15">15 mins</option>
                      <option value="20">20 mins</option>
                      <option value="30">30 mins</option>
                      <option value="45">45 mins</option>
                      <option value="60">60 mins</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      value="true"
                      defaultChecked={shift.isActive}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-500 focus:ring-0"
                    />
                    <span className="text-xs text-zinc-300 font-medium">Shift Active</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
                >
                  Save Shift
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
