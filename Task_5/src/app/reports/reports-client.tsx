"use client";

import { useState } from "react";
import { FileText, RefreshCw, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        <Button variant="default"
          type="button"
          onClick={handleExportCSV}
          className="text-xs flex items-center gap-1.5"
          title="Export records to CSV"
        >
          <FileText size={14} />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Filter Row */}
      <Card className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end text-xs">
        <div>
          <Label className="text-[11px] font-bold text-slate-700 block mb-1">
            From Date
          </Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          />
        </div>

        <div>
          <Label className="text-[11px] font-bold text-slate-700 block mb-1">
            To Date
          </Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
          />
        </div>

        <div>
          <Label className="text-[11px] font-bold text-slate-700 block mb-1">
            Doctor
          </Label>
          <Select value={String(selectedDoctor)} onValueChange={(v) => setSelectedDoctor(v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Doctors (Hospital-Wide)</SelectItem>
              {doctors.map((doc) => (
              <SelectItem key={doc.id} value={doc.id}>
              {doc.name} ({doc.specialization})
              </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[11px] font-bold text-slate-700 block mb-1">
            Status
          </Label>
          <Select value={String(selectedStatus)} onValueChange={(v) => setSelectedStatus(v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="COMPLETED">Completed Visits</SelectItem>
              <SelectItem value="BOOKED">Booked / Queue</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="default"
          type="button"
          onClick={handleGenerate}
          className="text-xs justify-center h-[34px] col-span-2 sm:col-span-1"
        >
          Generate Report
        </Button>
      </Card>

      {message && (
        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          {message}
        </div>
      )}
    </div>
  );
}
