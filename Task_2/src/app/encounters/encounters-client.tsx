"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Stethoscope,
  HeartPulse,
  ClipboardList,
  FileText,
  Check,
  User,
} from "lucide-react";

export function EncountersClient() {
  const [patientName, setPatientName] = useState("");
  const [complaint, setComplaint] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");

  const handleComplete = () => {
    if (!patientName.trim()) {
      alert("Please specify the patient name or ID.");
      return;
    }
    alert(`Consultation completed for ${patientName} and saved to EHR!`);
  };

  return (
    <div className="space-y-6">
      {/* Patient Header Card */}
      <div className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="avatar w-11 h-11 bg-blue-100 text-blue-700 font-bold">
            <User size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 m-0">Clinical Encounter Workspace</h2>
              <span className="badge amber text-[10px] px-1.5 py-0.5">Clinical Preview</span>
            </div>
            <p className="text-xs text-slate-400 m-0 mt-0.5">
              Doctor consultation charting, SOAP progress notes, and vitals recording
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/queue" className="btn text-xs">
            Back to Queue
          </Link>
          <Link href="/doctors" className="btn primary text-xs">
            Browse Specialists
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
        </div>

        {/* Center: SOAP Charting Form */}
        <div className="lg:col-span-2 card space-y-4">
          <div className="card-head">
            <div>
              <h2>SOAP Progress Notes</h2>
              <p>Clinical record entry</p>
            </div>
            <span className="badge sky">New Visit</span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Patient Name / ID *
            </label>
            <input
              type="text"
              required
              placeholder="Enter patient full name or Patient ID..."
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Chief Complaint
            </label>
            <textarea
              rows={2}
              placeholder="Record the patient's primary symptoms and reason for visit..."
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Objective &amp; Examination Notes
            </label>
            <textarea
              rows={4}
              placeholder="Clinical examination findings, heart sounds, lung sounds, reflexes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                ICD-10 Diagnosis
              </label>
              <input
                type="text"
                placeholder="e.g. I10 - Essential hypertension"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Triage Priority
              </label>
              <select className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white">
                <option>Routine Level 3</option>
                <option>Urgent Level 2</option>
                <option>Emergency Level 1</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Treatment Plan &amp; Medication
            </label>
            <textarea
              rows={3}
              placeholder="Prescribed medications, dosage instructions, and follow-up guidance..."
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="form-actions flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              className="btn text-xs"
              onClick={() => alert("Draft saved locally.")}
            >
              Save Draft
            </button>
            <button
              type="button"
              className="btn primary text-xs"
              onClick={handleComplete}
            >
              <Check size={14} />
              <span>Complete Consultation</span>
            </button>
          </div>
        </div>

        {/* Right Side: Vitals Entry */}
        <div className="card space-y-4">
          <div className="card-head">
            <div>
              <h2>Patient Vitals</h2>
              <p>Entry panel</p>
            </div>
            <span className="badge green">Triage</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Blood Pressure (mmHg)
              </label>
              <input
                type="text"
                placeholder="120 / 80"
                className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Heart Rate (bpm)
              </label>
              <input
                type="text"
                placeholder="72"
                className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Temperature (°F)
              </label>
              <input
                type="text"
                placeholder="98.6"
                className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                SpO₂ Oxygen (%)
              </label>
              <input
                type="text"
                placeholder="99"
                className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Weight (kg)
              </label>
              <input
                type="text"
                placeholder="70"
                className="w-full p-2 border border-slate-200 rounded-lg font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
