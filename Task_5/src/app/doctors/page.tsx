import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dbRepo } from "@/db/repo";
import { getCurrentUser } from "@/actions/auth";
import { ArrowRight, Stethoscope, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ specialization?: string }>;
}) {
  const { specialization } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    // Keep the department filter (e.g. from a landing page tile) through the login round-trip.
    const returnTo = specialization ? `/doctors?specialization=${encodeURIComponent(specialization)}` : "/doctors";
    redirect(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
  }
  // Filter pills come from the specialties of doctors actually registered, so a new department appears automatically.
  const everyDoctor = await dbRepo.getAllDoctors();
  const allSpecializations = [
    "All",
    ...Array.from(new Set(everyDoctor.map((d) => d.specialization))).sort((a, b) => a.localeCompare(b)),
  ];
  const selectedSpec = specialization || "All";
  const doctors =
    selectedSpec === "All"
      ? everyDoctor
      : everyDoctor.filter((d) => d.specialization.toLowerCase() === selectedSpec.toLowerCase());

  const getDoctorInitials = (first: string, last: string) => {
    return `${first[0]}${last[0]}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLINICAL STAFF & OUTPATIENT DIRECTORY</div>
          <h1>Find a Medical Specialist</h1>
          <p>
            Browse verified hospital physicians and reserve conflict-free appointment time slots at Ruby Hall, Pune.
          </p>
        </div>
      </div>

      {/* Specialization Filter Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {allSpecializations.map((spec) => {
          const isActive = selectedSpec.toLowerCase() === spec.toLowerCase();
          return (
            <Link
              key={spec}
              href={spec === "All" ? "/doctors" : `/doctors?specialization=${encodeURIComponent(spec)}`}
              className={`px-3.5 py-1.5 rounded-lg transition-all font-semibold ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {spec}
            </Link>
          );
        })}
      </div>

      {/* Doctor Cards Grid */}
      {doctors.length === 0 ? (
        <Card className="py-12 text-center text-xs text-slate-500 space-y-2">
          <Stethoscope size={28} className="mx-auto text-slate-300" />
          <div className="font-bold text-slate-800 text-sm">No specialists currently listed</div>
          <p className="text-slate-400 max-w-md mx-auto m-0">
            Physicians will appear here as doctors register their hospital profiles, or when sample clinical staff data is activated.
          </p>
          <div className="pt-2">
            <Link href="/register" className="btn primary text-xs">
              + Register Doctor Profile
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {doctors.map((doctor) => (
            <Card
              key={doctor.id} className="flex flex-col justify-between space-y-4 hover:border-blue-200 transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  {doctor.profileImage ? (
                    <div className="relative w-12 h-12 flex-shrink-0 overflow-hidden rounded-xl bg-blue-50">
                      <Image
                        src={doctor.profileImage}
                        alt={`Dr. ${doctor.firstName} ${doctor.lastName}`}
                        fill
                        sizes="48px"
                        className="object-cover object-top"
                      />
                    </div>
                  ) : (
                    <div className="avatar w-12 h-12 text-sm bg-blue-100 text-blue-700 font-bold flex-shrink-0">
                      {getDoctorInitials(doctor.firstName, doctor.lastName)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <Badge variant="blue">
                        {doctor.specialization}
                      </Badge>
                      <span className="live-dot" title="Available for appointments" />
                    </div>
                    <h3 className="font-bold text-slate-900 text-base mt-1">
                      Dr. {doctor.firstName} {doctor.lastName}
                    </h3>
                    <div className="text-xs text-slate-400">
                      License: #{doctor.licenseNumber}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {doctor.bio}
                </p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Consultation:{" "}
                    <strong className="text-slate-900 font-bold">
                      ₹{doctor.consultationFee}
                    </strong>
                  </span>
                  <span>
                    Experience:{" "}
                    <strong className="text-slate-800">
                      {doctor.experienceYears} yrs
                    </strong>
                  </span>
                </div>
              </div>

              <Link
                href={`/doctors/${doctor.id}`}
                className="btn primary w-full justify-center text-xs"
              >
                <span>Select & View Time Slots</span>
                <ArrowRight size={14} />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
