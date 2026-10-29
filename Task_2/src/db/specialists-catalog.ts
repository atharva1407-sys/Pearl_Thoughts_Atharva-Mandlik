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
 * Initial catalog is empty for clean production deployment.
 * Hospital specialists register their official doctor accounts via /signup.
 */
export const RUBY_HALL_SPECIALISTS: HospitalSpecialist[] = [];
