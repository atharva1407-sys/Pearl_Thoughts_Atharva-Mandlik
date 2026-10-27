import { notFound } from "next/navigation";
import Link from "next/link";
import { dbRepo } from "@/db/repo";
import { getCurrentUser } from "@/actions/auth";
import { SlotPicker } from "@/components/slot-picker";

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doctor = dbRepo.getDoctorById(id);
  if (!doctor) {
    notFound();
  }

  const currentUser = await getCurrentUser();
  const isLoggedInPatient = currentUser?.role === "PATIENT";
  const availabilities = dbRepo.getAvailabilitiesByDoctorId(doctor.id);
  const activeDays = availabilities.filter((a) => a.isActive).map((a) => a.dayOfWeek);

  return (
    <div className="space-y-6">
      <Link
        href="/doctors"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
      >
        ← Back to Specialist Directory
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Doctor Profile Card */}
        <div className="p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-5 h-fit">
          <div className="space-y-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
              {doctor.specialization}
            </span>
            <h1 className="text-2xl font-bold text-white">Dr. {doctor.firstName} {doctor.lastName}</h1>
            <p className="text-xs text-zinc-500">License: #{doctor.licenseNumber}</p>
          </div>

          <div className="space-y-3 border-t border-b border-zinc-800/80 py-4 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Consultation Fee</span>
              <span className="font-bold text-white text-sm">${doctor.consultationFee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Clinical Experience</span>
              <span className="font-medium text-zinc-300">{doctor.experienceYears} years</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Working Days</span>
              <span className="font-medium text-indigo-400">{activeDays.join(", ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone Contact</span>
              <span className="font-mono text-zinc-400">{doctor.phone}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wide">Physician Biography</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {doctor.bio}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-1 text-xs">
            <div className="font-semibold text-zinc-300">Appointment Guidelines</div>
            <p className="text-zinc-500 text-[11px] leading-relaxed">
              Patients can cancel scheduled appointments up to 1 hour before slot commencement through their dashboard.
            </p>
          </div>
        </div>

        {/* Right Column: Slot Picker */}
        <div className="lg:col-span-2">
          <SlotPicker
            doctorId={doctor.id}
            doctorName={`${doctor.firstName} ${doctor.lastName}`}
            consultationFee={doctor.consultationFee}
            isLoggedInPatient={isLoggedInPatient}
          />
        </div>
      </div>
    </div>
  );
}
