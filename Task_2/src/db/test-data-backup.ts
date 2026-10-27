import { hashPassword } from "@/lib/auth-crypto";
import type { UserEntity, PatientEntity, DoctorEntity, AvailabilityEntity, AppointmentEntity } from "@/db/repo";

/**
 * Medrella Test Data Backup
 * Preserved safely. Call `restoreTestData(store)` whenever the user requests test data to be loaded.
 */

export interface TestBackupDataset {
  doctors: Array<{
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
  }>;
  patients: Array<{
    id: string;
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
    address: string;
  }>;
  appointments: Array<{
    id: string;
    patientId: string;
    doctorId: string;
    dateOffsetDays: number;
    startTime: string;
    endTime: string;
    status: "BOOKED" | "COMPLETED" | "CANCELLED";
    reason: string;
  }>;
}

export const MEDRELLA_TEST_DATA: TestBackupDataset = {
  doctors: [
    {
      id: "doc-1",
      userId: "user-doc-1",
      email: "doctor.smith@medrella.com",
      firstName: "David",
      lastName: "Smith",
      specialization: "Cardiology",
      phone: "+1 (555) 234-5678",
      licenseNumber: "CARD-88219",
      experienceYears: 12,
      consultationFee: 120,
      bio: "Specialist in cardiovascular diagnostics, blood pressure management, echocardiograms, and preventive heart care.",
      days: ["MON", "TUE", "WED", "FRI"],
      start: "09:00",
      end: "17:00",
      duration: 30,
    },
    {
      id: "doc-2",
      userId: "user-doc-2",
      email: "doctor.chen@medrella.com",
      firstName: "Emily",
      lastName: "Chen",
      specialization: "Dermatology",
      phone: "+1 (555) 876-5432",
      licenseNumber: "DERM-44102",
      experienceYears: 9,
      consultationFee: 95,
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
      phone: "+1 (555) 345-6789",
      licenseNumber: "PED-19342",
      experienceYears: 14,
      consultationFee: 85,
      bio: "Compassionate pediatric care focusing on newborn health, wellness visits, routine immunizations, and developmental tracking.",
      days: ["TUE", "WED", "THU", "SAT"],
      start: "09:00",
      end: "16:00",
      duration: 20,
    },
    {
      id: "doc-4",
      userId: "user-doc-4",
      email: "doctor.patel@medrella.com",
      firstName: "Anita",
      lastName: "Patel",
      specialization: "Orthopedics",
      phone: "+1 (555) 456-7890",
      licenseNumber: "ORTHO-55219",
      experienceYears: 11,
      consultationFee: 130,
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
      phone: "+1 (555) 567-8901",
      licenseNumber: "GEN-33019",
      experienceYears: 16,
      consultationFee: 75,
      bio: "Comprehensive primary healthcare physician managing acute illnesses, health screenings, and chronic medical disorders.",
      days: ["MON", "TUE", "WED", "THU", "FRI"],
      start: "08:00",
      end: "15:00",
      duration: 20,
    },
  ],
  patients: [
    {
      id: "pat-1",
      userId: "user-pat-1",
      email: "patient.john@medrella.com",
      firstName: "John",
      lastName: "Doe",
      phone: "+1 (555) 901-2345",
      dateOfBirth: "1990-05-15",
      gender: "Male",
      address: "742 Evergreen Terrace, Springfield",
    },
    {
      id: "pat-2",
      userId: "user-pat-2",
      email: "patient.jane@medrella.com",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+1 (555) 123-4567",
      dateOfBirth: "1992-08-22",
      gender: "Female",
      address: "124 Conch Street, Bikini Bottom",
    },
    {
      id: "pat-3",
      userId: "user-pat-3",
      email: "patient.robert@medrella.com",
      firstName: "Robert",
      lastName: "Johnson",
      phone: "+1 (555) 234-5670",
      dateOfBirth: "1985-03-11",
      gender: "Male",
      address: "42 Wallaby Way, Sydney",
    },
    {
      id: "pat-4",
      userId: "user-pat-4",
      email: "patient.emily@medrella.com",
      firstName: "Emily",
      lastName: "Davis",
      phone: "+1 (555) 345-6781",
      dateOfBirth: "1998-11-04",
      gender: "Female",
      address: "221B Baker Street, London",
    },
    {
      id: "pat-5",
      userId: "user-pat-5",
      email: "patient.michael@medrella.com",
      firstName: "Michael",
      lastName: "Brown",
      phone: "+1 (555) 456-7892",
      dateOfBirth: "1978-07-19",
      gender: "Male",
      address: "31 Spooner Street, Quahog",
    },
  ],
  appointments: [
    {
      id: "apt-1",
      patientId: "pat-1",
      doctorId: "doc-1",
      dateOffsetDays: 1,
      startTime: "09:30",
      endTime: "10:00",
      status: "BOOKED",
      reason: "Annual cardiovascular wellness screening and blood pressure review.",
    },
    {
      id: "apt-2",
      patientId: "pat-2",
      doctorId: "doc-2",
      dateOffsetDays: 2,
      startTime: "10:30",
      endTime: "11:00",
      status: "BOOKED",
      reason: "Persistent eczema consultation and allergy patch test follow-up.",
    },
    {
      id: "apt-3",
      patientId: "pat-3",
      doctorId: "doc-3",
      dateOffsetDays: 3,
      startTime: "11:00",
      endTime: "11:20",
      status: "BOOKED",
      reason: "Pediatric developmental assessment and routine immunization booster.",
    },
    {
      id: "apt-4",
      patientId: "pat-4",
      doctorId: "doc-4",
      dateOffsetDays: 4,
      startTime: "14:00",
      endTime: "14:30",
      status: "BOOKED",
      reason: "Right knee post-arthroscopy joint evaluation and physical therapy check.",
    },
    {
      id: "apt-5",
      patientId: "pat-5",
      doctorId: "doc-5",
      dateOffsetDays: 0,
      startTime: "08:30",
      endTime: "08:50",
      status: "COMPLETED",
      reason: "Fever, acute sinus infection treatment, and prescription renewal.",
    },
  ],
};

/**
 * Backup of static test metrics formerly displayed on the Reports & Analytics page.
 */
export const MEDRELLA_REPORTS_TEST_METRICS = {
  totalVisits: 182,
  consultations: 124,
  procedures: 28,
  followups: 30,
  dailyVolume: [
    { date: "1 Oct", count: 31 },
    { date: "2 Oct", count: 42 },
    { date: "3 Oct", count: 28 },
    { date: "4 Oct", count: 35 },
    { date: "5 Oct", count: 46 },
  ],
  breakdown: [
    { category: "Consultation", percent: 68 },
    { category: "Antenatal / OB", percent: 18 },
    { category: "Follow-up", percent: 9 },
    { category: "Procedures", percent: 5 },
  ],
};
