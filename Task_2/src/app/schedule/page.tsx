"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock3,
  Filter
} from "lucide-react";

export default function SchedulePage() {
  const days = [
    "Mon 5 Oct",
    "Tue 6 Oct",
    "Wed 7 Oct",
    "Thu 8 Oct",
    "Fri 9 Oct",
    "Sat 10 Oct",
    "Sun 11 Oct"
  ];

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
          <b className="font-mono text-sm px-2">5 – 11 Oct 2026</b>
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

          <select className="border border-slate-200 rounded-lg p-1.5 text-xs bg-white text-slate-800">
            <option>All Doctors (SP Delta)</option>
            <option>Dr. David Smith (Cardiology)</option>
            <option>Dr. Emily Chen (Dermatology)</option>
            <option>Dr. Michael Ross (Pediatrics)</option>
          </select>
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

          {/* 8:00 AM */}
          <div className="time-cell font-mono">8:00 am</div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Robert W.</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event">
              <b>Anita P.</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Lab Review</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>

          {/* 9:00 AM */}
          <div className="time-cell font-mono">9:00 am</div>
          <div className="calendar-cell">
            <div className="event">
              <b>Meena Joseph</b>
              <small>Pre-op · 30m</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Priya Sharma</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event">
              <b>Ravi Kumar</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event event-3">
              <b>Pre-Op Review</b>
              <small>Procedure</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event">
              <b>Sara Fathima</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>

          {/* 9:30 AM / 10:00 AM */}
          <div className="time-cell font-mono">10:00 am</div>
          <div className="calendar-cell">
            <div className="event event-2">
              <b>Gomathi K.</b>
              <small>Emergency BP</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event">
              <b>Arun Prakash</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Diya Natarajan</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event">
              <b>Sameer Joshi</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>

          {/* 11:00 AM */}
          <div className="time-cell font-mono">11:00 am</div>
          <div className="calendar-cell">
            <div className="event">
              <b>Diya Natarajan</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell">
            <div className="event">
              <b>Farah Khan</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event event-3">
              <b>Joint Injection</b>
              <small>Procedure</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>

          {/* 12:00 PM */}
          <div className="time-cell font-mono">12:00 pm</div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Rohit Kumar</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event">
              <b>Aisha Begum</b>
              <small>Consultation</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell">
            <div className="event event-1">
              <b>Kavitha Rao</b>
              <small>Follow-up</small>
            </div>
          </div>
          <div className="calendar-cell"></div>
          <div className="calendar-cell"></div>
        </div>

        {/* Legend */}
        <div className="legend">
          <span>
            <i className="dot blue-dot" /> Consultation
          </span>
          <span>
            <i className="dot red-dot" /> Antenatal / Urgent
          </span>
          <span>
            <i className="dot purple-dot" /> Procedure
          </span>
          <span>
            <i className="dot green-dot" /> Follow-up
          </span>
          <span>
            <i className="dot gray-dot" /> Unassigned
          </span>
        </div>
      </div>
    </div>
  );
}
