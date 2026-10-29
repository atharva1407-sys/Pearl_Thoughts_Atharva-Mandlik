import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import {
  ArrowRight,
  Baby,
  Bone,
  Brain,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Eye,
  HeartPulse,
  IndianRupee,
  ScanFace,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Ticket,
} from "lucide-react";
import { getCurrentUser } from "@/actions/auth";
import { dbRepo, toLocalDateString, type DoctorEntity, type NextOpenSlot } from "@/db/repo";
import { RUBY_HALL_SPECIALISTS } from "@/db/specialists-catalog";
import SiteHeader from "@/components/landing/site-header";
import { Logo } from "@/components/landing/logo";
import { HOSPITAL_PHONE_DISPLAY, HOSPITAL_PHONE_TEL, HOSPITAL_SUPPORT_EMAIL } from "@/components/landing/contact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { absolute: "Medrella Healthcare — Book Doctor Appointments at Ruby Hall, Pune" },
  description:
    "Book appointments with specialists at Ruby Hall, Pune. See live availability, get your token instantly, and reschedule or cancel online.",
};

const container = "mx-auto max-w-[1200px] px-5 sm:px-8";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5b6b84]";
const sectionTitle = "text-[26px] font-bold tracking-tight text-[#14243d] sm:text-[28px]";
const BOOKING_WINDOW_DAYS = 7;
const FEATURED_DOCTOR_LIMIT = 8;

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: CalendarDays,
    title: "Easy Appointment Booking",
    text: "Find a specialist and book an open slot in seconds, with live availability.",
  },
  {
    icon: Stethoscope,
    title: "Experienced Doctors",
    text: "Consult experienced specialists across departments at Ruby Hall, Pune.",
  },
  {
    icon: ClipboardList,
    title: "Track Your Visits",
    text: "See upcoming appointments, token numbers and your visit history in one place.",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Secure",
    text: "Your account is protected with secure sign-in and encrypted connections.",
  },
];

// lucide-react has no female symbol, so Gynecology gets a matching hand-drawn one.
function VenusIcon(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="9" r="6" />
      <path d="M12 15v7M9 19h6" />
    </svg>
  );
}

type DepartmentStyle = { icon: ComponentType<LucideProps>; tile: string; tint: string };

const departmentStyles: Record<string, DepartmentStyle> = {
  "General Medicine": { icon: Stethoscope, tile: "bg-[#e5f6f3]", tint: "text-[#12998c]" },
  Cardiology: { icon: HeartPulse, tile: "bg-[#fdecee]", tint: "text-[#e5484d]" },
  Dermatology: { icon: ScanFace, tile: "bg-[#fdf2e6]", tint: "text-[#dd7a2c]" },
  Pediatrics: { icon: Baby, tile: "bg-[#e6f7ec]", tint: "text-[#1f9d55]" },
  Gynecology: { icon: VenusIcon, tile: "bg-[#fdebef]", tint: "text-[#e5484d]" },
  Orthopedics: { icon: Bone, tile: "bg-[#e8f0fd]", tint: "text-[#2563eb]" },
  Ophthalmology: { icon: Eye, tile: "bg-[#e6f0fd]", tint: "text-[#1d6fe0]" },
  "General Surgery": { icon: Syringe, tile: "bg-[#f1ebfe]", tint: "text-[#8b5cf6]" },
  Neurology: { icon: Brain, tile: "bg-[#fdf2e6]", tint: "text-[#c2410c]" },
};
// Departments added later through doctor signup still get a tile.
const defaultDepartmentStyle: DepartmentStyle = { icon: Stethoscope, tile: "bg-[#eef3fa]", tint: "text-[#1769e8]" };

const steps: { icon: LucideIcon; title: string; text: string; badge: string; bubble: string }[] = [
  {
    icon: CalendarDays,
    title: "Search & Book",
    text: "Choose a doctor and pick an open slot in their session.",
    badge: "bg-[#1769e8]",
    bubble: "bg-[#eaf2fe] text-[#1769e8]",
  },
  {
    icon: Ticket,
    title: "Get Your Token",
    text: "Receive a token number for your session as soon as you book.",
    badge: "bg-[#16a34a]",
    bubble: "bg-[#e7f7ec] text-[#16a34a]",
  },
  {
    icon: HeartPulse,
    title: "Visit & Get Care",
    text: "Arrive for your slot, or reschedule and cancel online if plans change.",
    badge: "bg-[#8b5cf6]",
    bubble: "bg-[#f1ebfe] text-[#8b5cf6]",
  },
];

