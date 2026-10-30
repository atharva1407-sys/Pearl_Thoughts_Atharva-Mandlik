"use client";

import { useState, useTransition } from "react";
import {
  Save,
  RotateCcw,
  Trash2
} from "lucide-react";
import { restoreTestDataAction, clearTestDataAction } from "@/actions/seed";

export function SettingsClient({ isProduction }: { isProduction: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRestore = () => {
    startTransition(async () => {
      const res = await restoreTestDataAction();
      setStatusMessage(res.message || res.error || null);
      setTimeout(() => setStatusMessage(null), 3500);
    });
  };

  const handleClear = () => {
    if (!confirm("Are you sure you want to clear active data? This action cannot be undone.")) {
      return;
    }
    startTransition(async () => {
      const res = await clearTestDataAction();
      setStatusMessage(res.message || res.error || null);
      setTimeout(() => setStatusMessage(null), 3500);
    });
  };

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

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold">
          {statusMessage}
        </div>
      )}

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
                defaultValue="Ruby Hall, Pune"
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
                  defaultValue="Pune, Maharashtra"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Helpline Phone
                </label>
                <input
                  type="text"
                  defaultValue="+91 20 6645 5100"
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
                defaultValue="40, Sassoon Road, Sangamvadi, Pune – 411001"
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
                  defaultValue="info@rubyhall-pune.medrella.com"
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

        {/* System Health & Test Data Controls */}
        <div className="space-y-5">
          <div className="card space-y-4">
            <div className="card-head">
              <div>
                <h2>System Health &amp; Status</h2>
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
                <span className="text-slate-500">ORM &amp; Query Layer</span>
                <span className="font-bold text-slate-800 font-mono">Drizzle ORM</span>
              </div>

              <div className="flex justify-between items-center py-2">
                <span className="text-slate-500">Session Security</span>
                <span className="font-bold text-emerald-700">JWT (HttpOnly Cookie)</span>
              </div>
            </div>
          </div>

          {/* Test Data Controls (Development Only) */}
          <div className="card space-y-3">
            <div className="card-head">
              <div>
                <h2>Database Management</h2>
                <p>{isProduction ? "Live Production Database" : "Development Controls"}</p>
              </div>
              <span className={`badge ${isProduction ? "green" : "sky"}`}>
                {isProduction ? "Protected" : "Dev Only"}
              </span>
            </div>

            {isProduction ? (
              <p className="text-xs text-slate-500 m-0 leading-relaxed">
                Database wipe and seed mutations are strictly disabled in production to protect live clinical records. To update schema, run <code>npm run db:push</code> from an authorized CI/CD pipeline.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500 m-0 leading-relaxed">
                  Development controls for testing. In production, wipe and seed actions are permanently locked.
                </p>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleRestore}
                    className="btn primary text-xs justify-center cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>{isPending ? "Processing..." : "Seed Development Data"}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleClear}
                    className="btn text-xs justify-center text-slate-600 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Clear Dev Data</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
