type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface SpecialistSession {
  key: string; // stable slug used to build the session id, e.g. "morning"
  name: string;
  days: readonly Day[];
  start: string; // HH:mm
  end: string; // HH:mm
  duration: number; // slot / wave length in minutes
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
}

export interface HospitalSpecialist {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  specialization: string;
  phone: string;
  licenseNumber: string;
  experienceYears: number;
  consultationFee: number;
  bio: string;
  profileImage: string;
  sessions: readonly SpecialistSession[];
}

const OPD_PHONE = "+91 20 6645 5100";
const WEEKDAYS: readonly Day[] = ["MON", "TUE", "WED", "THU", "FRI"];
const MON_TO_SAT: readonly Day[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

/**
 * Ruby Hall Clinic, Pune — founding specialists shown on the landing page.
 * Seeded into Neon with `npm run db:seed` (see src/db/seed.ts); every other doctor
 * registers through /signup.
 */
export const RUBY_HALL_SPECIALISTS: HospitalSpecialist[] = [
  {
    id: "doc_ananya_sharma",
    userId: "usr_doc_ananya_sharma",
    email: "ananya.sharma@medrella.com",
    firstName: "Ananya",
    lastName: "Sharma",
    specialization: "General Medicine",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2017-04821",
    experienceYears: 8,
    consultationFee: 600,
    bio: "General physician managing fevers, infections, diabetes, hypertension and routine health check-ups.",
    profileImage: "/images/doctors/ananya-sharma.jpg",
    sessions: [
      { key: "morning", name: "Morning OPD", days: MON_TO_SAT, start: "09:00", end: "13:00", duration: 15, schedulingType: "STREAM", patientsPerWave: 1 },
      { key: "evening", name: "Evening OPD", days: ["MON", "WED", "FRI"], start: "17:00", end: "20:00", duration: 30, schedulingType: "WAVE", patientsPerWave: 3 },
    ],
  },
  {
    id: "doc_rohan_mehta",
    userId: "usr_doc_rohan_mehta",
    email: "rohan.mehta@medrella.com",
    firstName: "Rohan",
    lastName: "Mehta",
    specialization: "Cardiology",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2013-02217",
    experienceYears: 12,
    consultationFee: 1200,
    bio: "Cardiologist focused on chest pain evaluation, heart rhythm disorders, ECG and echo reviews, and preventive cardiac care.",
    profileImage: "/images/doctors/rohan-mehta.jpg",
    sessions: [
      { key: "morning", name: "Cardiac OPD", days: WEEKDAYS, start: "10:00", end: "14:00", duration: 20, schedulingType: "STREAM", patientsPerWave: 1 },
    ],
  },
  {
    id: "doc_priya_nair",
    userId: "usr_doc_priya_nair",
    email: "priya.nair@medrella.com",
    firstName: "Priya",
    lastName: "Nair",
    specialization: "Dermatology",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2018-06390",
    experienceYears: 7,
    consultationFee: 800,
    bio: "Dermatologist treating acne, eczema, psoriasis, hair loss and skin allergies for adults and children.",
    profileImage: "/images/doctors/priya-nair.jpg",
    sessions: [
      { key: "midday", name: "Skin Clinic", days: ["TUE", "THU", "SAT"], start: "11:00", end: "15:00", duration: 20, schedulingType: "STREAM", patientsPerWave: 1 },
    ],
  },
  {
    id: "doc_vikram_iyer",
    userId: "usr_doc_vikram_iyer",
    email: "vikram.iyer@medrella.com",
    firstName: "Vikram",
    lastName: "Iyer",
    specialization: "Orthopedics",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2015-03158",
    experienceYears: 10,
    consultationFee: 1000,
    bio: "Orthopedic surgeon for joint pain, sports injuries, fractures, back pain and arthritis care.",
    profileImage: "/images/doctors/vikram-iyer.jpg",
    sessions: [
      { key: "morning", name: "Ortho OPD", days: ["MON", "TUE", "THU", "FRI"], start: "09:00", end: "13:00", duration: 30, schedulingType: "STREAM", patientsPerWave: 1 },
      { key: "saturday", name: "Fracture Follow-up", days: ["SAT"], start: "09:00", end: "12:00", duration: 30, schedulingType: "WAVE", patientsPerWave: 3 },
    ],
  },
  {
    id: "doc_meera_krishnan",
    userId: "usr_doc_meera_krishnan",
    email: "meera.krishnan@medrella.com",
    firstName: "Meera",
    lastName: "Krishnan",
    specialization: "Pediatrics",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2016-05542",
    experienceYears: 9,
    consultationFee: 700,
    bio: "Pediatrician for newborn care, vaccinations, growth and development checks, and childhood illnesses.",
    profileImage: "/images/doctors/meera-krishnan.jpg",
    sessions: [
      { key: "morning", name: "Child Wellness Clinic", days: MON_TO_SAT, start: "09:30", end: "12:30", duration: 30, schedulingType: "WAVE", patientsPerWave: 3 },
    ],
  },
  {
    id: "doc_arjun_rao",
    userId: "usr_doc_arjun_rao",
    email: "arjun.rao@medrella.com",
    firstName: "Arjun",
    lastName: "Rao",
    specialization: "General Surgery",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2014-01976",
    experienceYears: 11,
    consultationFee: 1100,
    bio: "General surgeon consulting on hernia, gallbladder, appendix and minor surgical procedures, with pre- and post-operative care.",
    profileImage: "/images/doctors/arjun-rao.jpg",
    sessions: [
      { key: "afternoon", name: "Surgical OPD", days: ["WED", "SAT"], start: "14:00", end: "18:00", duration: 30, schedulingType: "STREAM", patientsPerWave: 1 },
    ],
  },
  {
    id: "doc_kavya_menon",
    userId: "usr_doc_kavya_menon",
    email: "kavya.menon@medrella.com",
    firstName: "Kavya",
    lastName: "Menon",
    specialization: "Gynecology",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2017-04410",
    experienceYears: 8,
    consultationFee: 900,
    bio: "Gynecologist for antenatal care, menstrual health, PCOS, fertility counselling and women's wellness.",
    profileImage: "/images/doctors/kavya-menon.jpg",
    sessions: [
      { key: "morning", name: "Women's Clinic", days: WEEKDAYS, start: "10:00", end: "13:00", duration: 20, schedulingType: "STREAM", patientsPerWave: 1 },
      { key: "evening", name: "Antenatal Clinic", days: ["TUE", "THU"], start: "17:00", end: "19:00", duration: 30, schedulingType: "WAVE", patientsPerWave: 2 },
    ],
  },
  {
    id: "doc_sandeep_kulkarni",
    userId: "usr_doc_sandeep_kulkarni",
    email: "sandeep.kulkarni@medrella.com",
    firstName: "Sandeep",
    lastName: "Kulkarni",
    specialization: "Ophthalmology",
    phone: OPD_PHONE,
    licenseNumber: "MMC-2010-00873",
    experienceYears: 15,
    consultationFee: 900,
    bio: "Ophthalmologist for eye check-ups, cataract evaluation, glaucoma screening and vision correction advice.",
    profileImage: "/images/doctors/sandeep-kulkarni.jpg",
    sessions: [
      { key: "morning", name: "Eye OPD", days: MON_TO_SAT, start: "09:00", end: "12:00", duration: 15, schedulingType: "STREAM", patientsPerWave: 1 },
    ],
  },
];

/** Session id is stable per doctor, session and day, so re-running the seed updates rows instead of duplicating them. */
export function specialistSessionId(doctorId: string, sessionKey: string, day: Day): string {
  return `sess_${doctorId}_${sessionKey}_${day.toLowerCase()}`;
}

/**
 * Password for seeded doctor accounts. Must come from SEED_DOCTOR_PASSWORD so no shared
 * password lives in the repo; the offline in-memory store may fall back to a local-only value.
 */
export function getSeedDoctorPassword(options: { allowDevFallback: boolean }): string {
  const password = process.env.SEED_DOCTOR_PASSWORD?.trim();
  if (password) {
    if (password.length < 8) {
      throw new Error("SEED_DOCTOR_PASSWORD must be at least 8 characters long.");
    }
    return password;
  }
  if (options.allowDevFallback) {
    return "medrella-local-dev";
  }
  throw new Error(
    "SEED_DOCTOR_PASSWORD is not set. Add it to .env.local (8+ characters) before seeding doctors into the database."
  );
}
