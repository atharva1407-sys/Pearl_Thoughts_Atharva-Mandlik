import Link from "next/link";
import { dbRepo } from "@/db/repo";

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ specialization?: string }>;
}) {
  const { specialization } = await searchParams;
  const allSpecializations = ["All", "Cardiology", "Dermatology", "Pediatrics", "Orthopedics", "General Medicine"];
  const selectedSpec = specialization || "All";
  const doctors = dbRepo.getAllDoctors(selectedSpec === "All" ? undefined : selectedSpec);

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs font-medium mb-3">
          <span>●</span>
          <span>Verified Specialists Directory</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Find a Doctor</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Select a clinical specialty to view physician schedules and reserve your consultation.
        </p>
      </div>

      {/* Specialization Filter Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {allSpecializations.map((spec) => {
          const isActive = selectedSpec.toLowerCase() === spec.toLowerCase();
          return (
            <Link
              key={spec}
              href={spec === "All" ? "/doctors" : `/doctors?specialization=${spec}`}
              className={`px-3.5 py-2 rounded-xl transition-all font-medium ${
                isActive
                  ? "bg-white text-zinc-950 font-bold shadow-md"
                  : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700"
              }`}
            >
              {spec}
            </Link>
          );
        })}
      </div>

      {/* Doctor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {doctors.map((doctor) => (
          <div
            key={doctor.id}
            className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4 shadow-xs"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 mb-2">
                    {doctor.specialization}
                  </span>
                  <h3 className="font-bold text-white text-base">Dr. {doctor.firstName} {doctor.lastName}</h3>
                  <div className="text-xs text-zinc-500">License: #{doctor.licenseNumber}</div>
                </div>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 mt-1.5" title="Available"></span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                {doctor.bio}
              </p>

              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                <span>Consultation: <strong className="text-white font-semibold">${doctor.consultationFee}</strong></span>
                <span>Experience: <strong className="text-zinc-200">{doctor.experienceYears} yrs</strong></span>
              </div>
            </div>

            <Link
              href={`/doctors/${doctor.id}`}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs text-center transition-colors border border-zinc-700 block"
            >
              Select & View Time Slots →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
