"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  ChevronDown,
  Loader2,
  AlertCircle
} from "lucide-react";
import { loginAction, registerPatientAction, registerDoctorAction } from "@/actions/auth";

type AuthPageProps = {
  mode: "login" | "signup";
};

export default function AuthPage({ mode }: AuthPageProps) {
  const isSignup = mode === "signup";
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agree, setAgree] = useState(false);
  const [role, setRole] = useState("Patient");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    startTransition(async () => {
      if (!isSignup) {
        // Login Flow (backend auto-resolves whether user is Doctor or Patient)
        const res = await loginAction(formData);
        if (res && !res.success) {
          setError(res.error || "Authentication failed. Please check your credentials.");
        }
      } else {
        // Sign-up Flow
        formData.append("firstName", firstName);
        formData.append("lastName", lastName);
        formData.append("phone", phone);
        formData.append("role", role === "Doctor" ? "DOCTOR" : "PATIENT");

        let res;
        if (role === "Doctor") {
          formData.append("specialization", "General Medicine");
          formData.append("licenseNumber", `TN-MED-${Math.floor(10000 + Math.random() * 90000)}`);
          formData.append("experienceYears", "5");
          formData.append("consultationFee", "800");
          res = await registerDoctorAction(formData);
        } else {
          res = await registerPatientAction(formData);
        }

        if (res && !res.success) {
          setError(res.error || "Account creation failed. Please check your details.");
        }
      }
    });
  };

  return (
    <main className="auth-page">
      {/* =========================================================================
          LEFT HERO PANEL (Full height hospital corridor photo with dark blue shade)
          ========================================================================= */}
      <section className="auth-hero" aria-label="Medrella healthcare platform introduction">
        <div className="auth-hero-shade" />

        <div className="hero-content">
          {/* Brand Logo */}
          <Link href="/" className="auth-brand" aria-label="Medrella home">
            <span className="brand-mark">m</span>
            <span>
              medrella<span className="brand-dot">.</span>
            </span>
          </Link>

          {/* Hospital Sub-Label */}
          <div className="hospital-sublabel">SP DELTA HOSPITAL, T. NAGAR</div>

          {/* Headline Copy */}
          <div className="hero-copy">
            <h1>
              More time
              <br />
              for <span>care.</span>
            </h1>
            <p className="hero-description">
              A modern hospital management system designed to simplify clinical workflows and improve patient care.
            </p>
          </div>

          {/* 4 Clinical Features */}
          <div className="feature-list">
            <Feature
              icon={<UsersRound size={20} />}
              title="Efficient Patient Management"
              detail="Unified records and faster access"
            />
            <Feature
              icon={<CalendarDays size={20} />}
              title="Seamless Appointments"
              detail="Smarter scheduling for everyone"
            />
            <Feature
              icon={<ShieldCheck size={20} />}
              title="Secure & Reliable"
              detail="Built for modern healthcare"
            />
            <Feature
              icon={<Activity size={20} />}
              title="Actionable Insights"
              detail="Better decisions, healthier outcomes"
            />
          </div>

          {/* Bottom Quote */}
          <blockquote>
            “Better care today.
            <br />
            A healthier tomorrow.”
          </blockquote>
        </div>
      </section>

      {/* =========================================================================
          RIGHT AUTH PANEL (Clean pure white form card)
          ========================================================================= */}
      <section className="auth-panel">
        {/* Mobile Brand (Only shown on small mobile screens when hero is hidden) */}
        <Link href="/" className="mobile-brand">
          <span className="brand-mark">m</span>
          <span>
            medrella<span className="brand-dot">.</span>
          </span>
        </Link>

        {/* Top-Right Pill: Need help? */}
        <a className="help-pill" href="mailto:support@medrella.com">
          <Headset size={15} />
          <span>Need help?</span>
        </a>

        {/* Main Form Card */}
        <div className="auth-card">
          <div className="form-heading">
            <h2>{isSignup ? "Create Account" : "Login"}</h2>
            <p>
              {isSignup
                ? "Join Medrella and be part of a smarter healthcare experience."
                : "Welcome back! Please sign in to continue to Medrella."}
            </p>
          </div>

          {/* Error / Notice Display */}
          {error && (
            <div className="form-notice error" role="alert">
              <div className="flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {notice && (
            <div className="form-notice success" role="status">
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Sign Up: First Name & Last Name row */}
            {isSignup && (
              <div className="name-row">
                <label className="input-wrap">
                  <UserRound size={17} className="input-icon" />
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
                  <UserRound size={17} className="input-icon" />
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

            {/* Email Field */}
            <label className="input-wrap">
              <Mail size={17} className="input-icon" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="Enter your email"
                aria-label="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            {/* Sign Up: Phone Field */}
            {isSignup && (
              <label className="input-wrap">
                <Phone size={17} className="input-icon" />
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="Enter your phone number"
                  aria-label="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            )}

            {/* Sign Up: Select your role Field with ChevronDown */}
            {isSignup && (
              <label className="input-wrap select-wrap">
                <UserRound size={17} className="input-icon" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  aria-label="Select your role"
                  className="role-select"
                >
                  <option value="Patient">Patient</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Receptionist">Receptionist</option>
                  <option value="Nurse">Nurse</option>
                  <option value="Clinic Staff">Clinic Staff</option>
                </select>
                <ChevronDown size={15} className="select-arrow" />
              </label>
            )}

            {/* Password Field */}
            <label className="input-wrap">
              <LockKeyhole size={17} className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "Create a password" : "Enter your password"}
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

            {/* Login Mode: Remember me + Forgot password? */}
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
                    setNotice("Password reset: Contact SP Delta Hospital clinical administrator at admin@medrella.com")
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Sign Up Mode: Terms Checkbox */}
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
                      setNotice("Terms of Service: Medrella HIPAA & clinical confidentiality agreement.");
                    }}
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="#privacy"
                    onClick={(e) => {
                      e.preventDefault();
                      setNotice("Privacy Policy: SP Delta Hospital encrypted health records guidelines.");
                    }}
                  >
                    Privacy Policy
                  </a>
                </span>
              </label>
            )}

            {/* Submit Button */}
            <button type="submit" className="primary-button" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{isSignup ? "Creating Account..." : "Signing in..."}</span>
                </>
              ) : (
                <>
                  <span>{isSignup ? "Create Account" : "Login"}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="divider">
            <span />
            <em>{isSignup ? "or sign up with" : "or continue with"}</em>
            <span />
          </div>

          {/* Social Row */}
          <div className="social-row">
            <button
              type="button"
              onClick={() =>
                setNotice("Google OAuth: Connected to Medrella SSO provider.")
              }
            >
              <span className="google-g">G</span>
              <span>Google</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setNotice("Microsoft Azure: Connected to SP Delta Hospital clinical directory.")
              }
            >
              <span className="microsoft-mark">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>Microsoft</span>
            </button>
          </div>

          {/* Switch Auth Prompt */}
          <p className="switch-auth">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <Link href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Login" : "Sign up"}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <footer className="auth-footer">
          <span>© 2026 Medrella. All rights reserved.</span>
          <div>
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                setNotice("Confidential hospital outpatient privacy guidelines apply.");
              }}
            >
              Privacy
            </a>
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                setNotice("Hospital appointment scheduling terms active.");
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
