"use client";

import Link from "next/link";
import {
  FileBarChart,
  Users,
  Stethoscope,
  Activity,
  CalendarDays,
  FileText,
  ArrowRight
} from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">HOSPITAL METRICS & ANALYTICS</div>
          <h1>Visit Reports & Census</h1>
          <p>Outpatient volume, consultation turnaround times, and departmental throughput.</p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => alert("CSV Export generated for October 2026.")}
          >
            <FileText size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="card grid grid-cols-2 sm:grid-cols-5 gap-3 items-end text-xs">
        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            From Date
          </label>
          <input
            type="date"
            defaultValue="2026-10-01"
            className="w-full p-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            To Date
          </label>
          <input
            type="date"
            defaultValue="2026-10-05"
            className="w-full p-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            Doctor
          </label>
          <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white">
            <option>All Doctors (Hospital-Wide)</option>
            <option>Cardiology OPD</option>
            <option>Dermatology OPD</option>
            <option>Pediatrics OPD</option>
            <option>General Medicine OPD</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            Status
          </label>
          <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white">
            <option>Completed Visits</option>
            <option>Booked / Pending</option>
            <option>Cancelled</option>
          </select>
        </div>
        <button
          type="button"
          className="btn primary text-xs justify-center h-[34px]"
          onClick={() => alert("Analytics report refreshed")}
        >
          Generate Report
        </button>
      </div>

      {/* 4 Stat Overview Cards */}
      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon">
              <Users />
            </span>
            <span className="badge green text-[10px]">+14% MoM</span>
          </div>
          <div className="stat-value">182</div>
          <div className="stat-label">Total Visits</div>
          <div className="stat-note">Selected October period</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-blue-600 bg-blue-50">
              <Stethoscope />
            </span>
            <span className="badge blue text-[10px]">68%</span>
          </div>
          <div className="stat-value">124</div>
          <div className="stat-label">Consultations</div>
          <div className="stat-note">Standard OPD consultations</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-purple-600 bg-purple-50">
              <Activity />
            </span>
            <span className="badge sky text-[10px]">15%</span>
          </div>
          <div className="stat-value">28</div>
          <div className="stat-label">Procedures</div>
          <div className="stat-note">In-clinic procedures</div>
        </div>

        <div className="card stat-card">
          <div className="stat-top">
            <span className="stat-icon text-emerald-600 bg-emerald-50">
              <CalendarDays />
            </span>
            <span className="badge green text-[10px]">16%</span>
          </div>
          <div className="stat-value">30</div>
          <div className="stat-label">Follow-ups</div>
          <div className="stat-note">Post-treatment checks</div>
        </div>
      </div>

      {/* Content Grid: Bar Chart & Category Breakdown */}
      <div className="content-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Visits Over Time</h2>
              <p>Daily patient volume · October 2026</p>
            </div>
            <span className="badge blue">Last 5 Days</span>
          </div>

          <div className="h-48 flex items-end justify-between gap-6 px-4 pb-2 border-b border-slate-100">
            <div className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700">31</span>
              <div className="w-full bg-blue-400 rounded-t" style={{ height: "78px" }}></div>
              <span className="text-[11px] text-slate-400">1 Oct</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700">42</span>
              <div className="w-full bg-blue-500 rounded-t" style={{ height: "105px" }}></div>
              <span className="text-[11px] text-slate-400">2 Oct</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700">28</span>
              <div className="w-full bg-blue-400 rounded-t" style={{ height: "70px" }}></div>
              <span className="text-[11px] text-slate-400">3 Oct</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700">35</span>
              <div className="w-full bg-blue-500 rounded-t" style={{ height: "88px" }}></div>
              <span className="text-[11px] text-slate-400">4 Oct</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-blue-700">46</span>
              <div className="w-full bg-blue-600 rounded-t" style={{ height: "120px" }}></div>
              <span className="text-[11px] font-bold text-blue-700">5 Oct (Today)</span>
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Visit Breakdown</h2>
              <p>Categorized by appointment type</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Consultation</span>
                <b className="text-slate-900">68%</b>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: "68%" }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Antenatal / OB</span>
                <b className="text-slate-900">18%</b>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-red-500 h-2 rounded-full" style={{ width: "18%" }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Follow-up</span>
                <b className="text-slate-900">9%</b>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full" style={{ width: "9%" }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Procedures</span>
                <b className="text-slate-900">5%</b>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: "5%" }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
