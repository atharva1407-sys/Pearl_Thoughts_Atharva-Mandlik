"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  CalendarDays,
  Eye,
  EyeOff,
  Headset,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UsersRound,
  UserRound,
  Phone,
  ArrowRight,
  Stethoscope,
  AlertCircle,
  Loader2,
  Briefcase
} from "lucide-react";
import { loginAction, registerPatientAction, registerDoctorAction } from "@/actions/auth";

type AuthPageProps = {
  mode: "login" | "signup";
};

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [role, setRole] = useState<"PATIENT" | "DOCTOR">("PATIENT");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agree, setAgree] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Read URL search params on client mount for redirect & notice messages
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const msg = params.get("message");
      if (msg) setNotice(msg);
      const redir = params.get("redirectTo");
      if (redir) setRedirectTo(redir);
    }
  }, []);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialization, setSpecialization] = useState("General Medicine");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("role", role);
    if (redirectTo) {
      formData.append("redirectTo", redirectTo);
    }

    startTransition(async () => {
      if (!isSignup) {
        // Login Flow
        const res = await loginAction(formData);
        if (res && res.success && res.redirectPath) {
          window.location.href = res.redirectPath;
          return;
        }
        if (res && !res.success) {
          setError(res.error || "Authentication failed. Please check your credentials.");
        }
      } else {
        // Sign-up Flow
        formData.append("firstName", firstName);
        formData.append("lastName", lastName);
        formData.append("phone", phone);

        let res;
        if (role === "PATIENT") {
          res = await registerPatientAction(formData);
        } else {
          formData.append("specialization", specialization);
          formData.append("licenseNumber", `TN-MED-${Math.floor(10000 + Math.random() * 90000)}`);
          formData.append("experienceYears", "5");
          formData.append("consultationFee", "800");
          res = await registerDoctorAction(formData);
        }

        if (res && res.success && res.redirectPath) {
          window.location.href = res.redirectPath;
          return;
        }
        if (res && !res.success) {
          setError(res.error || "Account registration failed. Please review your details.");
        }
      }
    });
  };

  return (
    <main className="auth-page">
      {/* Left Hero Panel (Photographic clinical background with shade) */}
      <section className="auth-hero" aria-label="Medrella healthcare platform introduction">
        <div className="auth-hero-img-wrap">
          <Image
            src="/images/hospital-auth-hero.jpg"
            alt="Ruby Hall Clinical Hallway"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="auth-hero-bg-img"
          />
        </div>
        <div className="auth-hero-shade" />
        <div className="hero-content">
          <Link href="/" className="auth-brand" aria-label="Medrella home">
            <Image
              src="/images/medrella-logo.png"
              alt="Medrella"
              width={40}
              height={40}
              className="auth-brand-logo-img"
              priority
            />
            <span>
              medrella<span className="brand-dot">.</span>
            </span>
          </Link>

          <div className="hospital-label">
            <span className="hospital-dot" /> RUBY HALL, PUNE
          </div>

          <div className="hero-copy">
            <p className="eyebrow">CARE · CLARITY · CONFIDENCE</p>
            <h1>
              More time
              <br />
              for <span>care.</span>
            </h1>
            <p className="hero-description">
              A modern hospital management system designed to simplify clinical workflows and improve patient care.
            </p>
          </div>

          <div className="feature-list">
            <Feature
              icon={<UsersRound />}
              title="Efficient Patient Management"
              detail="Unified records and faster access"
            />
            <Feature
              icon={<CalendarDays />}
              title="Seamless Appointments"
              detail="Smarter scheduling for everyone"
            />
            <Feature
              icon={<ShieldCheck />}
              title="Secure & Reliable"
              detail="Built for modern healthcare"
            />
            <Feature
              icon={<Activity />}
              title="Actionable Insights"
              detail="Better decisions, healthier outcomes"
            />
          </div>

          <blockquote>
            “Better care today.
            <br />
            A healthier tomorrow.”
          </blockquote>

          <div className="hero-footnote">
            <Stethoscope size={14} /> Thoughtfully designed for healthcare teams
          </div>
        </div>
      </section>

      {/* Right Authentication Panel */}
      <section className="auth-panel">
        <div className="auth-panel-header">
          <Link href="/" className="mobile-brand">
            <Image
              src="/images/medrella-logo.png"
              alt="Medrella"
              width={34}
              height={34}
              className="mobile-brand-logo-img"
              priority
            />
            <span>
              medrella<span className="brand-dot">.</span>
            </span>
          </Link>

          <a className="help-link" href="mailto:support@medrella.com">
            <Headset size={16} /> <span className="help-link-text">Need help?</span>
          </a>
        </div>

        <div className={`auth-card ${isSignup ? "signup-card" : ""}`}>
          <div className="form-heading">
            <div className="form-kicker">{isSignup ? "GET STARTED" : "WELCOME BACK"}</div>
            <h2>{isSignup ? "Create Account" : "Login"}</h2>
            <p>
              {isSignup
                ? "Join Medrella and be part of a smarter healthcare experience."
                : "Welcome back! Please sign in to continue to Medrella."}
            </p>
          </div>

          {/* Role Switcher Pill Bar */}
          <div className="mb-4 p-1 bg-slate-100 rounded-xl border border-slate-200 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setRole("PATIENT");
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                role === "PATIENT"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserRound size={14} />
              <span>Patient Portal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRole("DOCTOR");
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                role === "DOCTOR"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200/60"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Stethoscope size={14} />
              <span>Doctor Portal</span>
            </button>
          </div>

          {error && (
            <div className="form-notice error mb-3" role="alert">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {notice && (
            <div className="form-notice success mb-3" role="status">
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isSignup && (
              <div className="name-row">
                <label className="input-wrap">
                  <UserRound size={17} />
                  <input
                    type="text"
                    required
                    autoComplete="given-name"
                    placeholder="First name"
                    aria-label="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </label>
                <label className="input-wrap">
                  <UserRound size={17} />
                  <input
                    type="text"
                    required
                    autoComplete="family-name"
                    placeholder="Last name"
                    aria-label="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </label>
              </div>
            )}

            <label className="input-wrap">
              <Mail size={17} />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder={role === "PATIENT" ? "patient@example.com" : "doctor@medrella.com"}
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            {isSignup && (
              <label className="input-wrap">
                <Phone size={17} />
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  aria-label="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            )}

            {isSignup && role === "DOCTOR" && (
              <label className="input-wrap">
                <Briefcase size={17} />
                <select
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  aria-label="Clinical specialization"
                  className="bg-transparent text-slate-800"
                >
                  <option value="Cardiology">Cardiology</option>
                  <option value="Dermatology">Dermatology</option>
                  <option value="Pediatrics">Pediatrics</option>
                  <option value="Orthopedics">Orthopedics</option>
                  <option value="General Medicine">General Medicine</option>
                  <option value="Neurology">Neurology</option>
                </select>
              </label>
            )}

            <label className="input-wrap">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "Create password (6+ characters)" : "Enter your password"}
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </label>

            {!isSignup && (
              <div className="form-options">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setNotice("Password assistance: please visit Ruby Hall hospital reception (+91 20 6645 5100) for credentials assistance.")
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}

            {isSignup && (
              <label className="check-label terms-check">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  required
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="#terms"
                    onClick={(e) => {
                      e.preventDefault();
                      setNotice("Medrella Clinical Terms of Service: Patient data is protected under hospital clinical confidentiality standards.");
                    }}
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="#privacy"
                    onClick={(e) => {
                      e.preventDefault();
                      setNotice("Medrella Privacy Policy: Hospital records are strictly confidential and encrypted.");
                    }}
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>
            )}

            <button type="submit" className="primary-button" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>{isSignup ? "Creating Profile..." : "Signing In..."}</span>
                </>
              ) : (
                <>
                  <span>{isSignup ? "Create Account" : "Login"}</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <p className="switch-auth">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link
              href={
                isSignup
                  ? redirectTo
                    ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
                    : "/login"
                  : redirectTo
                  ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}`
                  : "/signup"
              }
            >
              {isSignup ? "Login" : "Sign up"}
            </Link>
          </p>
        </div>

        <footer className="auth-footer">
          <span>© 2026 Medrella. All rights reserved.</span>
          <div>
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                setNotice("Ruby Hall clinical privacy guidelines active.");
              }}
            >
              Privacy
            </a>
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                setNotice("Standard hospital outpatient terms apply.");
              }}
            >
              Terms
            </a>
            <a href="mailto:support@medrella.com">Support</a>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="auth-feature">
      <span className="feature-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}
