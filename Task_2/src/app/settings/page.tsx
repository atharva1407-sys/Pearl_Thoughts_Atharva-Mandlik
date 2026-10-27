"use client";

import Link from "next/link";
import {
  Settings,
  ShieldCheck,
  CheckCircle,
  Database,
  Building,
  Save
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">HOSPITAL CONFIGURATION</div>
          <h1>Hospital Workspace Settings</h1>
          <p>Configure facility profiles, OPD contact information, and infrastructure connections.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hospital Configuration Form */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="card-head">
            <div>
              <h2>Facility Information</h2>
              <p>Primary hospital branch settings</p>
            </div>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              alert("Hospital settings saved!");
            }}
          >
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Hospital Facility Name
              </label>
              <input
                type="text"
                defaultValue="SP Delta Hospital, T. Nagar"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Location / City
                </label>
                <input
                  type="text"
                  defaultValue="Chennai, Tamil Nadu"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Helpline Phone
                </label>
                <input
                  type="text"
                  defaultValue="+91 44 1234 5678"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Full Street Address
              </label>
              <input
                type="text"
                defaultValue="123, T. Nagar Main Road, Chennai – 600017"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Administrative Email
                </label>
                <input
                  type="email"
                  defaultValue="info@spdelta-hospital.medrella.com"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Timezone
                </label>
                <select className="w-full p-2.5 border border-slate-200 rounded-lg text-xs bg-white">
                  <option>(GMT+5:30) India Standard Time (IST)</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button type="submit" className="btn primary text-xs">
                <Save size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>

        {/* System Health Card */}
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>System Health & Status</h2>
              <p>Operational infrastructure</p>
            </div>
            <span className="badge green">Live</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Service Status</span>
              <span className="badge green">Operational</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Database Engine</span>
              <span className="font-bold text-slate-800 font-mono">PostgreSQL (Neon)</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">ORM & Query Layer</span>
              <span className="font-bold text-slate-800 font-mono">Drizzle ORM</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Session Security</span>
              <span className="font-bold text-emerald-700">JWT (HttpOnly Cookie)</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-slate-500">Registered Doctors</span>
              <b className="text-slate-900">5 Active Specialists</b>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <ShieldCheck size={16} className="text-blue-600" />
              <span>HIPAA Compliant Session Store</span>
            </div>
            <span>All appointments, doctor shifts, and patient records are validated with Zod schemas.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
