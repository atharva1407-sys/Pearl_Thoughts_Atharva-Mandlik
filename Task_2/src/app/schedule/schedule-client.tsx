"use client";

import React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";

export function ScheduleClient() {
  const today = new Date();
  const currentDay = today.getDay(); // 0 is Sun, 1 is Mon
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  });

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekLabel = `Current Week (${monday.toLocaleDateString("en-US", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })})`;

  const timeRows = [
    "8:00 am",
    "9:00 am",
    "10:00 am",
    "11:00 am",
    "12:00 pm",
    "1:00 pm",
    "2:00 pm",
    "3:00 pm",
    "4:00 pm",
    "5:00 pm"
  ];

  return (
    <div className="space-y-6">
      {/* Schedule Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">DOCTOR APPOINTMENT CALENDAR</div>
          <h1>Weekly Schedule Matrix</h1>
          <p>7-day OPD consultation calendar and conflict-free booking matrix.</p>
        </div>
        <div className="heading-actions">
          <Link href="/doctors" className="btn primary">
            <Plus size={15} />
            <span>New Appointment</span>
          </Link>
        </div>
      </div>

      {/* Schedule Toolbar */}
      <div className="card schedule-toolbar flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button className="btn p-2" title="Previous Week">
            <ChevronLeft size={16} />
          </button>
          <button className="btn p-2" title="Next Week">
            <ChevronRight size={16} />
          </button>
          <b className="font-mono text-sm px-2">{weekLabel}</b>
          <button className="btn text-xs font-bold">Today</button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-50 text-xs">
            <span className="px-3 py-1 font-bold bg-white text-blue-700 rounded shadow-xs">
              Week
            </span>
            <span className="px-3 py-1 text-slate-500 hover:text-slate-800 cursor-pointer">
              Day
            </span>
          </div>

          <Link href="/doctors" className="btn text-xs">
            Filter by Doctor →
          </Link>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="card calendar-card">
        <div className="calendar-grid">
          <div className="calendar-head time-col">Time</div>
          {days.map((d) => (
            <div key={d} className="calendar-head">
              {d}
            </div>
          ))}

          {timeRows.map((t) => (
            <React.Fragment key={t}>
              <div className="time-cell font-mono">{t}</div>
              {days.map((d) => (
                <div key={`${t}-${d}`} className="calendar-cell">
                  {/* Clean open slot */}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Legend */}
        <div className="legend">
          <span>
            <i className="dot blue-dot" /> Consultation
          </span>
          <span>
            <i className="dot red-dot" /> Urgent Triage
          </span>
          <span>
            <i className="dot purple-dot" /> Procedure
          </span>
          <span>
            <i className="dot green-dot" /> Follow-up
          </span>
          <span>
            <i className="dot gray-dot" /> Open Slot
          </span>
        </div>
      </div>
    </div>
  );
}
