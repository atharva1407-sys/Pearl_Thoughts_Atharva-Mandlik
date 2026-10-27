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
  days: readonly ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  start: string;
  end: string;
  duration: number;
}

/**
 * Ruby Hall Clinic, Pune — Clinical Outpatient Specialists Directory
 */
export const RUBY_HALL_SPECIALISTS: HospitalSpecialist[] = [
  {
    id: "doc-1",
    userId: "user-doc-1",
    email: "doctor.smith@medrella.com",
    firstName: "David",
    lastName: "Smith",
    specialization: "Cardiology",
    phone: "+91 20 6645 5201",
    licenseNumber: "CARD-88219",
    experienceYears: 12,
    consultationFee: 1200,
    bio: "Senior interventional cardiologist with extensive experience in hypertension management, coronary care, and echocardiography.",
    days: ["MON", "TUE", "WED", "THU", "FRI"],
    start: "09:00",
    end: "17:00",
    duration: 30,
  },
  {
    id: "doc-2",
    userId: "user-doc-2",
    email: "doctor.patel@medrella.com",
    firstName: "Priya",
    lastName: "Patel",
    specialization: "Dermatology",
    phone: "+91 20 6645 5202",
    licenseNumber: "DERM-44012",
    experienceYears: 8,
    consultationFee: 950,
    bio: "Board-certified dermatologist specializing in adult & pediatric skin conditions, acne management, and cosmetic dermatology.",
    days: ["MON", "TUE", "THU", "FRI"],
    start: "10:00",
    end: "18:00",
    duration: 30,
  },
  {
    id: "doc-3",
    userId: "user-doc-3",
    email: "doctor.ross@medrella.com",
    firstName: "Michael",
    lastName: "Ross",
    specialization: "Pediatrics",
    phone: "+91 20 6645 5203",
    licenseNumber: "PED-19342",
    experienceYears: 14,
    consultationFee: 850,
    bio: "Compassionate pediatric care focusing on newborn health, wellness visits, routine immunizations, and developmental tracking.",
    days: ["TUE", "WED", "THU", "SAT"],
    start: "09:00",
    end: "16:00",
    duration: 20,
  },
  {
    id: "doc-4",
    userId: "user-doc-4",
    email: "doctor.anita@medrella.com",
    firstName: "Anita",
    lastName: "Patel",
    specialization: "Orthopedics",
    phone: "+91 20 6645 5204",
    licenseNumber: "ORTHO-55219",
    experienceYears: 11,
    consultationFee: 1300,
    bio: "Orthopedic surgery and joint restoration consultant with focus on sports injuries, spine care, and arthritis therapy.",
    days: ["MON", "WED", "FRI"],
    start: "08:30",
    end: "16:30",
    duration: 30,
  },
  {
    id: "doc-5",
    userId: "user-doc-5",
    email: "doctor.williams@medrella.com",
    firstName: "Robert",
    lastName: "Williams",
    specialization: "General Medicine",
    phone: "+91 20 6645 5205",
    licenseNumber: "GEN-33019",
    experienceYears: 16,
    consultationFee: 750,
    bio: "Comprehensive primary healthcare physician managing acute illnesses, health screenings, and chronic medical disorders.",
    days: ["MON", "TUE", "WED", "THU", "FRI"],
    start: "08:00",
    end: "15:00",
    duration: 20,
  },
];
