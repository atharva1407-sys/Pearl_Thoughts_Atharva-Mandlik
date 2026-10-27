"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Search,
  Plus,
  Printer,
} from "lucide-react";

export function ReceptionClient() {
  const [phone, setPhone] = useState("");
  const [complaint, setComplaint] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      alert("Please enter patient phone or name.");
      return;
    }
    const tokenNum = Math.floor(Math.random() * 80) + 10;
    setIssuedToken(`Token #${tokenNum}`);
  };

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span>FRONT DESK &amp; REGISTRATION</span>
            <span className="badge amber text-[10px] px-1.5 py-0.5">Ops Preview</span>
          </div>
          <h1>Reception Desk</h1>
          <p>Walk-in patient registration, token printing, and OPD doctor shift coordination.</p>
        </div>
        <div className="heading-actions">
          <Link href="/doctors" className="btn primary">
            <Plus size={15} />
            <span>Schedule Booking</span>
          </Link>
        </div>
      </div>

      <div className="reception-grid grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Walk-in Form Card */}
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Walk-in Token Allocation</h2>
              <p>Issue token for unbooked outpatient arrival</p>
            </div>
          </div>

          {issuedToken && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
              <span><b>{issuedToken}</b> issued successfully!</span>
              <button
                type="button"
                onClick={() => setIssuedToken(null)}
                className="text-xs font-bold text-emerald-700 underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}

          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Patient Search / Phone *
              </label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 bg-white">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Enter patient name or phone number..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full py-2 outline-none text-xs text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Clinical Department
              </label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800">
                <option>General Medicine</option>
                <option>Cardiology</option>
                <option>Dermatology</option>
                <option>Pediatrics</option>
                <option>Orthopedics</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Chief Complaint / Symptoms
              </label>
              <input
                type="text"
                placeholder="Enter symptoms or reason for visit..."
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <button type="submit" className="btn primary w-full justify-center">
              <Printer size={15} />
              <span>Issue Walk-in Token</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Shortcut: Enter to Issue</span>
            <span>Facility: Ruby Hall, Pune</span>
          </div>
        </div>

        {/* Doctor OPD Sessions */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="card-head">
            <div>
              <h2>OPD Department Shift Overview</h2>
              <p>Active consulting specialist shifts at Ruby Hall, Pune</p>
            </div>
            <Link href="/doctor/availability" className="btn text-xs">
              Manage Shifts →
            </Link>
          </div>

          <div className="p-4 border border-slate-200 bg-slate-50/50 rounded-lg text-xs text-slate-600 space-y-2">
            <div className="font-bold text-slate-900 text-sm">Outpatient Clinic Hours:</div>
            <p className="m-0 leading-relaxed">
              Morning session: 09:00 AM – 01:00 PM · Afternoon session: 02:00 PM – 05:00 PM. Registered doctors configure recurring availability shifts under Weekly Shifts.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">Need to book an advance appointment?</span>
            <Link href="/doctors" className="btn primary text-xs">
              Browse Specialists →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
