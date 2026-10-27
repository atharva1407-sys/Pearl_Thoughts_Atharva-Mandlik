"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerPatientAction, registerDoctorAction } from "@/actions/auth";
import { ShieldCheck, UserPlus, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const [role, setRole] = useState<"PATIENT" | "DOCTOR">("PATIENT");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      let res;
      if (role === "PATIENT") {
        res = await registerPatientAction(formData);
      } else {
        res = await registerDoctorAction(formData);
      }
      if (res && !res.success) {
        setError(res.error || "Registration failed.");
      }
    });
  };

  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="card space-y-6 p-8 shadow-md">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 mb-1">
            <ShieldCheck size={14} />
            <span>New Medrella Account</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Join Medrella Healthcare</h1>
          <p className="text-xs text-slate-500 m-0">
            Create your profile to book clinical appointments or configure hospital shifts
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Role Toggle Switch */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setRole("PATIENT")}
            className={`py-2 rounded-md text-xs font-bold transition-all ${
              role === "PATIENT"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🧑‍💼 Register as Patient
          </button>
          <button
            type="button"
            onClick={() => setRole("DOCTOR")}
            className={`py-2 rounded-md text-xs font-bold transition-all ${
              role === "DOCTOR"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🩺 Register as Doctor
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">First Name *</label>
              <input
                type="text"
                name="firstName"
                required
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Last Name *</label>
              <input
                type="text"
                name="lastName"
                required
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email Address *</label>
            <input
              type="email"
              name="email"
              required
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Password *</label>
              <input
                type="password"
                name="password"
                required
                minLength={6}
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number *</label>
              <input
                type="tel"
                name="phone"
                required
                placeholder="+1 (555) 000-0000"
                className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
              />
            </div>
          </div>

          {/* Conditional Doctor Fields */}
          {role === "DOCTOR" && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Specialization *</label>
                  <select
                    name="specialization"
                    required
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                  >
                    <option value="Cardiology">Cardiology</option>
                    <option value="Dermatology">Dermatology</option>
                    <option value="Pediatrics">Pediatrics</option>
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="General Medicine">General Medicine</option>
                    <option value="Obstetrics & Gynaecology">Obstetrics & Gynaecology</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">License Number *</label>
                  <input
                    type="text"
                    name="licenseNumber"
                    required
                    placeholder="e.g. CARD-99210"
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Experience (Years) *</label>
                  <input
                    type="number"
                    name="experienceYears"
                    required
                    min={1}
                    max={50}
                    defaultValue={5}
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Consultation Fee ($) *</label>
                  <input
                    type="number"
                    name="consultationFee"
                    required
                    min={10}
                    max={1000}
                    defaultValue={100}
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Doctor Biography</label>
                <textarea
                  name="bio"
                  rows={2}
                  placeholder="Brief clinical overview and specialty background..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                />
              </div>
            </div>
          )}

          {/* Conditional Patient Fields */}
          {role === "PATIENT" && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Date of Birth</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Gender</label>
                <select
                  name="gender"
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className={`btn primary w-full justify-center py-2.5 text-xs font-bold ${
              isPending ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <UserPlus size={14} />
            <span>{isPending ? "Creating Account..." : `Register as ${role}`}</span>
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-1">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-600 font-bold hover:underline">
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}