function upcomingDates(days: number): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return toLocalDateString(d);
  });
}

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Today" / "Tomorrow" / weekday name, relative to the booking window that produced the slot. */
function dayLabel(date: string, dates: string[]): string {
  if (date === dates[0]) return "Today";
  if (date === dates[1]) return "Tomorrow";
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
}

function doctorName(doctor: Pick<DoctorEntity, "firstName" | "lastName">): string {
  return `Dr. ${doctor.firstName} ${doctor.lastName}`;
}

function initials(doctor: Pick<DoctorEntity, "firstName" | "lastName">): string {
  return `${doctor.firstName[0] ?? ""}${doctor.lastName[0] ?? ""}`.toUpperCase();
}

async function loadLandingData() {
  const dates = upcomingDates(BOOKING_WINDOW_DAYS);
  try {
    const doctors = await dbRepo.getAllDoctors();
    const nextSlots = await dbRepo.getNextOpenSlots(
      doctors.map((d) => d.id),
      dates
    );
    return { doctors, nextSlots, dates, failed: false };
  } catch (err) {
    // The marketing page must still render if the database is briefly unreachable.
    console.error("[landing] failed to load doctors:", err);
    return { doctors: [] as DoctorEntity[], nextSlots: new Map<string, NextOpenSlot>(), dates, failed: true };
  }
}

