"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { registerPatientAction, registerDoctorAction } from "@/actions/auth";

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
    <div className="max-w-lg mx-auto py-8">
      <div className="p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md space-y-6 shadow-xl">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs font-medium mb-1">
            <span>✨</span>
            <span>New Account</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Join Medrella</h1>
          <p className="text-xs text-zinc-400">
            Create an account to book consultations or manage hospital shifts
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-rose-800/60 bg-rose-950/40 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Role Toggle Switch */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setRole("PATIENT")}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              role === "PATIENT"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🧑‍💼 Register as Patient
          </button>
          <button
            type="button"
            onClick={() => setRole("DOCTOR")}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              role === "DOCTOR"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🩺 Register as Doctor
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">First Name</label>
              <input
                type="text"
                name="firstName"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Last Name</label>
              <input
                type="text"
                name="lastName"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Email Address</label>
            <input
              type="email"
              name="email"
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Password</label>
            <input
              type="password"
              name="password"
              minLength={6}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Phone Number</label>
            <input
              type="text"
              name="phone"
              required
              placeholder="+1 (555) 000-0000"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          {role === "DOCTOR" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Specialization</label>
                  <input
                    type="text"
                    name="specialization"
                    required
                    placeholder="e.g. Cardiology"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">License Number</label>
                  <input
                    type="text"
                    name="licenseNumber"
                    required
                    placeholder="MED-12345"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Experience (Years)</label>
                  <input
                    type="number"
                    name="experienceYears"
                    min={0}
                    defaultValue={5}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Consultation Fee ($)</label>
                  <input
                    type="number"
                    name="consultationFee"
                    min={1}
                    defaultValue={100}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Professional Bio</label>
                <textarea
                  name="bio"
                  rows={2}
                  placeholder="Summary of qualifications and clinical focus..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs transition-colors shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isPending ? "Creating Account..." : `Complete ${role === "PATIENT" ? "Patient" : "Doctor"} Registration`}
          </button>
        </form>

        <div className="text-center text-xs text-zinc-400">
          Already registered?{" "}
          <Link href="/login" className="text-white font-semibold hover:underline">
            Sign In here
          </Link>
        </div>
      </div>
    </div>
  );
}
