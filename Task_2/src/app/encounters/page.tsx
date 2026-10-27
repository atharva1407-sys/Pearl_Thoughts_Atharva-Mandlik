"use client";

import Link from "next/link";
import {
  Stethoscope,
  HeartPulse,
  ClipboardList,
  FileText,
  CalendarDays,
  AlertCircle,
  Check,
  ChevronRight,
  ArrowRight
} from "lucide-react";

export default function EncountersPage() {
  return (
    <div className="space-y-6">
      {/* Patient Banner */}
      <div className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-l-4 border-l-red-500">
        <div className="flex items-center gap-4">
          <div className="avatar w-12 h-12 bg-red-100 text-red-700 font-bold text-base">
            GK
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 m-0">Gomathi Krishnan</h2>
              <span className="badge red">High-Risk Pregnancy</span>
            </div>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              P-10026 · 34 years · Female · Token #9 · T. Nagar, Chennai
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/queue" className="btn text-xs">
            Back to Queue
          </Link>
          <Link href="/reports" className="btn text-xs">
            Visit History
          </Link>
        </div>
      </div>

      {/* Encounter Layout: 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left Side: Navigation Tabs */}
        <div className="card space-y-1 p-2">
          <button className="nav-item active text-xs">
            <Stethoscope size={15} />
            <span>Consultation Notes</span>
          </button>
          <button className="nav-item text-xs">
            <HeartPulse size={15} />
            <span>Vitals Entry</span>
          </button>
          <button className="nav-item text-xs">
            <ClipboardList size={15} />
            <span>Lab Orders</span>
          </button>
          <button className="nav-item text-xs">
            <FileText size={15} />
            <span>Prescriptions</span>
          </button>
          <button className="nav-item text-xs">
            <CalendarDays size={15} />
            <span>Follow-up Booking</span>
          </button>
        </div>

        {/* Center: SOAP Charting Form */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="card-head">
            <div>
              <h2>Clinical Consultation Notes (SOAP)</h2>
              <p>Doctor Divya Nair · Obstetric Consultation</p>
            </div>
            <span className="badge amber">In Progress</span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Chief Complaint
            </label>
            <textarea
              rows={2}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              defaultValue="Severe frontal headache, epigastric discomfort, and intermittent blurred vision since this morning. 33 weeks pregnant."
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Objective & Clinical Examination Notes
            </label>
            <textarea
              rows={4}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              defaultValue="BP 168/110 mmHg on repeated measurement. Fetal heart rate 144 bpm regular. Trace pedal edema present. Advised urgent admission and obstetric monitoring."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                ICD-10 Diagnosis
              </label>
              <input
                type="text"
                className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                defaultValue="O14.1 - Severe pre-eclampsia"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Triage Level
              </label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white">
                <option>Emergency Level 1 (Immediate)</option>
                <option>Urgent Level 2</option>
                <option>Routine Level 3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Treatment Plan & Medication
            </label>
            <textarea
              rows={3}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              defaultValue="Labetalol 100 mg orally stat. Urine dipstick for proteinuria. Emergency obstetric admission to Wing B."
            />
          </div>

          <div className="form-actions flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Link href="/queue" className="btn text-xs">
              Save Draft
            </Link>
            <button
              type="button"
              className="btn primary text-xs"
              onClick={() => alert("Encounter completed and saved to EHR!")}
            >
              <Check size={14} />
              <span>Complete Consultation</span>
            </button>
          </div>
        </div>

        {/* Right Side: Vitals Display */}
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Patient Vitals</h2>
              <p>Recorded 9:24 am</p>
            </div>
            <span className="badge red">Critical</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Blood Pressure</span>
              <span className="font-bold text-red-600 font-mono text-sm">
                168 / 110 mmHg
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Heart Rate</span>
              <span className="font-bold text-slate-800">102 bpm</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Temperature</span>
              <span className="font-bold text-slate-800">99.1 °F</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">SpO₂ Oxygen</span>
              <span className="font-bold text-slate-800">98 %</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-slate-500">Weight</span>
              <span className="font-bold text-slate-800">72 kg</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-slate-500">Height</span>
              <span className="font-bold text-slate-800">162 cm</span>
            </div>
          </div>

          <button
            type="button"
            className="btn w-full text-xs justify-center"
            onClick={() => alert("Vitals editor opened")}
          >
            + Update Vitals
          </button>
        </div>
      </div>
    </div>
  );
}