function HeroVisual({
  nextAvailable,
  nextAvailableHref,
  gpHref,
}: {
  nextAvailable: { doctor: DoctorEntity; slot: NextOpenSlot; label: string } | null;
  nextAvailableHref: string;
  gpHref: string;
}) {
  return (
    <div className="relative h-full w-full">
      <Image
        src="/images/hero-doctor.webp"
        alt="Doctor holding a tablet in the Medrella hospital lobby"
        fill
        priority
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="object-cover object-[85%_center]"
      />
      {/* Soft fade into the hero background; starts 1px outside the photo so a
          fractional left edge can't leak a faint line */}
      <div className="pointer-events-none absolute inset-y-0 -left-px hidden w-[calc(28%+1px)] bg-linear-to-r from-white via-white/60 to-transparent lg:block" />

      <Link
        href={gpHref}
        className="absolute left-[4%] top-[16%] hidden w-[min(46%,200px)] items-center gap-2.5 rounded-xl bg-white p-2.5 shadow-[0_8px_24px_rgba(20,36,61,0.14)] transition hover:-translate-y-0.5 sm:flex sm:gap-3 sm:p-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eaf2fe] text-[#1769e8] sm:h-10 sm:w-10">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-[11px] font-semibold leading-snug text-[#14243d] sm:text-xs">
          Book your GP in under a minute
        </span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center self-end rounded-full bg-[#1769e8] text-white">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>

      {nextAvailable && (
        <Link
          href={nextAvailableHref}
          className="absolute bottom-[12%] right-[4%] hidden w-[min(52%,210px)] items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-[0_8px_24px_rgba(20,36,61,0.14)] transition hover:-translate-y-0.5 sm:flex sm:p-3.5"
        >
          <div className="min-w-0 space-y-1 text-[11px] leading-tight sm:text-xs">
            <p className="flex items-center gap-1.5 font-medium text-[#16a34a]">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              Next available
            </p>
            <p className="truncate text-xs font-semibold text-[#14243d] sm:text-[13px]">
              {doctorName(nextAvailable.doctor)}
            </p>
            <p className="text-[#3b4a63]">
              {nextAvailable.label}, {formatTime12(nextAvailable.slot.startTime)}
            </p>
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2f6fd] text-[#14243d]">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      )}
    </div>
  );
}

function AvailabilityBadge({ slot, dates }: { slot: NextOpenSlot | undefined; dates: string[] }) {
  if (!slot) {
    return (
      <span className="mb-4 inline-flex items-center gap-1.5 self-start rounded-full bg-[#f1f4f8] px-2.5 py-1 text-xs font-semibold text-[#5b6b84]">
        <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
        No open slots this week
      </span>
    );
  }
  const label = dayLabel(slot.date, dates);
  const isToday = label === "Today";
  return (
    <span
      className={`mb-4 inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
        isToday ? "bg-[#e7f7ec] text-[#15803d]" : "bg-[#eaf2fe] text-[#1769e8]"
      }`}
    >
      <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
      Available {label === "Today" || label === "Tomorrow" ? label : `on ${label}`}, {formatTime12(slot.startTime)}
    </span>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  const dashboardHref = user ? (user.role === "DOCTOR" ? "/doctor/dashboard" : "/patient/dashboard") : null;

  const { doctors, nextSlots, dates, failed } = await loadLandingData();

  // Founding specialists first, in the order of the landing page design; then everyone else, most experienced first.
  const catalogRank = (id: string) => {
    const index = RUBY_HALL_SPECIALISTS.findIndex((s) => s.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const featuredDoctors = [...doctors]
    .sort(
      (a, b) =>
        catalogRank(a.id) - catalogRank(b.id) ||
        b.experienceYears - a.experienceYears ||
        a.lastName.localeCompare(b.lastName)
    )
    .slice(0, FEATURED_DOCTOR_LIMIT);

  const departments = Array.from(
    doctors.reduce((counts, d) => counts.set(d.specialization, (counts.get(d.specialization) ?? 0) + 1), new Map<string, number>())
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Earliest open slot across every doctor for the hero card.
  let nextAvailable: { doctor: DoctorEntity; slot: NextOpenSlot; label: string } | null = null;
  for (const doctor of doctors) {
    const slot = nextSlots.get(doctor.id);
    if (!slot) continue;
    const current = nextAvailable?.slot;
    if (!current || slot.date < current.date || (slot.date === current.date && slot.startTime < current.startTime)) {
      nextAvailable = { doctor, slot, label: dayLabel(slot.date, dates) };
    }
  }

  // Booking pages need an account. Send guests straight to sign-in (keeping where they were headed)
  // instead of through a server redirect, which flashes an empty page between the two routes.
  const gate = (href: string) => (dashboardHref ? href : `/login?redirectTo=${encodeURIComponent(href)}`);

  const gpHref = gate(
    departments.some((d) => d.name === "General Medicine")
      ? `/doctors?specialization=${encodeURIComponent("General Medicine")}`
      : "/doctors"
  );

  return (
    <div className="landing-root flex min-h-screen flex-col bg-white text-[#14243d]">
      <SiteHeader dashboardHref={dashboardHref} bookHref={gate("/doctors")} />

      <main className="flex-1">
        {/* Hero */}
        <section id="home" className="relative overflow-hidden bg-white">
          <div className={`${container} relative lg:flex lg:min-h-[440px] lg:items-center xl:min-h-[480px]`}>
            <div className="relative z-10 py-12 lg:w-[46%] lg:py-16">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1769e8]">Ruby Hall, Pune</p>
              <h1 className="mb-5 text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-[#14243d] sm:text-[56px] xl:text-[62px]">
                More time
                <br />
                for <span className="text-[#1769e8]">care.</span>
              </h1>
              <p className="mb-8 max-w-[440px] text-[15px] leading-relaxed text-[#26354d]">
                Book appointments with expert doctors, get your token instantly, and reschedule or cancel online —
                all in one place.
              </p>
              <div className="mb-9 flex flex-wrap items-center gap-3">
                <Link
                  href={gate("/doctors")}
                  className="group flex items-center gap-2 rounded-lg bg-[#1769e8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d54c6]"
                >
                  Book an appointment
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href={dashboardHref ?? "/signup"}
                  className="rounded-lg border border-[#1769e8]/40 bg-white px-5 py-3 text-sm font-semibold text-[#1769e8] transition hover:bg-[#f0f6ff]"
                >
                  {dashboardHref ? "Go to my dashboard" : "Create an account"}
                </Link>
              </div>
              <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-[#26354d]">
                {["Live Availability", "Easy Rescheduling", "Secure & Private"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CircleCheck className="h-4 w-4 shrink-0 fill-[#1769e8] text-white" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative px-5 pb-10 sm:px-8 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[56%] lg:p-0">
            <div className="aspect-[4/3] overflow-hidden rounded-2xl sm:aspect-[2/1] lg:aspect-auto lg:h-full lg:overflow-visible lg:rounded-none">
              <HeroVisual
                nextAvailable={nextAvailable}
                nextAvailableHref={nextAvailable ? gate(`/doctors/${nextAvailable.doctor.id}`) : "/doctors"}
                gpHref={gpHref}
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section aria-label="Why Medrella" className="py-10">
          <div className={`${container} grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4`}>
            {features.map(({ icon: Icon, title, text }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#e8edf5] bg-white p-6 shadow-[0_4px_18px_rgba(20,36,61,0.04)]"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf2fe] text-[#1769e8]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mb-1.5 text-[17px] font-bold leading-snug text-[#14243d]">{title}</h3>
                <p className="text-[13.5px] leading-relaxed text-[#5b6b84]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Departments */}
        <section id="departments" className="bg-[#f8fafd] py-12">
          <div className={container}>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className={`${eyebrow} mb-1.5`}>Our Specialties</p>
                <h2 className={sectionTitle}>Departments We Offer</h2>
              </div>
              <Link href={gate("/doctors")} className="group flex items-center gap-1.5 text-[13px] font-semibold text-[#1769e8]">
                View all departments
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {departments.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#d5deea] bg-white p-6 text-center text-sm text-[#5b6b84]">
                {failed
                  ? "Departments are temporarily unavailable. Please refresh in a moment."
                  : "Departments will appear here as specialists join Medrella."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
                {departments.map(({ name, count }) => {
                  const { icon: Icon, tile, tint } = departmentStyles[name] ?? defaultDepartmentStyle;
                  return (
                    <li key={name}>
                      <Link
                        href={gate(`/doctors?specialization=${encodeURIComponent(name)}`)}
                        className="group flex w-full flex-col items-center gap-2.5 text-center"
                      >
                        <span
                          className={`flex h-[68px] w-full items-center justify-center rounded-2xl ${tile} ${tint} transition group-hover:-translate-y-0.5 group-hover:shadow-md`}
                        >
                          <Icon className="h-7 w-7" strokeWidth={1.9} aria-hidden />
                        </span>
                        <span className="text-[13px] font-medium text-[#14243d]">{name}</span>
                        <span className="-mt-2 text-[11px] text-[#5b6b84]">
                          {count} {count === 1 ? "doctor" : "doctors"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Doctors */}
        <section id="doctors" className="py-12">
          <div className={container}>
            <div className="relative rounded-3xl bg-[#f2f6fd] px-5 py-8 sm:px-8">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className={`${eyebrow} mb-1.5`}>Our Doctors</p>
                  <h2 className={`${sectionTitle} mb-1`}>Meet Our Doctors</h2>
                  <p className="text-sm text-[#5b6b84]">
                    Consult with experienced and trusted doctors across various specialties.
                  </p>
                </div>
                <Link href={gate("/doctors")} className="group flex items-center gap-1.5 text-[13px] font-semibold text-[#1769e8]">
                  View all doctors
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              {featuredDoctors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d5deea] bg-white p-8 text-center">
                  <Stethoscope className="mx-auto mb-3 h-7 w-7 text-[#a3b0c2]" aria-hidden />
                  <p className="mb-1 text-sm font-semibold text-[#14243d]">
                    {failed ? "Our doctors list is temporarily unavailable." : "Our specialists will appear here soon."}
                  </p>
                  {!failed && !dashboardHref && (
                    <p className="text-[13px] text-[#5b6b84]">
                      Are you a doctor?{" "}
                      <Link href="/signup" className="font-semibold text-[#1769e8] hover:underline">
                        Join Medrella
                      </Link>
                    </p>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {featuredDoctors.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex flex-col overflow-hidden rounded-2xl border border-[#e8edf5] bg-white shadow-[0_4px_18px_rgba(20,36,61,0.05)]"
                    >
                      <div className="relative aspect-[3/2] bg-[#eef3fa]">
                        {doc.profileImage ? (
                          <Image
                            src={doc.profileImage}
                            alt={`Portrait of ${doctorName(doc)}`}
                            fill
                            sizes="(min-width: 1024px) 270px, (min-width: 640px) 50vw, 100vw"
                            className="object-cover object-top"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#1769e8]">
                            {initials(doc)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="truncate text-[15px] font-bold text-[#14243d]">{doctorName(doc)}</h3>
                        <p className="mb-2.5 truncate text-[13px] text-[#5b6b84]">{doc.specialization}</p>
                        <p className="mb-1.5 flex items-center gap-1.5 text-[13px] text-[#5b6b84]">
                          <Briefcase className="h-4 w-4" aria-hidden />
                          {doc.experienceYears}+ years experience
                        </p>
                        <p className="mb-3 flex items-center gap-1.5 text-[13px] text-[#5b6b84]">
                          <IndianRupee className="h-4 w-4" aria-hidden />
                          <span className="font-semibold text-[#14243d]">{doc.consultationFee}</span> consultation
                        </p>
                        <AvailabilityBadge slot={nextSlots.get(doc.id)} dates={dates} />
                        <Link
                          href={gate(`/doctors/${doc.id}`)}
                          className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1769e8]/35 py-2 text-[13px] font-semibold text-[#1769e8] transition hover:bg-[#f0f6ff]"
                        >
                          View Profile
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="pb-12">
          <div className={container}>
            <p className={`${eyebrow} mb-1.5`}>How it works</p>
            <h2 className={`${sectionTitle} mb-8`}>Get Started in 3 Simple Steps</h2>
            <ol className="grid grid-cols-1 gap-7 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, text, badge, bubble }, i) => (
                <li key={title} className="flex items-center gap-4">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${badge}`}
                  >
                    {i + 1}
                  </span>
                  <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${bubble}`}>
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 text-[15px] font-bold text-[#14243d]">{title}</h3>
                    <p className="text-[13px] leading-relaxed text-[#5b6b84]">{text}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <ArrowRight className="hidden h-4 w-4 shrink-0 text-[#a3b0c2] md:block" aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section aria-label="Get started" className="pb-12">
          <div className={container}>
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0b2a63] via-[#123f8f] to-[#1d5fd1] px-7 py-9 sm:px-10">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-35 [mask-image:linear-gradient(to_right,transparent,black_55%)] md:w-2/3">
                <Image
                  src="/images/hospital-hero.png"
                  alt=""
                  fill
                  sizes="(min-width: 768px) 66vw, 100vw"
                  className="object-cover object-[center_40%]"
                />
              </div>
              <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <h2 className="mb-2 text-[26px] font-bold tracking-tight text-white sm:text-[30px]">
                    Your health, our priority.
                  </h2>
                  <p className="text-sm text-[#dbe7fb]">
                    Join Medrella today and experience a smarter, simpler way to manage your healthcare.
                  </p>
                </div>
                <Link
                  href={gate("/doctors")}
                  className="group flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#1769e8] shadow-sm transition hover:bg-[#f0f6ff]"
                >
                  Book an appointment
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="about" className="border-t border-[#e8edf5] py-7">
        <div className={`${container} flex flex-col items-center gap-6 md:flex-row md:justify-between`}>
          <div className="flex max-w-[320px] flex-col items-center gap-1 text-center md:items-start md:text-left">
            <Logo size="sm" />
            <p className="text-xs text-[#5b6b84]">
              Outpatient appointment booking for Ruby Hall, Pune — find a specialist, book a session slot and track
              your visits.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <a href="#departments" className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]">
              Departments
            </a>
            <a href="#doctors" className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]">
              Our Doctors
            </a>
            <a href={HOSPITAL_PHONE_TEL} className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]">
              Contact: {HOSPITAL_PHONE_DISPLAY}
            </a>
            <a
              href={`mailto:${HOSPITAL_SUPPORT_EMAIL}`}
              className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]"
            >
              Support
            </a>
            <Link href="/privacy" className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]">
              Privacy
            </Link>
            <Link href="/terms" className="text-[13px] text-[#5b6b84] transition-colors hover:text-[#14243d]">
              Terms
            </Link>
          </nav>
          <p className="text-xs text-[#5b6b84]">© {new Date().getFullYear()} Medrella Healthcare</p>
        </div>
      </footer>
    </div>
  );
}
