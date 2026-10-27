"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { ShieldCheck, LogIn, AlertCircle } from "lucide-react";

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
    <div className="max-w-md mx-auto my-auto py-10">
      <div className="card space-y-6 p-8 shadow-md">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
            <ShieldCheck size={14} />
            <span>Medrella Secure Access</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Sign In to Medrella</h1>
          <p className="text-xs text-slate-500 m-0">
            Access your patient appointments or physician shift portal at SP Delta Hospital
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
            onClick={() => handleRoleChange("PATIENT")}
            className={`py-2 rounded-md text-xs font-bold transition-all ${
              role === "PATIENT"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🧑‍💼 Patient
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange("DOCTOR")}
            className={`py-2 rounded-md text-xs font-bold transition-all ${
              role === "DOCTOR"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🩺 Doctor
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={`btn primary w-full justify-center py-2.5 text-xs font-bold ${
              isPending ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <LogIn size={14} />
            <span>{isPending ? "Authenticating..." : `Sign In as ${role}`}</span>
          </button>
        </form>

        {/* Pre-seeded credentials tip */}
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs space-y-1">
          <div className="font-bold text-blue-900">Pre-seeded Test Credentials:</div>
          <div className="text-[11px] text-slate-600">
            Click the role switcher above to test either account. Password:{" "}
            <code className="bg-white border border-blue-200 px-1 py-0.5 rounded font-mono text-blue-700">
              password123
            </code>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 pt-1">
          Don&apos;t have an account yet?{" "}
          <Link href="/register" className="text-blue-600 font-bold hover:underline">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
