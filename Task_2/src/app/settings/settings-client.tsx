"use client";

import { useState, useTransition } from "react";
import {
  Save,
  RotateCcw,
  Trash2
} from "lucide-react";
import { restoreTestDataAction, clearTestDataAction } from "@/actions/seed";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
        <Card className="lg:col-span-2 space-y-4">
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
              <Label className="text-xs font-bold text-slate-700 block mb-1">
                Hospital Facility Name
              </Label>
              <Input
                type="text"
                defaultValue="Ruby Hall, Pune"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Location / City
                </Label>
                <Input
                  type="text"
                  defaultValue="Pune, Maharashtra"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Helpline Phone
                </Label>
                <Input
                  type="text"
                  defaultValue="+91 20 6645 5100"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 block mb-1">
                Full Street Address
              </Label>
              <Input
                type="text"
                defaultValue="40, Sassoon Road, Sangamvadi, Pune – 411001"
                className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Administrative Email
                </Label>
                <Input
                  type="email"
                  defaultValue="info@rubyhall-pune.medrella.com"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Timezone
                </Label>
                <Select defaultValue="(GMT+5:30) India Standard Time (IST)">
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="(GMT+5:30) India Standard Time (IST)">(GMT+5:30) India Standard Time (IST)</SelectItem>
                </SelectContent>
              </Select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button variant="default" type="submit" className="text-xs">
                <Save size={14} />
                <span>Save Changes</span>
              </Button>
            </div>
          </form>
        </Card>

        {/* System Health & Test Data Controls */}
        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="card-head">
              <div>
                <h2>System Health &amp; Status</h2>
                <p>Operational infrastructure</p>
              </div>
              <Badge variant="green">Live</Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500">Service Status</span>
                <Badge variant="green">Operational</Badge>
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
          </Card>

          {/* Test Data Controls (Development Only) */}
          <Card className="space-y-3">
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
                  <Button variant="default"
                    type="button"
                    disabled={isPending}
                    onClick={handleRestore}
                    className="text-xs justify-center cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>{isPending ? "Processing..." : "Seed Development Data"}</span>
                  </Button>

                  <Button variant="outline"
                    type="button"
                    disabled={isPending}
                    onClick={handleClear}
                    className="text-xs justify-center text-slate-600 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Clear Dev Data</span>
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
