"use client";

import Link from "next/link";
import {
  Clock3,
  AlertCircle,
  ArrowRight,
  Filter,
  CheckCircle,
  Stethoscope,
  HeartPulse,
  ChevronRight
} from "lucide-react";

const queuePatients = [
  {
    token: "9",
    name: "Gomathi Krishnan",
    age: "34 F",
    id: "P-10026",
    reason: "Walk-in: headache and blurred vision, 33 weeks pregnant",
    status: "Emergency",
    time: "9:30 am",
    allergy: "Aspirin, Sulfa drugs"
  },
  {
    token: "3",
    name: "Meena Joseph",
    age: "68 F",
    id: "P-10023",
    reason: "Prolapse: fitness for surgery, HbA1c report",
    status: "In consult",
    time: "9:00 am",
    allergy: "Penicillin"
  },
  {
    token: "4",
    name: "Diya Natarajan",
    age: "13 F",
    id: "P-10104",
    reason: "Painful periods, missing school",
    status: "Waiting",
    time: "10:00 am"
  },
  {
    token: "5",
    name: "Venkatalakshmi Rajarajan",
    age: "45 F",
    id: "P-10031",
    reason: "Diabetes review and BP monitoring",
    status: "Waiting",
    time: "10:30 am"
  },
  {
    token: "7",
    name: "Arun Prakash",
    age: "60 M",
    id: "P-10077",
    reason: "Follow-up: hypertension and medication refill",
    status: "Waiting",
    time: "11:00 am"
  },
  {
    token: "10",
    name: "Priya Sharma",
    age: "29 F",
    id: "P-10088",
    reason: "Routine 2nd trimester antenatal check-up",
    status: "Waiting",
    time: "11:30 am"
  },
  {
    token: "12",
    name: "Rohit Kumar",
    age: "45 M",
    id: "P-10091",
    reason: "Post-surgery orthopedic suture inspection",
    status: "Waiting",
    time: "12:00 pm"
  }
];

export default function QueuePage() {
  return (
    <div className="space-y-6">
      {/* Queue Toolbar */}
      <div className="queue-toolbar">
        <div>
          <h2>Queue at SP Delta Hospital, T. Nagar</h2>
          <p>9:00 am to 1:00 pm · Token session, queue sorted by clinical triage</p>
        </div>
        <span className="badge green">
          <span className="live-dot" /> 5 waiting · Live
        </span>
      </div>

      <div className="queue-layout">
        {/* Left Side: Active Queue List */}
        <div className="card">
          <div className="card-head">
            <h2>Patients in queue</h2>
            <button className="btn text-xs">
              <Filter size={14} /> Filter
            </button>
          </div>

          <div className="space-y-1">
            {queuePatients.map((p) => {
              const isEmergency = p.status === "Emergency";
              const isInConsult = p.status === "In consult";

              return (
                <div
                  key={p.id}
                  className={`patient-row ${isEmergency ? "urgent-row rounded-lg" : ""}`}
                >
                  <div
                    className={`token ${
                      isEmergency
                        ? "bg-red-600 text-white"
                        : isInConsult
                        ? "bg-blue-600 text-white"
                        : ""
                    }`}
                  >
                    {p.token}
                  </div>

                  <div className="patient-main">
                    <strong>{p.name}</strong>
                    <small>
                      {p.age} · {p.id}
                    </small>
                    <span>{p.reason}</span>

                    <div className="chips">
                      <span
                        className={`badge ${
                          isEmergency ? "red" : isInConsult ? "blue" : "sky"
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.allergy && (
                        <span className="badge red">Allergy: {p.allergy}</span>
                      )}
                      {isEmergency && (
                        <span className="badge amber">Vitals recorded</span>
                      )}
                    </div>
                  </div>

                  <div className="patient-end">
                    <small>{p.time}</small>
                    <Link
                      href="/encounters"
                      className="icon-btn"
                      title="Open Encounter"
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Next Patient Priority Card */}
        <div className="card next-patient space-y-4">
          <div className="card-head">
            <div>
              <p className="text-xs text-slate-400">Next patient · Token 9</p>
              <h2>Gomathi Krishnan</h2>
            </div>
            <span className="badge red">Emergency</span>
          </div>

          <div className="emergency-box">
            <AlertCircle size={18} className="flex-shrink-0" />
            <div>
              <b>Emergency Override Triggered</b>
              <br />
              Patient 33 weeks pregnant with acute headache and BP 168/110 mmHg. Immediate clinical examination required.
            </div>
          </div>

          <div className="info-line">
            <span>Reason:</span>
            <b>Walk-in: headache and blurred vision, 33 weeks pregnant</b>
          </div>

          <div className="info-line">
            <span>Allergies:</span>
            <b className="text-red-600">Aspirin, Sulfa drugs</b>
          </div>

          <div className="info-line">
            <span>Vitals:</span>
            <b className="font-mono">BP 168/110 · HR 102 · Temp 99.1°F</b>
          </div>

          <div className="info-line">
            <span>Waiting:</span>
            <b>10 minutes (Priority 1)</b>
          </div>

          <div className="pt-2 space-y-2">
            <Link href="/encounters" className="btn primary w-full justify-center">
              <Stethoscope size={15} />
              <span>Open Patient Encounter</span>
              <ArrowRight size={15} />
            </Link>

            <Link href="/doctors" className="btn w-full justify-center text-xs">
              <span>Transfer to ICU / Specialist</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
