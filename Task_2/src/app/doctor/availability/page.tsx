import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/actions/auth";
import { updateAvailabilityAction } from "@/actions/availability";
import { dbRepo } from "@/db/repo";
import { ArrowLeft, Clock3, Save, CalendarDays, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorAvailabilityPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DOCTOR") {
    redirect("/login?message=Please sign in to access availability management.");
  }

  const [doctor, availabilities] = await Promise.all([
    dbRepo.getDoctorById(user.profileId),
    dbRepo.getAvailabilitiesByDoctorId(user.profileId),
  ]);

  const days: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"> = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN"
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/doctor/dashboard"
        className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-bold hover:underline"
      >
        <ArrowLeft size={14} />
        <span>Back to Doctor Agenda</span>
      </Link>

      <div className="page-heading">
        <div>
          <div className="eyebrow">PHYSICIAN SCHEDULE · RECURRING OPD SHIFTS</div>
          <h1>Weekly Shift Management</h1>
          <p>
            Configure recurring clinic shifts, start/end hours, and appointment window durations for Dr. {doctor?.firstName} {doctor?.lastName}.
          </p>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="card-head">
          <div>
            <h2>7-Day Weekly Shift Roster</h2>
            <p>Patients will only see booking slots for days marked as Active.</p>
          </div>
          <Badge variant="blue">Auto-Calculated Slots</Badge>
        </div>

        <div className="divide-y divide-slate-100">
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
                className="py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <input type="hidden" name="dayOfWeek" value={day} />

                <div className="w-28">
                  <div className="font-bold text-slate-900 text-sm">{day}</div>
                  <div className="text-xs text-slate-400">
                    {shift.isActive ? (
                      <span className="text-emerald-600 font-semibold">● Active Shift</span>
                    ) : (
                      <span className="text-slate-400">○ Off Day</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Start:</span>
                    <Input
                      type="time"
                      name="startTime"
                      defaultValue={shift.startTime}
                      className="px-2 py-1 rounded-md border border-slate-200 text-slate-800 font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">End:</span>
                    <Input
                      type="time"
                      name="endTime"
                      defaultValue={shift.endTime}
                      className="px-2 py-1 rounded-md border border-slate-200 text-slate-800 font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium">Duration:</span>
                    <Select name="slotDurationMinutes" defaultValue={String(shift.slotDurationMinutes)}>
                      <SelectTrigger className="h-8 w-24 px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 20, 30, 45, 60].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Label className="flex items-center gap-2 cursor-pointer ml-2">
                    <Checkbox name="isActive" value="true" defaultChecked={shift.isActive} />
                    <span className="text-xs font-semibold text-slate-700">Open for Bookings</span>
                  </Label>
                </div>

                <Button variant="default"
                  type="submit"
                  className="text-xs py-1 px-3 self-end md:self-auto"
                >
                  <Save size={13} />
                  <span>Update Shift</span>
                </Button>
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
