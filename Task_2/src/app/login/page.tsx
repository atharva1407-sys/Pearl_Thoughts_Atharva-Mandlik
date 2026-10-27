"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";

export default function LoginPage() {
  const [role, setRole] = useState<"PATIENT" | "DOCTOR">("PATIENT");
  const [email, setEmail] = useState("patient.john@medrella.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRoleChange = (newRole: "PATIENT" | "DOCTOR") => {
    setRole(newRole);
    if (newRole === "PATIENT") {
      setEmail("patient.john@medrella.com");
    } else {
      setEmail("doctor.smith@medrella.com");
    }
    setPassword("password123");
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("role", role);

    startTransition(async () => {
      const res = await loginAction(formData);
      if (res && !res.success) {
        setError(res.error || "Authentication failed.");
      }
    });
  };

  return (
    <div className="max-w-md mx-auto my-auto py-8">
      <div className="p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md space-y-6 shadow-xl">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-800/60 bg-indigo-950/40 text-indigo-300 text-xs font-medium">
            <span>✨</span>
            <span>Task 2 Authentication</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white">Sign In to Medrella</h1>
          <p className="text-xs text-zinc-400">
            Access your patient appointments or physician shift portal
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
            onClick={() => handleRoleChange("PATIENT")}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              role === "PATIENT"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🧑‍💼 Patient
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange("DOCTOR")}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              role === "DOCTOR"
                ? "bg-white text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🩺 Doctor
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-800 text-xs bg-zinc-950 text-white focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs transition-colors shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isPending ? "Signing In..." : `Sign In as ${role === "PATIENT" ? "Patient" : "Doctor"}`}
          </button>
        </form>

        <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 text-[11px] text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-300">Quick Test Credentials:</div>
          <div>Doctor: <code className="text-indigo-300">doctor.smith@medrella.com</code></div>
          <div>Patient: <code className="text-indigo-300">patient.john@medrella.com</code></div>
          <div>Password: <code className="text-zinc-200">password123</code></div>
        </div>

        <div className="text-center text-xs text-zinc-400">
          Need an account?{" "}
          <Link href="/register" className="text-white font-semibold hover:underline">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
