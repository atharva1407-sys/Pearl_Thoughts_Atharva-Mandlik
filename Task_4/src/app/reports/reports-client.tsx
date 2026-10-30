"use client";

import { useState } from "react";
import { FileText, RefreshCw, Download } from "lucide-react";

interface DoctorOption {
  id: string;
  name: string;
  specialization: string;
}

interface ReportsClientControlsProps {
  doctors: DoctorOption[];
  totalAppointments: number;
}

export function ReportsClientControls({
  doctors,
  totalAppointments,
}: ReportsClientControlsProps) {
  const [fromDate, setFromDate] = useState("2026-10-01");
  const [toDate, setToDate] = useState("2026-10-05");
  const [selectedDoctor, setSelectedDoctor] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [message, setMessage] = useState<string | null>(null);

  const handleGenerate = () => {
    if (totalAppointments === 0) {
      setMessage("No appointment records found for the selected filter range.");
    } else {
      setMessage(`Report refreshed: showing data from ${fromDate} to ${toDate}.`);
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleExportCSV = () => {
    if (totalAppointments === 0) {
      alert("No clinical appointment records available to export.");
      return;
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Appointment ID,Date,Start Time,End Time,Doctor ID,Patient ID,Status,Reason\n";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ruby_Hall_OPD_Census_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3">
      {/* Action button in heading */}
      <div className="flex justify-end -mt-12 mb-3">
        <button
          type="button"
          onClick={handleExportCSV}
          className="btn primary text-xs flex items-center gap-1.5"
          title="Export records to CSV"
        >
          <FileText size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="card grid grid-cols-2 sm:grid-cols-5 gap-3 items-end text-xs">
        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            From Date
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            To Date
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            Doctor
          </label>
          <select
            value={selectedDoctor}
            onChange={(e) => setSelectedDoctor(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          >
            <option value="ALL">All Doctors (Hospital-Wide)</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.name} ({doc.specialization})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-700 block mb-1">
            Status
          </label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed Visits</option>
            <option value="BOOKED">Booked / Queue</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          className="btn primary text-xs justify-center h-[34px] col-span-2 sm:col-span-1"
        >
          Generate Report
        </button>
      </div>

      {message && (
        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          {message}
        </div>
      )}
    </div>
  );
}
