"use client";

import Link from "next/link";
import {
  Search,
  Plus,
  Printer,
  Clock3,
  AlertCircle,
  ArrowRight,
  UserCheck
} from "lucide-react";

export default function ReceptionPage() {
  const sessions = [
    {
      doctor: "Dr. David Smith",
      dept: "Cardiology",
      time: "9:00 am – 1:00 pm",
      booked: "18/24",
      walkin: "4/6",
      status: "20 min late",
      tone: "amber"
    },
    {
      doctor: "Dr. Emily Chen",
      dept: "Dermatology",
      time: "11:00 am – 1:00 pm",
      booked: "12/16",
      walkin: "2/4",
      status: "On time",
      tone: "green"
    },
    {
      doctor: "Dr. Michael Ross",
      dept: "Pediatrics",
      time: "1:00 pm – 4:00 pm",
      booked: "8/20",
      walkin: "0/5",
      status: "Upcoming shift",
      tone: "sky"
    },
    {
      doctor: "Dr. Anita Patel",
      dept: "Orthopedics",
      time: "5:00 pm – 7:30 pm",
      booked: "14/20",
      walkin: "1/4",
      status: "Evening shift",
      tone: "sky"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FRONT DESK & REGISTRATION</div>
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

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              alert("Walk-in token generated and queued for consultation.");
            }}
          >
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Patient Search / Phone
              </label>
              <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 bg-white">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter phone or patient name..."
                  className="w-full py-2 outline-none text-xs text-slate-800"
                  defaultValue="+91 98765 43210"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Clinical Department
              </label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800">
                <option>Cardiology (Dr. David Smith)</option>
                <option>Dermatology (Dr. Emily Chen)</option>
                <option>Pediatrics (Dr. Michael Ross)</option>
                <option>Orthopedics (Dr. Anita Patel)</option>
                <option>General Medicine (Dr. Robert Williams)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Chief Complaint / Triage Priority
              </label>
              <input
                type="text"
                placeholder="e.g. Acute chest discomfort, high fever"
                className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                defaultValue="Emergency BP monitoring & headache"
              />
            </div>

            <button type="submit" className="btn primary w-full justify-center">
              <Printer size={15} />
              <span>Issue Walk-in Token</span>
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Shortcut: Enter to Issue</span>
            <span>Token sequence: Auto #14</span>
          </div>
        </div>

        {/* Doctor OPD Sessions */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="card-head">
            <div>
              <h2>Today&apos;s Active Doctor OPD Shifts</h2>
              <p>4 consulting specialists scheduled for Monday, 5 October</p>
            </div>
            <Link href="/doctor/availability" className="btn text-xs">
              Manage Shifts →
            </Link>
          </div>

          <div className="space-y-3">
            {sessions.map((s, idx) => (
              <div
                key={s.doctor}
                className={`p-3.5 border rounded-lg flex items-center justify-between ${
                  idx === 0
                    ? "border-blue-200 bg-blue-50/40"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-slate-900 text-sm">{s.doctor}</b>
                    <span className="text-xs text-slate-500">· {s.dept}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Shift: {s.time}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Booked slots: <b>{s.booked}</b> · Walk-ins accepted: <b>{s.walkin}</b>
                  </div>
                </div>

                <div className="text-right space-y-2">
                  <span className={`badge ${s.tone}`}>{s.status}</span>
                  <div>
                    <Link
                      href="/queue"
                      className="text-xs font-bold text-blue-600 flex items-center gap-1 justify-end"
                    >
                      <span>Queue</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
